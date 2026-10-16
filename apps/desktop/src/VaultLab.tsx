import {useState} from "react";
import {invoke} from "@tauri-apps/api/core";
import {open,save} from "@tauri-apps/plugin-dialog";
import type {PackageInput} from "./application-package";

/** Development-only encrypted case snapshot; not production PHI storage. */
type Mode="create"|"open"|"backup"|"recover";
type Props={input:PackageInput;onRestore:(newCase:PackageInput)=>void;onVaultReady?:(path:string|null)=>void;initialMode?:Mode};
type Saved={path:string;encrypted:boolean;synthetic_only:boolean;note:string};
const fileFilters=[{name:"Encrypted SOAR training case",extensions:["soarvault","soarbackup"]}];
const message=(e:unknown)=>e instanceof Error?e.message:String(e);
function asCase(value:unknown):PackageInput{
 if(!value||typeof value!=="object")throw Error("Invalid encrypted snapshot.");
 const v=value as Record<string,unknown>;
 if(v.file_kind!=="soar-desk-synthetic-case-snapshot"||v.schema_version!==1||v.synthetic_only!==true)
   throw Error("Not a supported synthetic case snapshot.");
 if(typeof v.case_reference!=="string"||!/^SYN-[A-Za-z0-9_-]{1,76}$/.test(v.case_reference))
   throw Error("Unsafe case reference.");
 if(!Array.isArray(v.programs)||!v.programs.length||v.programs.some(p=>p!=="ssi"&&p!=="ssdi"))
   throw Error("Invalid program selections.");
 if(!v.answers||typeof v.answers!=="object"||Array.isArray(v.answers)
    ||!v.rows||typeof v.rows!=="object"||Array.isArray(v.rows)
    ||!Array.isArray(v.evidence)||!v.submissions||typeof v.submissions!=="object")
   throw Error("Encrypted snapshot is incomplete.");
 const subs=v.submissions as {records?:unknown;events?:unknown};
 if(!Array.isArray(subs.records)||!Array.isArray(subs.events))
   throw Error("Invalid case activity history.");
 return {
   caseReference:v.case_reference,
   programs:v.programs as PackageInput["programs"],
   includeDeferred:v.include_deferred===true,
   answers:v.answers as PackageInput["answers"],
   rows:v.rows as PackageInput["rows"],
   evidence:v.evidence as PackageInput["evidence"],
   submissions:v.submissions as PackageInput["submissions"],
   recoveryEvents:Array.isArray(v.recovery_events)?v.recovery_events as PackageInput["recoveryEvents"]:[]
 };
}
export default function VaultLab({input,onRestore,onVaultReady,initialMode="create"}:Props){
 const [mode,setMode]=useState<Mode>(initialMode);
 const [selected,setSelected]=useState("");
 const [practitioner,setPractitioner]=useState("");
 const [orgRecovery,setOrgRecovery]=useState("");
 const [nextPractitioner,setNextPractitioner]=useState("");
 const [nextRecovery,setNextRecovery]=useState("");
 const [actor,setActor]=useState("SYN-RECOVERY-CUSTODIAN");
 const [reason,setReason]=useState("");
 const [confirmed,setConfirmed]=useState(false);
 const [busy,setBusy]=useState(false);
 const [feedback,setFeedback]=useState("");
 const [error,setError]=useState("");
 function clearSecrets(){
   setPractitioner("");setOrgRecovery("");setNextPractitioner("");setNextRecovery("");
 }
 async function chooseInput(){
   setError("");setFeedback("");
   try{
     const path=await open({title:"Open an encrypted fictional SOAR vault or backup",
       multiple:false,directory:false,filters:fileFilters});
     if(typeof path==="string")setSelected(path);
   }catch(e){setError(message(e));}
 }
 function snapshot(){
   return {
     file_kind:"soar-desk-synthetic-case-snapshot",
     schema_version:1,
     synthetic_only:true,
     case_reference:input.caseReference,
     programs:input.programs,
     include_deferred:input.includeDeferred,
     answers:input.answers,
     rows:input.rows,
     evidence:input.evidence,
     submissions:input.submissions,
     recovery_events:input.recoveryEvents??[]
   };
 }
 async function execute(){
   setError("");setFeedback("");
   if(!confirmed){setError("Confirm fictional-only information first.");return;}
   setBusy(true);
   try{
     if(mode==="create"){
       const output=await save({title:"Create encrypted fictional SOAR vault",
         defaultPath:input.caseReference+"-TRAINING.soarvault",
         filters:[{name:"Encrypted vault",extensions:["soarvault"]}]});
       if(!output)return;
       const result=await invoke<Saved>("create_synthetic_vault",{request:{
         output_path:output,snapshot:snapshot(),practitioner_passphrase:practitioner,
         organization_recovery_passphrase:orgRecovery,synthetic_confirmed:true}});
       setSelected(result.path);
       onVaultReady?.(result.path);
       setFeedback("Encrypted training case saved: "+result.path+". Keep both credentials separately; this is NOT production-grade case storage.");
     }else if(mode==="open"){
       if(!selected)throw Error("Select an encrypted vault or backup.");
       const restored=await invoke<unknown>("open_synthetic_vault",{request:{
         input_path:selected,practitioner_passphrase:practitioner,synthetic_confirmed:true}});
       const data=asCase(restored);
       if(!window.confirm("Replace the current in-memory synthetic interview, evidence and submission history with "+data.caseReference+"?")){
         await invoke("lock_synthetic_autosave");return;
       }
       onRestore(data);
       onVaultReady?.(selected.endsWith(".soarvault")?selected:null);
       setFeedback("Decrypted and restored fictional case "+data.caseReference+" into this session. This is not a production case login.");
     }else if(mode==="backup"){
       if(!selected)throw Error("Select an encrypted source vault.");
       const output=await save({title:"Save encrypted training vault backup",
         defaultPath:"SYN-CASE-TRAINING.soarbackup",
         filters:[{name:"Encrypted backup",extensions:["soarbackup"]}]});
       if(!output)return;
       const result=await invoke<Saved>("backup_synthetic_vault",{request:{
         input_path:selected,output_path:output,
         practitioner_passphrase:practitioner,synthetic_confirmed:true}});
       setFeedback("Verified and backed up encrypted bytes to "+result.path+". The backup is still readable with the old credentials.");
     }else{
       if(!selected)throw Error("Select an original encrypted vault or backup.");
       if(!window.confirm("Run a SYNTHETIC organizational recovery and create a NEW vault? The old vault and backups are NOT revoked or erased."))return;
       const output=await save({title:"Save recovered fictional vault under a NEW filename",
         defaultPath:"SYN-RECOVERED-TRAINING.soarvault",
         filters:[{name:"Encrypted vault",extensions:["soarvault"]}]});
       if(!output)return;
       const result=await invoke<Saved>("recover_synthetic_vault",{request:{
         input_path:selected,output_path:output,
         old_organization_passphrase:orgRecovery,
         new_practitioner_passphrase:nextPractitioner,
         new_organization_passphrase:nextRecovery,
         actor_code:actor,recovery_reason:reason,synthetic_confirmed:true}});
       onVaultReady?.(null);
       setFeedback("Recovered and re-encrypted into "+result.path+". The old file must be separately retired; emergency audit is only embedded in the new synthetic file.");
     }
   }catch(e){setError(message(e));}
   finally{clearSecrets();setBusy(false);}
 }
 return <section className="vault-lab">
  <div className="eyebrow">ENCRYPTED FILE RESEARCH · SYNTHETIC ONLY</div>
  <h3>Experimental encrypted case vault</h3>
  <p className="muted">Test local encryption, practitioner unlocking, independently protected nonprofit recovery, and ciphertext backups. Files use AES-256-GCM and password-derived wrapping keys. This does <strong>not</strong> implement SQLCipher, Windows Hello, staff permissions, external audit, encrypted attachments or production-ready recovery governance.</p>
  <div className="intake-tabs" role="group" aria-label="Vault operations">
   {(["create","open","backup","recover"] as Mode[]).map(m=><button type="button" key={m}
     className={mode===m?"active":""} onClick={()=>{setMode(m);clearSecrets();setError("");setFeedback("");}}>
      {m==="create"?"Create":m==="open"?"Unlock and load":m==="backup"?"Encrypted backup":"Nonprofit recovery"}
    </button>)}
  </div>
  {mode!=="create"&&<div className="vault-source">
   <p className="hint"><strong>Selected encrypted file:</strong> {selected||"None selected"}</p>
   <button type="button" className="secondary" onClick={chooseInput}>Choose .soarvault or .soarbackup…</button>
  </div>}
  {mode==="create"&&<p className="hint">Creates a new, encrypted, versioned copy of the current fictional case: <strong>{input.caseReference}</strong>. No existing file is overwritten.</p>}
  {(mode==="create"||mode==="open"||mode==="backup")&&<label>Practitioner passphrase (16+ characters)
   <input autoComplete="new-password" type="password" value={practitioner} onChange={e=>setPractitioner(e.target.value)}/>
  </label>}
  {(mode==="create"||mode==="recover")&&<label>{mode==="create"?"Separate nonprofit recovery passphrase":"Existing nonprofit recovery passphrase"}
   <input autoComplete="new-password" type="password" value={orgRecovery} onChange={e=>setOrgRecovery(e.target.value)}/>
  </label>}
  {mode==="recover"&&<>
   <label>New practitioner's passphrase<input type="password" autoComplete="new-password"
     value={nextPractitioner} onChange={e=>setNextPractitioner(e.target.value)}/></label>
   <label>New nonprofit recovery passphrase<input type="password" autoComplete="new-password"
     value={nextRecovery} onChange={e=>setNextRecovery(e.target.value)}/></label>
   <label>Fictional designated custodian identifier<input value={actor} onChange={e=>setActor(e.target.value)}/></label>
   <label>Documented recovery reason (at least 12 characters)<textarea rows={2}
     value={reason} onChange={e=>setReason(e.target.value)} placeholder="Example: Practitioner device retired; authorization confirmed…"/></label>
   <p className="hint">Recovery only writes a new encrypted file; it never returns the case to the custodian. It cannot revoke or delete previously copied vaults.</p>
  </>}
  <label className="checkline">
   <input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>
   I confirm all case details and credentials entered here are fictional training information. I understand these files are not approved for real client records.
  </label>
  <button type="button" className="primary" disabled={!confirmed||busy} onClick={execute}>
   {busy?"Working…":mode==="create"?"Save encrypted fictional case…":mode==="open"?"Unlock and restore interview":mode==="backup"?"Create encrypted backup…":"Rekey for a new practitioner…"}
  </button>
  {error&&<p role="alert" className="error">{error}</p>}
  {feedback&&<p role="status" className="success">{feedback}</p>}
  <p className="hint">Training warning: passphrases travel through the current desktop webview and native bridge. Password boxes are cleared after each operation, but this prototype does not provide protected OS-backed credential entry or a production key vault.</p>
 </section>;
}
