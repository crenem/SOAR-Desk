//! ZITADEL (OIDC) authorization-code + PKCE with a single-use loopback
//! callback. Local operator enrollment is required first; login from an
//! unlinked external subject NEVER creates an account or grants case access.
use openidconnect::{
    core::{CoreAuthenticationFlow,CoreClient,CoreProviderMetadata},
    reqwest,AccessTokenHash,AuthorizationCode,ClientId,CsrfToken,IssuerUrl,
    Nonce,PkceCodeChallenge,PkceCodeVerifier,RedirectUrl,Scope,TokenResponse,OAuth2TokenResponse,
};
use serde::{Deserialize,Serialize};
use std::{
    fs,io::{Read,Write},net::{TcpListener,TcpStream},
    sync::{Mutex,OnceLock},
    thread,time::{Duration,Instant},
};
use openidconnect::url::Url;

const REDIRECT:&str="http://127.0.0.1:8765/callback";
const TIMEOUT:Duration=Duration::from_secs(180);
#[derive(Serialize,Deserialize,Clone)]
#[serde(deny_unknown_fields)]
pub struct ZitadelConfig {
    version:u32,
    issuer:String,
    client_id:String,
}
#[derive(Serialize)]
pub struct ZitadelSettings{
    configured:bool,issuer:Option<String>,client_id:Option<String>,
    redirect_uri:&'static str,
}
#[derive(Deserialize)]
pub struct SetSettings{issuer:String,client_id:String}
#[derive(Deserialize)]
pub struct BeginRequest{mode:String}
#[derive(Serialize)]
pub struct AuthorizationStart{url:String,expires_seconds:u64}
#[derive(Serialize)]
pub struct AuthorizationProgress{state:&'static str}

struct Pending {
    started:Instant,
    mode:String,
    issuer:String,
    client_id:String,
    csrf:String,
    nonce:String,
    verifier:String,
    callback:Option<String>,
    failure:Option<String>,
}
static PENDING:OnceLock<Mutex<Option<Pending>>>=OnceLock::new();
fn pending()->&'static Mutex<Option<Pending>>{
    PENDING.get_or_init(||Mutex::new(None))
}
fn config_path()->Result<std::path::PathBuf,String>{
    Ok(crate::operator_auth::private_directory()?.join("zitadel.json"))
}
fn valid_issuer(raw:&str)->Result<String,String>{
    let url=Url::parse(raw).map_err(|_|"Enter a complete ZITADEL issuer URL.")?;
    if url.scheme()!="https" || url.host_str().is_none()
        || !url.username().is_empty()||url.password().is_some()
        || url.query().is_some()||url.fragment().is_some()
        || url.path()!="/" {
        return Err("Issuer must be an HTTPS origin, with no path, credentials or query.".into());
    }
    if matches!(url.host_str(),Some("localhost"|"127.0.0.1"|"::1")){
        return Err("Use a trusted HTTPS ZITADEL instance, not loopback.".into());
    }
    Ok(url.origin().ascii_serialization())
}
fn read_settings()->Result<Option<ZitadelConfig>,String>{
    let path=config_path()?;
    let meta=match fs::symlink_metadata(&path){
        Ok(meta)=>meta,
        Err(err) if err.kind()==std::io::ErrorKind::NotFound=>return Ok(None),
        Err(_)=>return Err("Cannot inspect ZITADEL settings.".into()),
    };
    if !meta.file_type().is_file()||meta.len()>4096 {
        return Err("ZITADEL configuration is not a valid regular file.".into());
    }
    #[cfg(unix)]{
        use std::os::unix::fs::PermissionsExt;
        if meta.permissions().mode()&0o077!=0 {
            return Err("ZITADEL configuration permissions are too broad.".into());
        }
    }
    let raw=fs::read(path).map_err(|_|"Cannot read ZITADEL configuration.".to_string())?;
    let value:ZitadelConfig=serde_json::from_slice(&raw)
        .map_err(|_|"Invalid ZITADEL configuration.".to_string())?;
    if value.version!=1||valid_issuer(&value.issuer)?!=value.issuer||
       value.client_id.is_empty()||value.client_id.len()>512 {
        return Err("Invalid ZITADEL configuration fields.".into());
    }
    Ok(Some(value))
}
#[tauri::command]
pub fn zitadel_settings()->Result<ZitadelSettings,String>{
    let config=read_settings()?;
    Ok(ZitadelSettings{
        configured:config.is_some(),
        issuer:config.as_ref().map(|c|c.issuer.clone()),
        client_id:config.as_ref().map(|c|c.client_id.clone()),
        redirect_uri:REDIRECT,
    })
}
#[tauri::command]
pub fn configure_zitadel(request:SetSettings)->Result<ZitadelSettings,String>{
    crate::operator_auth::require_operator()?;
    let issuer=valid_issuer(request.issuer.trim())?;
    let client_id=request.client_id.trim();
    if client_id.is_empty()||client_id.len()>512||client_id.chars().any(char::is_control){
        return Err("Client ID must be a public ZITADEL Native application identifier.".into());
    }
    let config=ZitadelConfig{version:1,issuer,client_id:client_id.into()};
    let bytes=serde_json::to_vec(&config).map_err(|_|"Could not serialize settings.".to_string())?;
    let dest=config_path()?;
    let parent=dest.parent().ok_or("Missing configuration directory.")?;
    let mut tempfile=tempfile::Builder::new().prefix(".zitadel-").tempfile_in(parent)
        .map_err(|_|"Cannot create local configuration.".to_string())?;
    #[cfg(unix)]{
        use std::os::unix::fs::PermissionsExt;
        tempfile.as_file().set_permissions(fs::Permissions::from_mode(0o600))
          .map_err(|_|"Cannot restrict configuration permissions.".to_string())?;
    }
    tempfile.write_all(&bytes).and_then(|_|tempfile.as_file().sync_all())
        .map_err(|_|"Cannot save ZITADEL settings.".to_string())?;
    tempfile.persist(&dest).map_err(|_|"Cannot commit ZITADEL settings.".to_string())?;
    let mut guard=pending().lock().map_err(|_|"Authorization state unavailable.")?;
    *guard=None;
    drop(guard);
    zitadel_settings()
}
fn http_client()->Result<reqwest::blocking::Client,String>{
    reqwest::blocking::ClientBuilder::new()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(15))
        .build().map_err(|_|"Cannot create secure OIDC HTTP client.".into())
}
fn callback_message(mut connection:TcpStream,expected_state:&str)->Option<Result<String,String>>{
    connection.set_read_timeout(Some(Duration::from_secs(3))).ok()?;
    let mut buffer=[0u8;8192];
    let n=connection.read(&mut buffer).ok()?;
    let request=std::str::from_utf8(&buffer[..n]).ok()?;
    let raw=request.lines().next()?.split_whitespace().collect::<Vec<_>>();
    if raw.len()!=3||raw[0]!="GET"||!raw[2].starts_with("HTTP/1."){return None;}
    let path=Url::parse(&format!("http://127.0.0.1:8765{}",raw[1])).ok()?;
    if path.path()!="/callback"{
        let _=connection.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
        return None;
    }
    let mut state=None;
    let mut code=None;
    let mut failure=None;
    for (key,value) in path.query_pairs(){
        match key.as_ref(){
            "state" if state.is_none()=>state=Some(value.into_owned()),
            "code" if code.is_none()=>code=Some(value.into_owned()),
            "error" if failure.is_none()=>failure=Some(value.into_owned()),
            "state"|"code"|"error"=>return None,
            _=>{}
        }
    }
    if state.as_deref()!=Some(expected_state){
        let _=connection.write_all(b"HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
        return None;
    }
    let response=b"HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nCache-Control: no-store\r\nContent-Security-Policy: default-src 'none'\r\nConnection: close\r\n\r\n<!doctype html><title>SOAR Desk</title><p>Return to SOAR Desk to complete sign-in. You can close this tab.</p>";
    let _=connection.write_all(response);
    if let Some(failure)=failure{return Some(Err(format!("Identity provider refused authorization: {failure}")))}
    Some(code.filter(|s|!s.is_empty()&&s.len()<=4096)
        .ok_or("Provider callback did not contain a usable authorization code.".into()))
}
#[tauri::command]
pub fn begin_zitadel_auth(request:BeginRequest)->Result<AuthorizationStart,String>{
    if request.mode!="link"&&request.mode!="login"{return Err("Unknown identity action.".into())}
    if request.mode=="link"{crate::operator_auth::require_operator()?;}
    let config=read_settings()?.ok_or("Configure a ZITADEL Native OIDC application first.")?;
    let http=http_client()?;
    let provider=CoreProviderMetadata::discover(
        &IssuerUrl::new(config.issuer.clone()).map_err(|_|"Invalid configured issuer.")?,&http)
        .map_err(|_|"Cannot discover ZITADEL OIDC metadata over HTTPS.".to_string())?;
    let client=CoreClient::from_provider_metadata(
        provider,ClientId::new(config.client_id.clone()),None)
        .set_redirect_uri(RedirectUrl::new(REDIRECT.to_string())
           .map_err(|_|"Invalid configured loopback callback.")?);
    let listener=TcpListener::bind("127.0.0.1:8765")
        .map_err(|_|"Local callback port 8765 is occupied. Close the other application and retry.".to_string())?;
    listener.set_nonblocking(true).map_err(|_|"Cannot initialize OIDC callback listener.")?;
    let (challenge,verifier)=PkceCodeChallenge::new_random_sha256();
    let (url,csrf,nonce)=client
       .authorize_url(CoreAuthenticationFlow::AuthorizationCode,
           CsrfToken::new_random,Nonce::new_random)
       .add_scope(Scope::new("profile".into()))
       .set_pkce_challenge(challenge)
       .url();
    let expected_state=csrf.secret().clone();
    {
        let mut guard=pending().lock().map_err(|_|"Authorization state unavailable.")?;
        if guard.as_ref().is_some_and(|p|p.started.elapsed()<TIMEOUT &&
            p.callback.is_none()&&p.failure.is_none()){
            return Err("A ZITADEL sign-in is already pending.".into());
        }
        *guard=Some(Pending{
            started:Instant::now(),mode:request.mode,
            issuer:config.issuer,client_id:config.client_id,
            csrf:expected_state.clone(),
            nonce:nonce.secret().clone(),verifier:verifier.secret().clone(),
            callback:None,failure:None
        });
    }
    thread::spawn(move||{
        while let Ok(guard)=pending().lock(){
            if !guard.as_ref().is_some_and(|p|p.csrf==expected_state&&p.started.elapsed()<TIMEOUT){
                break;
            }
            drop(guard);
            match listener.accept(){
                Ok((stream,_))=>{
                    if let Some(result)=callback_message(stream,&expected_state){
                        if let Ok(mut state)=pending().lock(){
                            if let Some(p)=state.as_mut().filter(|p|p.csrf==expected_state){
                                match result{Ok(code)=>p.callback=Some(code),Err(err)=>p.failure=Some(err)}
                            }
                        }
                        break;
                    }
                }
                Err(err) if err.kind()==std::io::ErrorKind::WouldBlock=>{
                    thread::sleep(Duration::from_millis(100));
                }
                Err(_)=>break,
            }
        }
    });
    let url_string=url.to_string();
    // The system browser (not an embedded WebView) handles credentials and MFA.
    // A visible link is returned even if no browser handler is configured.
    let _=std::process::Command::new("xdg-open").arg(&url_string).spawn();
    Ok(AuthorizationStart{url:url_string,expires_seconds:TIMEOUT.as_secs()})
}
#[tauri::command]
pub fn zitadel_auth_progress()->Result<AuthorizationProgress,String>{
    let mut guard=pending().lock().map_err(|_|"Authorization state unavailable.")?;
    let state=match guard.as_ref(){
        None=>"idle",
        Some(p) if p.started.elapsed()>=TIMEOUT=>"expired",
        Some(p) if p.failure.is_some()=>"failed",
        Some(p) if p.callback.is_some()=>"ready",
        Some(_)=>"pending",
    };
    if state=="expired"{*guard=None;}
    Ok(AuthorizationProgress{state})
}
#[tauri::command]
pub fn complete_zitadel_auth()->Result<crate::operator_auth::OperatorStatus,String>{
    let result={
        let mut guard=pending().lock().map_err(|_|"Authorization state unavailable.")?;
        if guard.as_ref().is_none_or(|p|p.callback.is_none()&&p.failure.is_none()){
            return Err("No ZITADEL browser callback has been received.".into());
        }
        guard.take().ok_or("No pending sign-in.")?
    };
    if result.started.elapsed()>=TIMEOUT{return Err("OIDC sign-in expired. Start again.".into())}
    if let Some(error)=result.failure{return Err(error)}
    if result.mode=="link"{crate::operator_auth::require_operator()?;}
    let code=result.callback.ok_or("No validated authorization code received.")?;
    let http=http_client()?;
    let provider=CoreProviderMetadata::discover(
        &IssuerUrl::new(result.issuer.clone()).map_err(|_|"Invalid issuer.")?,&http)
        .map_err(|_|"Cannot verify the configured provider metadata.".to_string())?;
    let client=CoreClient::from_provider_metadata(
        provider,ClientId::new(result.client_id),None)
        .set_redirect_uri(RedirectUrl::new(REDIRECT.into()).map_err(|_|"Invalid redirect.")?);
    let reply=client.exchange_code(AuthorizationCode::new(code))
        .map_err(|_|"ZITADEL token exchange is unavailable.")?
        .set_pkce_verifier(PkceCodeVerifier::new(result.verifier))
        .request(&http).map_err(|_|"ZITADEL refused code exchange or PKCE verification.".to_string())?;
    let token=reply.id_token().ok_or("ZITADEL returned no signed ID token.")?;
    let verifier=client.id_token_verifier();
    let claims=token.claims(&verifier,&Nonce::new(result.nonce))
        .map_err(|_|"Identity token failed signature, issuer, audience, expiry or nonce validation.".to_string())?;
    if let Some(at_hash)=claims.access_token_hash(){
        let computed=AccessTokenHash::from_token(
            reply.access_token(),token.signing_alg().map_err(|_|"Unusable token algorithm.")?,
            token.signing_key(&verifier).map_err(|_|"Unusable signing key.")?)
          .map_err(|_|"Cannot verify access token hash.")?;
        if computed!=*at_hash {return Err("Access token binding validation failed.".into());}
    }
    let sub=claims.subject().as_str();
    if result.mode=="link"{
        crate::operator_auth::link_oidc_identity(&result.issuer,sub)
    }else{
        crate::operator_auth::login_linked_oidc(&result.issuer,sub)
    }
}
#[cfg(test)]
mod tests{
    use super::*;
    #[test]
    fn issuer_must_be_https_origin(){
        assert_eq!(valid_issuer("https://example.zitadel.cloud").unwrap(),"https://example.zitadel.cloud");
        assert!(valid_issuer("http://example.com").is_err());
        assert!(valid_issuer("https://example.com/admin").is_err());
        assert!(valid_issuer("https://name:secret@example.com").is_err());
    }
    #[test]
    fn loopback_callback_rejects_untrusted_state(){
        assert_eq!(REDIRECT,"http://127.0.0.1:8765/callback");
        fn check(request:&str,state:&str)->Option<Result<String,String>>{
            let server=TcpListener::bind("127.0.0.1:0").unwrap();
            let addr=server.local_addr().unwrap();
            let request=request.to_string();
            let sender=thread::spawn(move||{
                let mut stream=TcpStream::connect(addr).unwrap();
                stream.write_all(request.as_bytes()).unwrap();
            });
            let (conn,_)=server.accept().unwrap();
            let result=callback_message(conn,state);
            sender.join().unwrap();
            result
        }
        assert!(check("GET /callback?state=wrong&code=stolen HTTP/1.1\r\nHost: localhost\r\n\r\n","expected").is_none());
        assert!(check("GET /wrong?state=ok&code=value HTTP/1.1\r\nHost: localhost\r\n\r\n","ok").is_none());
        assert_eq!(check("GET /callback?state=ok&code=one HTTP/1.1\r\nHost: localhost\r\n\r\n","ok").unwrap().unwrap(),"one");
        assert!(check("GET /callback?state=ok&code=one&code=two HTTP/1.1\r\nHost: localhost\r\n\r\n","ok").is_none());
    }
}
