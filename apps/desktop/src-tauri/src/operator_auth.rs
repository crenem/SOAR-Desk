//! Local single-operator access gate for the development desktop.
//! The account password is Argon2id-hashed, never stored in plaintext or
//! reversibly encrypted. Case vaults retain their independent encryption keys.
//! This is NOT an organizational identity service or passkey implementation.
use argon2::{password_hash::{PasswordHash,PasswordHasher,PasswordVerifier,SaltString,rand_core::OsRng},Argon2};
use serde::{Deserialize,Serialize};
use std::{env,fs::{self,OpenOptions},io::{ErrorKind,Write},path::PathBuf,sync::{Mutex,OnceLock},time::{Duration,Instant}};
use zeroize::Zeroizing;
use uuid::Uuid;

const IDLE_SECONDS:u64=15*60;
const MAX_ACCOUNT_BYTES:u64=16*1024;
const FAILED_LIMIT:u32=5;
const LOCKOUT_SECONDS:u64=5*60;

#[derive(Serialize,Deserialize)]
#[serde(deny_unknown_fields)]
struct Account {
    version:u32,
    username:String,
    password_hash:String,
    #[serde(default)]
    profile_id:String,
    #[serde(default)]
    oidc_links:Vec<OidcLink>,
}
#[derive(Serialize,Deserialize,Clone)]
#[serde(deny_unknown_fields)]
struct OidcLink {
    issuer:String,
    subject:String,
}
#[derive(Default)]
struct Session {
    username:Option<String>,
    active_at:Option<Instant>,
    failures:u32,
    locked_until:Option<Instant>,
}
static SESSION:OnceLock<Mutex<Session>>=OnceLock::new();
fn session()->&'static Mutex<Session>{
    SESSION.get_or_init(||Mutex::new(Session::default()))
}
#[derive(Serialize)]
pub struct OperatorStatus {
    pub enrolled:bool,
    pub authenticated:bool,
    pub username:Option<String>,
    pub profile_id:Option<String>,
    pub zitadel_linked:bool,
    pub idle_seconds:u64,
}
#[derive(Deserialize)]
pub struct OperatorCredentials {username:String,password:String}

