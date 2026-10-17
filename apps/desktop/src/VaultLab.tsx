import {useEffect,useState} from "react";
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
 const training=v.file_kind==="soar-desk-synthetic-case-snapshot"&&v.schema_version===1&&v.synthetic_only===true;
 const local=v.file_kind==="soar-desk-local-case-snapshot"&&v.schema_version===2&&v.synthetic_only===false;
 if(!training&&!local)throw Error("Not a supported encrypted case snapshot.");
 if(typeof v.case_reference!=="string"||
   !(training?/^SYN-[A-Za-z0-9_-]{1,76}$/:/^CASE-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i).test(v.case_reference))
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
   syntheticOnly:training,
   programs:v.programs as PackageInput["programs"],
   includeDeferred:v.include_deferred===true,
   answers:v.answers as PackageInput["answers"],
   rows:v.rows as PackageInput["rows"],
   evidence:v.evidence as PackageInput["evidence"],
   submissions:v.submissions as PackageInput["submissions"],
   recoveryEvents:Array.isArray(v.recovery_events)?v.recovery_events as PackageInput["recoveryEvents"]:[],
   signatures:Array.isArray(v.signatures)?v.signatures as PackageInput["signatures"]:[]
 };
}
export default function VaultLab({input,onRestore,onVaultReady,initialMode="create"}:Props){
 const [mode,setMode]=useState<Mode>(initialMode);
 useEffect(()=>{setMode(initialMode);},[initialMode]);
 const [selected,setSelected]=useState("");
 const [selectedMode,setSelectedMode]=useState<"training"|"local">(input.syntheticOnly===false?"local":"training");
 const [practitioner,setPractitioner]=useState("");
 const [orgRecovery,setOrgRecovery]=useState("");
 const [nextPractitioner,setNextPractitioner]=useState("");
 const [nextRecovery,setNextRecovery]=useState("");
 const [actor,setActor]=useState("SYN-RECOVERY-CUSTODIAN");
 const [reason,setReason]=useState("");
 const [confirmed,setConfirmed]=useState(false);
 const isTraining=mode==="create"?input.syntheticOnly!==false:selectedMode==="training";
 const securityArgs={synthetic_confirmed:isTraining,local_risk_acknowledged:!isTraining};
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
     file_kind:input.syntheticOnly===false?"soar-desk-local-case-snapshot":"soar-desk-synthetic-case-snapshot",
     schema_version:input.syntheticOnly===false?2:1,
     synthetic_only:input.syntheticOnly!==false,
     case_reference:input.caseReference,
     programs:input.programs,
     include_deferred:input.includeDeferred,
     answers:input.answers,
     rows:input.rows,
     evidence:input.evidence,
     submissions:input.submissions,
     recovery_events:input.recoveryEvents??[],
     signatures:input.signatures??[]
   };
 }
 async function execute(){
   setError("");setFeedback("");
   if(!confirmed){setError("Confirm fictional-only information first.");return;}
   setBusy(true);
   try{
     if(mode==="create"){
       const output=await save({title:"Create encrypted fictional SOAR vault",
         defaultPath:input.caseReference+"-ENCRYPTED.soarvault",
         filters:[{name:"Encrypted vault",extensions:["soarvault"]}]});
       if(!output)return;
       const result=await invoke<Saved>("create_synthetic_vault",{request:{
         output_path:output,snapshot:snapshot(),practitioner_passphrase:practitioner,
         organization_recovery_passphrase:orgRecovery,...securityArgs}});
       setSelected(result.path);
       onVaultReady?.(result.path);
       setFeedback("Encrypted case saved: "+result.path+". Separate the organization recovery secret from the practitioner secret. This version is not independently security-certified.");
     }else if(mode==="open"){
       if(!selected)throw Error("Select an encrypted vault or backup.");
       // Confirm BEFORE native unlock changes the active autosave vault.
       // Canceling must never discard the current session's encryption key.
       if(!window.confirm("Unlocking this file will REPLACE the current in-memory interview, evidence and submission history. Save the existing case first if needed. Continue?"))return;
       const restored=await invoke<unknown>("open_synthetic_vault",{request:{
         input_path:selected,practitioner_passphrase:practitioner,...securityArgs}});
       const data=asCase(restored);
       onRestore(data);
       onVaultReady?.(selected.endsWith(".soarvault")?selected:null);
       setFeedback("Decrypted and restored case "+data.caseReference+" into this session. This is a local vault unlock, not an organizational login.");
     }else if(mode==="backup"){
       if(!selected)throw Error("Select an encrypted source vault.");
       const output=await save({title:"Save encrypted training vault backup",
         defaultPath:"SYN-CASE-TRAINING.soarbackup",
         filters:[{name:"Encrypted backup",extensions:["soarbackup"]}]});
       if(!output)return;
       const result=await invoke<Saved>("backup_synthetic_vault",{request:{
         input_path:selected,output_path:output,
         practitioner_passphrase:practitioner,...securityArgs}});
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
         actor_code:actor,recovery_reason:reason,...securityArgs}});
       onVaultReady?.(null);
       setFeedback("Recovered and re-encrypted into "+result.path+". Older copies remain readable with their old secrets; independent audit and retirement are still needed.");
     }
   }catch(e){setError(message(e));}
   finally{clearSecrets();setBusy(false);}
 }
 return <section className="vault-lab">
  <div className="eyebrow">{isTraining?"ENCRYPTED TRAINING VAULT":"RESTRICTED ENCRYPTED LOCAL CASE · SECURITY REVIEW INCOMPLETE"}</div>
  <h3>Encrypted case file and nonprofit recovery</h3>
  <p className="muted">Encrypt, reopen, back up, and recover a local case. Uses AES-256-GCM, Argon2id-derived separate practitioner and nonprofit recovery keys. This release still lacks SQLCipher, Windows Hello, authenticated organizational staff permissions, independent audit, encrypted source documents, and completed compliance assessment.</p>
  <div className="intake-tabs" role="group" aria-label="Vault operations">
   {(["create","open","backup","recover"] as Mode[]).map(m=><button type="button" key={m}
     className={mode===m?"active":""} onClick={()=>{setMode(m);clearSecrets();setError("");setFeedback("");}}>
      {m==="create"?"Create":m==="open"?"Unlock and load":m==="backup"?"Encrypted backup":"Nonprofit recovery"}
    </button>)}
  </div>
  {mode!=="create"&&<label>Encrypted file category<select value={selectedMode} onChange={e=>{setSelectedMode(e.target.value as "training"|"local");setConfirmed(false);}}>
    <option value="training">Fictional training case (SYN-)</option>
    <option value="local">Restricted local case (CASE-)</option>
   </select></label>}
  {mode!=="create"&&<div className="vault-source">
   <p className="hint"><strong>Selected encrypted file:</strong> {selected||"None selected"}</p>
   <button type="button" className="secondary" onClick={chooseInput}>Choose .soarvault or .soarbackup…</button>
  </div>}
  {mode==="create"&&<p className="hint">Creates a new, encrypted, versioned copy of the current case: <strong>{input.caseReference}</strong>. No existing file is overwritten.</p>}
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
   {isTraining?
     "I confirm this file contains only fictional training information.":
     "I am authorized by the nonprofit to use this local encrypted case. I understand this development build has NOT completed a medical-data security/compliance review, and my organization must authorize its use, protected backup, recovery and retention."}
  </label>
  <button type="button" className="primary" disabled={!confirmed||busy} onClick={execute}>
   {busy?"Working…":mode==="create"?"Create encrypted case…":mode==="open"?"Unlock and restore interview":mode==="backup"?"Create encrypted backup…":"Rekey for a new practitioner…"}
  </button>
  {error&&<p role="alert" className="error">{error}</p>}
  {feedback&&<p role="status" className="success">{feedback}</p>}
  <p className="hint">Security limitation: passphrases pass through the desktop webview and native bridge, then the UI clears its password fields. This is not OS-backed credential storage or an independently reviewed case-management deployment.</p>
 </section>;
}
