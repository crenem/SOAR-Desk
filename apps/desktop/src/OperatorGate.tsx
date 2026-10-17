import {useCallback,useEffect,useState,type ReactNode,type FormEvent} from "react";
import {invoke} from "@tauri-apps/api/core";
import WindowChrome from "./WindowChrome";
import ZitadelIdentity from "./ZitadelIdentity";

type OperatorStatus={
 enrolled:boolean;authenticated:boolean;username:string|null;profile_id:string|null;zitadel_linked:boolean;idle_seconds:number;
};
type Props={children:(operator:string,lock:()=>void,linked:boolean,profileId:string|null,onLinked:(status:OperatorStatus)=>void)=>ReactNode};

/** A native-backed UI gate; Rust protects IPC independently of this screen.
 * Case passphrases remain separate from the operator's sign-in password. */
export default function OperatorGate({children}:Props){
 const [session,setSession]=useState<OperatorStatus|null>(null);
 const [username,setUsername]=useState("");
 const [password,setPassword]=useState("");
 const [confirmation,setConfirmation]=useState("");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const refresh=useCallback(async()=>{
   try{
     setSession(await invoke<OperatorStatus>("operator_status"));
   }catch(e){setSession(null);setError("Cannot verify the local operator session: "+String(e));}
 },[]);
 useEffect(()=>{
   void refresh();
   const timer=window.setInterval(()=>{void refresh();},20_000);
   const focus=()=>{void refresh();};
   window.addEventListener("focus",focus);
   return ()=>{window.clearInterval(timer);window.removeEventListener("focus",focus);};
 },[refresh]);
 async function submit(event:FormEvent<HTMLFormElement>){
   event.preventDefault();
   if(!session||busy)return;
   setError("");
   if(!session.enrolled && password!==confirmation){
     setError("Passwords do not match.");return;
   }
   setBusy(true);
   try{
     const command=session.enrolled?"login_operator":"enroll_operator";
     const current=await invoke<OperatorStatus>(command,{request:{username:username.trim(),password}});
     setSession(current);
     setPassword("");setConfirmation("");
   }catch(e){
     setPassword("");setConfirmation("");
     setError(String(e));
   }finally{setBusy(false);}
 }
 async function lock(){
   if(!window.confirm("Lock SOAR Desk? Save your encrypted case first. Any unsaved in-memory edits will be discarded."))return;
   try{
     const next=await invoke<OperatorStatus>("logout_operator");
     setSession(next);setPassword("");setConfirmation("");setError("");
   }catch(e){setError("Unable to lock native case access: "+String(e));await refresh();}
 }
 if(session?.authenticated){
   return <>{children(session.username??"Operator",()=>{void lock();},session.zitadel_linked,session.profile_id,s=>setSession(s))}</>;
 }
 return <div className="desktop-frame">
  <WindowChrome/>
  <main className="operator-lock-screen">
   <section className="operator-lock-panel" aria-label="SOAR Desk operator access">
    <div className="eyebrow">LOCAL ACCESS CONTROL · DEVELOPMENT BUILD</div>
    <h1>{session?.enrolled?"Unlock SOAR Desk":"Create an operator account"}</h1>
    <p className="muted">{session?.enrolled
      ?"Sign in to access local case tools. Encrypted case files still require their separate practitioner passphrase."
      :"Create a local account for this Ubuntu user profile. Your password is stored only as a salted Argon2id verifier, never plaintext. Keep case recovery credentials separate."}</p>
    {!session&&<p role="status">Checking local account protection…</p>}
    {session&&<form onSubmit={event=>{void submit(event);}}>
     <label>Operator username
      <input type="text" name="username" autoCapitalize="none" autoComplete="username"
       spellCheck={false} required minLength={3} maxLength={64} value={username}
       onChange={e=>setUsername(e.target.value)} disabled={busy}/>
     </label>
     <label>{session.enrolled?"Password":"Create password (16 characters minimum)"}
      <input type="password" name="password" autoComplete={session.enrolled?"current-password":"new-password"}
       required minLength={session.enrolled?1:16} maxLength={256} value={password}
       onChange={e=>setPassword(e.target.value)} disabled={busy}/>
     </label>
     {!session.enrolled&&<label>Confirm password
       <input type="password" name="confirmation" autoComplete="new-password"
        required minLength={16} maxLength={256} value={confirmation}
        onChange={e=>setConfirmation(e.target.value)} disabled={busy}/>
     </label>}
     <button className="primary" type="submit" disabled={busy}>{busy?"Working…":session.enrolled?"Sign in":"Create local operator"}</button>
    </form>}
    {session?.enrolled&&<ZitadelIdentity mode="login" linked={session.zitadel_linked} onSuccess={s=>{setSession(s);setError("");}}/>}
    {error&&<p role="alert" className="error">{error}</p>}
    <p className="hint">Native case commands require authentication and lock after 15 minutes without case activity. A passkey/Windows Hello unlock is not yet enabled in this WSL2 build. This is not an organizational identity or PHI compliance certification.</p>
   </section>
  </main>
 </div>;
}