fn valid_name(name:&str)->bool {
    (3..=64).contains(&name.len())
        &&name.bytes().all(|b|b.is_ascii_alphanumeric()||b==b'_'||b==b'-'||b==b'.')
}
fn valid_secret(secret:&str)->bool {
    (16..=256).contains(&secret.len())&&secret.chars().any(|c|!c.is_whitespace())
}
fn private_directory()->Result<PathBuf,String>{
    let home=env::var_os("HOME").ok_or("Cannot locate the operator's home directory.")?;
    let config=env::var_os("XDG_CONFIG_HOME").map(PathBuf::from)
        .unwrap_or_else(||PathBuf::from(home).join(".config"));
    if !config.is_absolute(){return Err("Configuration location must be absolute.".into());}
    let path=config.join("soar-desk");
    if !path.exists(){fs::create_dir_all(&path).map_err(|_|"Cannot create SOAR Desk account directory.".to_string())?;}
    let meta=fs::symlink_metadata(&path).map_err(|_|"Cannot inspect account directory.".to_string())?;
    if !meta.file_type().is_dir(){return Err("Unsafe SOAR Desk account directory.".into());}
    #[cfg(unix)]{
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&path,fs::Permissions::from_mode(0o700))
            .map_err(|_|"Cannot restrict account directory permissions.".to_string())?;
    }
    Ok(path)
}
fn account_path()->Result<PathBuf,String>{Ok(private_directory()?.join("operator.json"))}
fn account()->Result<Option<Account>,String>{
    let path=account_path()?;
    let meta=match fs::symlink_metadata(&path){
        Ok(meta)=>meta,
        Err(err) if err.kind()==ErrorKind::NotFound=>return Ok(None),
        Err(_)=>return Err("Cannot inspect operator credential file.".into()),
    };
    if !meta.file_type().is_file()||meta.len()==0||meta.len()>MAX_ACCOUNT_BYTES{
        return Err("Unsafe or damaged operator credential file. Refusing access.".into());
    }
    #[cfg(unix)]{
        use std::os::unix::fs::PermissionsExt;
        if meta.permissions().mode()&0o077!=0{
            return Err("Operator credential file permissions are too broad.".into());
        }
    }
    let raw=fs::read(&path).map_err(|_|"Cannot read operator credentials.".to_string())?;
    let parsed:Account=serde_json::from_slice(&raw)
        .map_err(|_|"Operator credential file is damaged.".to_string())?;
    if parsed.version!=1||!valid_name(&parsed.username)||
       PasswordHash::new(&parsed.password_hash).is_err(){
        return Err("Unsupported or damaged operator credential format.".into());
    }
    Ok(Some(parsed))
}
fn status_inner()->Result<OperatorStatus,String>{
    let stored=account()?;
    let enrolled=stored.is_some();
    let mut guard=session().lock().map_err(|_|"Session lock unavailable.")?;
    let fresh=guard.active_at.is_some_and(|t|t.elapsed()<Duration::from_secs(IDLE_SECONDS));
    if !fresh {guard.username=None;guard.active_at=None;}
    let authenticated=enrolled&&fresh&&guard.username.is_some();
    let username=if authenticated{guard.username.clone()}else{None};
    drop(guard);
    if !authenticated {
        // Removes any case VMK from the unlocked native session on expiry.
        let _=crate::vault_commands::lock_synthetic_autosave();
    }
    let profile_id=if authenticated{stored.as_ref().map(|a|a.profile_id.clone()).filter(|s|!s.is_empty())}else{None};
    let zitadel_linked=stored.as_ref().is_some_and(|a|!a.oidc_links.is_empty());
    Ok(OperatorStatus{enrolled,authenticated,username,profile_id,zitadel_linked,idle_seconds:IDLE_SECONDS})
}
#[tauri::command]
pub fn operator_status()->Result<OperatorStatus,String>{status_inner()}
#[tauri::command]
pub fn enroll_operator(request:OperatorCredentials)->Result<OperatorStatus,String>{
    let username=request.username.trim();
    let secret=Zeroizing::new(request.password);
    if !valid_name(username)||!valid_secret(&secret){
        return Err("Username must be 3–64 letters, numbers, dots, dashes or underscores; password must be 16–256 characters.".into());
    }
    let path=account_path()?;
    if path.exists(){return Err("This SOAR Desk profile already has an operator; use Sign in.".into());}
    let salt=SaltString::generate(&mut OsRng);
    let password_hash=Argon2::default().hash_password(secret.as_bytes(),&salt)
        .map_err(|_|"Could not hash operator password.".to_string())?.to_string();
    let bytes=serde_json::to_vec(&Account{version:1,username:username.into(),password_hash,profile_id:Uuid::new_v4().to_string(),oidc_links:vec![]})
        .map_err(|_|"Could not prepare operator credential file.".to_string())?;
    let mut options=OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]{
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file=options.open(&path)
        .map_err(|_|"Operator account already exists or account directory is inaccessible.".to_string())?;
    if file.write_all(&bytes).and_then(|_|file.sync_all()).is_err(){
        drop(file);
        let _=fs::remove_file(&path);
        return Err("Could not finish saving the operator verifier.".into());
    }
    let mut state=session().lock().map_err(|_|"Session lock unavailable.")?;
    state.username=Some(username.into());
    state.active_at=Some(Instant::now());
    state.failures=0;state.locked_until=None;
    drop(state);
    status_inner()
}
#[tauri::command]
pub fn login_operator(request:OperatorCredentials)->Result<OperatorStatus,String>{
    {
        let state=session().lock().map_err(|_|"Session lock unavailable.")?;
        if state.locked_until.is_some_and(|until|Instant::now()<until){
            return Err("Too many failed sign-ins. Try again in five minutes.".into());
        }
    }
    let stored=account()?.ok_or("Enroll the initial local operator first.")?;
    let secret=Zeroizing::new(request.password);
    let verified=request.username.trim()==stored.username &&
        PasswordHash::new(&stored.password_hash).ok().is_some_and(|parsed|
           Argon2::default().verify_password(secret.as_bytes(),&parsed).is_ok());
    let mut state=session().lock().map_err(|_|"Session lock unavailable.")?;
    if !verified{
        state.username=None;state.active_at=None;
        state.failures+=1;
        if state.failures>=FAILED_LIMIT {
            state.locked_until=Some(Instant::now()+Duration::from_secs(LOCKOUT_SECONDS));
            state.failures=0;
        }
        drop(state);
        let _=crate::vault_commands::lock_synthetic_autosave();
        return Err("Invalid username or password.".into());
    }
    state.username=Some(stored.username);
    state.active_at=Some(Instant::now());
    state.failures=0;state.locked_until=None;
    drop(state);
    status_inner()
}
#[tauri::command]
pub fn logout_operator()->Result<OperatorStatus,String>{
    {
        let mut state=session().lock().map_err(|_|"Session lock unavailable.")?;
        state.username=None;state.active_at=None;
    }
    crate::vault_commands::lock_synthetic_autosave()?;
    status_inner()
}
pub fn require_operator()->Result<(),String>{
    let mut state=session().lock().map_err(|_|"Session lock unavailable.")?;
    let valid=state.username.is_some()&&state.active_at
        .is_some_and(|moment|moment.elapsed()<Duration::from_secs(IDLE_SECONDS));
    if valid{
        state.active_at=Some(Instant::now());
        return Ok(());
    }
    state.username=None;state.active_at=None;
    drop(state);
    let _=crate::vault_commands::lock_synthetic_autosave();
    Err("SOAR Desk is locked. Sign in to access case records.".into())
}
/// Link only after the operator has signed in locally AND the external
/// provider's signed ID token has been cryptographically verified.
pub(crate) fn link_oidc_identity(issuer:&str,subject:&str)->Result<OperatorStatus,String>{
    require_operator()?;
    if issuer.len()>512||subject.is_empty()||subject.len()>512{
        return Err("OIDC issuer or subject exceeds allowed bounds.".into());
    }
    let mut account=account()?.ok_or("Enroll a local operator first.")?;
    let current=session().lock().map_err(|_|"Operator session unavailable.")?;
    if current.username.as_deref()!=Some(account.username.as_str()){
        return Err("Local operator session changed during account linking.".into());
    }
    drop(current);
    if account.oidc_links.iter().any(|link|link.issuer==issuer && link.subject!=subject){
        return Err("This ZITADEL issuer is already linked to a different subject.".into());
    }
    if !account.oidc_links.iter().any(|link|link.issuer==issuer&&link.subject==subject){
        if account.oidc_links.len()>=4{return Err("Maximum linked identity providers reached.".into());}
        account.oidc_links.push(OidcLink{issuer:issuer.into(),subject:subject.into()});
    }
    if account.profile_id.is_empty(){account.profile_id=Uuid::new_v4().to_string();}
    save_account(&account)?;
    status_inner()
}
/// Federated login is deliberately NOT self-enrollment or email-based
/// account matching. A separately authenticated local operator links first.
pub(crate) fn login_linked_oidc(issuer:&str,subject:&str)->Result<OperatorStatus,String>{
    let stored=account()?.ok_or("Create the local operator profile first.")?;
    if !stored.oidc_links.iter().any(|link|link.issuer==issuer&&link.subject==subject){
        return Err("This ZITADEL identity has not been linked to the local operator. Sign in locally and link it first.".into());
    }
    let mut current=session().lock().map_err(|_|"Session unavailable.")?;
    current.username=Some(stored.username);
    current.active_at=Some(Instant::now());
    current.failures=0;current.locked_until=None;
    drop(current);
    status_inner()
}
fn save_account(record:&Account)->Result<(),String>{
    let dest=account_path()?;
    if !dest.is_file(){return Err("Local operator credential file is missing.".into());}
    let parent=dest.parent().ok_or("Missing credential directory.")?;
    let mut temp=tempfile::Builder::new().prefix(".operator-").tempfile_in(parent)
        .map_err(|_|"Cannot prepare protected credential update.".to_string())?;
    #[cfg(unix)]{
        use std::os::unix::fs::PermissionsExt;
        temp.as_file().set_permissions(fs::Permissions::from_mode(0o600))
            .map_err(|_|"Cannot secure operator profile update.".to_string())?;
    }
    let bytes=serde_json::to_vec(record).map_err(|_|"Could not serialize profile.".to_string())?;
    temp.write_all(&bytes).and_then(|_|temp.as_file().sync_all())
        .map_err(|_|"Cannot sync operator profile changes.".to_string())?;
    temp.persist(&dest).map_err(|_|"Cannot save linked identity.".to_string())?;
    Ok(())
}
#[cfg(test)]
mod tests{
    use super::*;
    #[test]
    fn usernames_and_passwords_have_bounded_validation(){
        assert!(valid_name("synthetic.operator"));
        assert!(!valid_name("../traverse"));
        assert!(!valid_name("aa"));
        assert!(valid_secret("fictional-passphrase-2026"));
        assert!(!valid_secret("short"));
        assert!(!valid_secret(&" ".repeat(32)));
    }
    #[test]
    fn salted_verifier_does_not_store_a_reversible_password(){
        let salt=SaltString::generate(&mut OsRng);
        let password="fictional-passphrase-2026";
        let hash=Argon2::default().hash_password(password.as_bytes(),&salt).unwrap().to_string();
        assert!(!hash.contains(password));
        assert!(Argon2::default().verify_password(password.as_bytes(),&PasswordHash::new(&hash).unwrap()).is_ok());
        assert!(Argon2::default().verify_password(b"wrong", &PasswordHash::new(&hash).unwrap()).is_err());
    }
}
