import {useCallback,useEffect,useState} from "react";
import {invoke} from "@tauri-apps/api/core";

export type FederatedOperatorStatus={
 enrolled:boolean;authenticated:boolean;username:string|null;
 profile_id:string|null;zitadel_linked:boolean;idle_seconds:number;
};
type Settings={configured:boolean;issuer:string|null;client_id:string|null;redirect_uri:string};
type Props={mode:"login"|"link";linked:boolean;onSuccess:(status:FederatedOperatorStatus)=>void};

export default function ZitadelIdentity({mode,linked,onSuccess}:Props){
 const [settings,setSettings]=useState<Settings|null>(null);
 const [issuer,setIssuer]=useState("");
 const [clientId,setClientId]=useState("");
 const [flow,setFlow]=useState<"idle"|"pending"|"completing">("idle");
 const [url,setUrl]=useState("");
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [busy,setBusy]=useState(false);
 const refresh=useCallback(async()=>{
  try{
   const data=await invoke<Settings>("zitadel_settings");
   setSettings(data);
   if(data.issuer)setIssuer(data.issuer);
   if(data.client_id)setClientId(data.client_id);
  }catch(e){setError(String(e));}
 },[]);
 useEffect(()=>{void refresh();},[refresh]);
 useEffect(()=>{
  if(flow!=="pending")return;
  let live=true;
  const check=async()=>{
   try{
    const progress=await invoke<{state:string}>("zitadel_auth_progress");
    if(!live)return;
    if(progress.state==="ready"){
     setFlow("completing");
     const result=await invoke<FederatedOperatorStatus>("complete_zitadel_auth");
     if(live){setNotice(mode==="link"?"ZITADEL identity linked to this local profile.":"ZITADEL sign-in successful.");setFlow("idle");setUrl("");onSuccess(result);}
    }else if(progress.state==="failed"||progress.state==="expired"||progress.state==="idle"){
      if(progress.state==="failed"){
       // Completing surfaces the provider's non-sensitive error.
       try{await invoke("complete_zitadel_auth");}catch(e){if(live)setError(String(e));}
      }else if(live){setError("ZITADEL sign-in expired or was canceled. Start again.");}
      if(live){setFlow("idle");setUrl("");}
    }
   }catch(e){if(live){setFlow("idle");setError(String(e));}}
  };
  void check();
  const timer=window.setInterval(()=>{void check();},1600);
  return ()=>{live=false;window.clearInterval(timer);};
 },[flow,mode,onSuccess]);
 async function saveConfig(){
  setBusy(true);setError("");setNotice("");
  try{
   const result=await invoke<Settings>("configure_zitadel",{request:{issuer,client_id:clientId}});
   setSettings(result);
   setNotice("OIDC configuration saved locally. Now link your account using the browser.");
  }catch(e){setError(String(e));}
  finally{setBusy(false);}
 }
 async function begin(){
  setBusy(true);setError("");setNotice("");
  try{
   const reply=await invoke<{url:string;expires_seconds:number}>("begin_zitadel_auth",{request:{mode}});
   setUrl(reply.url);setFlow("pending");
   setNotice("Complete ZITADEL authentication in your system browser. This login window remains open for three minutes.");
  }catch(e){setError(String(e));}
  finally{setBusy(false);}
 }
 const enabled=!!settings?.configured;
 return <div className="zitadel-identity">
  {mode==="link"?<>
    <h3>ZITADEL identity</h3>
    <p className="hint">Your SOAR Desk profile remains independent of the identity provider. Only a verified, explicitly linked identity can later sign in to this profile.</p>
    <label>Issuer URL (HTTPS origin)
     <input value={issuer} onChange={e=>setIssuer(e.target.value)} placeholder="https://example.zitadel.cloud" disabled={busy||flow!=="idle"} spellCheck={false}/>
    </label>
    <label>Native application client ID
     <input value={clientId} onChange={e=>setClientId(e.target.value)} placeholder="Public ZITADEL client ID" disabled={busy||flow!=="idle"} spellCheck={false}/>
    </label>
    <p className="hint">Register <code>{settings?.redirect_uri??"http://127.0.0.1:8765/callback"}</code> in the ZITADEL Native application. Enable development mode for its HTTP loopback callback.</p>
    <button className="secondary" type="button" disabled={busy||flow!=="idle"} onClick={()=>void saveConfig()}>Save ZITADEL settings</button>
    {linked&&<p role="status" className="success">A ZITADEL subject is linked to this operator.</p>}
  </>:null}
  {enabled&&(mode==="link"||linked)&&
    <button className={mode==="login"?"primary":"secondary"} type="button" disabled={busy||flow!=="idle"} onClick={()=>void begin()}>
      {flow!=="idle"?"Authenticating…":mode==="login"?"Sign in with ZITADEL":"Link ZITADEL account"}
    </button>}
  {mode==="login"&&!enabled&&<p className="hint">ZITADEL has not been configured on this workstation. Sign in locally to connect an approved identity provider.</p>}
  {mode==="login"&&enabled&&!linked&&<p className="hint">No federated identity is linked yet. First sign in with your local password and explicitly link ZITADEL.</p>}
  {!!url&&<p className="hint">If the browser did not open automatically, copy this sign-in URL into your browser: <button type="button" className="linkbutton" onClick={()=>void navigator.clipboard.writeText(url).catch(()=>setError("Could not copy link."))}>Copy sign-in URL</button></p>}
  {notice&&<p className="success" role="status">{notice}</p>}
  {error&&<p className="error" role="alert">{error}</p>}
 </div>;
}
