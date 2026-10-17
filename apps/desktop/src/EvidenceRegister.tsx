import type { EvidenceReference,EvidenceStatus } from "./application-package";
import {useState,type Dispatch,type SetStateAction} from "react";
import {invoke} from "@tauri-apps/api/core";
import {open,save} from "@tauri-apps/plugin-dialog";

type Props={evidence:EvidenceReference[];setEvidence:Dispatch<SetStateAction<EvidenceReference[]>>;syntheticOnly?:boolean;caseReference:string};
const kinds:{value:EvidenceReference["kind"];label:string}[]=[
 {value:"medical",label:"Medical or clinical record"},
 {value:"employment",label:"Employment / vocational record"},
 {value:"applicant_statement",label:"Applicant / witness statement"},
 {value:"other",label:"Other source"}
];
export default function EvidenceRegister({evidence,setEvidence,syntheticOnly=true,caseReference}:Props){
 const [busy,setBusy]=useState<string|null>(null);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 type Attachment={blob_id:string;original_name:string;bytes:number;sha256:string;encrypted_path:string};
 async function attach(id:string){
  setError("");setNotice("");setBusy(id);
  try{
   const path=await open({multiple:false,directory:false,title:"Select a local document to encrypt inside this case",filters:[{name:"Evidence documents",extensions:["pdf","png","jpg","jpeg","tif","tiff","txt"]}]});
   if(typeof path!=="string")return;
   const record=await invoke<Attachment>("attach_evidence_document",{request:{source_path:path,case_reference:caseReference,synthetic_confirmed:syntheticOnly,local_risk_acknowledged:!syntheticOnly}});
   change(id,{blobId:record.blob_id,originalFilename:record.original_name,sha256:record.sha256,bytes:record.bytes});
   setNotice("Source encrypted and attached to "+id+". Save the case to preserve its metadata.");
  }catch(e){setError(String(e));}
  finally{setBusy(null);}
 }
 async function verifyAttached(item:EvidenceReference){
  if(!item.blobId||!item.sha256||item.bytes===undefined)return;
  setError("");setNotice("");setBusy(item.id);
  try{
   const result=await invoke<{authenticated:boolean;sha256_matched:boolean;bytes_matched:boolean}>("verify_attached_evidence",{request:{
      case_reference:caseReference,blob_id:item.blobId,
      expected_sha256:item.sha256,expected_bytes:item.bytes
   }});
   if(!result.authenticated||!result.sha256_matched||!result.bytes_matched)
     throw Error("Source integrity verification did not pass.");
   setNotice("Encrypted original for "+item.id+" passed case authentication, byte count and SHA-256 verification. Clinical review status is unchanged.");
  }catch(e){setError("Encrypted original verification FAILED: "+String(e));}
  finally{setBusy(null);}
 }
 async function exportAttached(item:EvidenceReference){
  if(!item.blobId)return;
  setError("");setNotice("");setBusy(item.id);
  try{
   if(!window.confirm("This will create a new UNENCRYPTED source document. Continue only to an authorized, protected destination."))return;
   const ext=item.originalFilename?.split(".").pop()?.toLowerCase()||"pdf";
   const allowed=["pdf","png","jpg","jpeg","tif","tiff","txt"];
   const extension=allowed.includes(ext)?ext:"pdf";
   const output=await save({title:"Export decrypted source — creates an unencrypted copy",defaultPath:item.originalFilename||"evidence."+extension,filters:[{name:"Source document",extensions:[extension]}]});
   if(!output)return;
   await invoke<string>("export_evidence_document",{request:{case_reference:caseReference,blob_id:item.blobId,output_path:output,acknowledge_plaintext_export:true}});
   setNotice("Decrypted source exported to "+output+". Handle and delete copies according to organizational policy.");
  }catch(e){setError(String(e));}
  finally{setBusy(null);}
 }

 async function recoverUnregistered(){
  setError("");setNotice("");setBusy("inventory");
  try{
   const stored=await invoke<Array<{blob_id:string;sha256:string;bytes:number;extension:string}>>("list_case_evidence",{request:{case_reference:caseReference}});
   const known=new Set(evidence.map(e=>e.blobId).filter(Boolean));
   const missing=stored.filter(item=>!known.has(item.blob_id));
   if(missing.length===0){
     setNotice("Every accessible encrypted original is already registered in this open case.");
     return;
   }
   if(!window.confirm(missing.length+" encrypted original(s) have no current evidence-register entry. Recover them as PENDING evidence with an unknown original filename? The encrypted files will not be deleted or decrypted to disk."))return;
   const prefix=syntheticOnly?"SYN-EV-":"EV-";
   setEvidence(current=>{
     const existing=new Set(current.map(e=>e.blobId).filter(Boolean));
     let next=Math.max(0,...current.map(e=>Number(e.id.match(new RegExp("^"+prefix+"(\\\\d+)$"))?.[1]||0)))+1;
     const additions:EvidenceReference[]=[];
     for(const item of missing){
       if(existing.has(item.blob_id))continue;
       existing.add(item.blob_id);
       additions.push({
         id:prefix+String(next++).padStart(4,"0"),
         title:"Recovered encrypted original (filename unknown)",
         kind:"other",status:"pending",location:"",
         note:"Recovered from the authenticated case attachment directory after an interrupted or unregistered import. Inspect the original before classifying or verifying.",
         reviewer:"",blobId:item.blob_id,sha256:item.sha256,bytes:item.bytes,
         originalFilename:"recovered-"+item.blob_id.slice(0,12)+"."+item.extension
       });
     }
     return [...current,...additions];
   });
   setNotice("Recovered "+missing.length+" encrypted original reference(s) as pending. Use Save now to persist their metadata; inspect each original before human verification.");
  }catch(e){setError("Encrypted evidence inventory failed: "+String(e));}
  finally{setBusy(null);}
 }
 function add(){
   const prefix=syntheticOnly?"SYN-EV-":"EV-";
   const indices=evidence.map(e=>Number(e.id.match(new RegExp("^"+prefix+"(\\d+)$"))?.[1]||0));
   const next=Math.max(0,...indices)+1;
   setEvidence(list=>[...list,{id:prefix+String(next).padStart(4,"0"),title:"",
     kind:"other",location:"",note:"",status:"pending",reviewer:""}]);
 }
 function change(id:string,patch:Partial<EvidenceReference>){
   setEvidence(list=>list.map(e=>e.id===id?{...e,...patch}:e));
 }
 return <section className="panel">
  <div className="eyebrow">CASE-SPECIFIC SOURCE REFERENCES</div>
  <h2>Evidence register</h2>
  <p className="muted">Record locally indexed source references that can be linked to individual form answers. For a linked answer, enter the exact <strong>{syntheticOnly?"SYN-EV-...":"EV-..."}</strong> identifier in its <strong>Answer source and review</strong> field. A registered source is not proof that a clinical interpretation is correct.</p>
  <p className="hint"><strong>Original documents:</strong> With an unlocked writable vault, attach a PDF or image as a separate encrypted blob. The original source file remains at its original location. Encrypted blobs can be included in the case backup. Model findings still require independent human review.</p>
  {error&&<p className="error" role="alert">{error}</p>}
  {notice&&<p className="success" role="status">{notice}</p>}
  {evidence.length===0&&<p className="muted">No evidence source references registered yet.</p>}
  {evidence.map(e=><fieldset key={e.id} className="intake-repeat">
   <legend>{e.id} · {e.title||"New evidence source"}</legend>
   <div className="fieldgrid">
    <label>Source title<input value={e.title} onChange={ev=>change(e.id,{title:ev.target.value})} placeholder="Discharge summary, employer statement…"/></label>
    <label>Source type<select value={e.kind} onChange={ev=>change(e.id,{kind:ev.target.value as EvidenceReference["kind"]})}>
     {kinds.map(k=><option key={k.value} value={k.value}>{k.label}</option>)}
    </select></label>
    <label>Location in source / page numbers<input value={e.location} onChange={ev=>change(e.id,{location:ev.target.value})} placeholder="Page 3, functional limitations paragraph"/></label>
    <label>Human review state<select value={e.status} onChange={ev=>change(e.id,{status:ev.target.value as EvidenceStatus,reviewer:""})}>
     <option value="pending">Pending human review</option>
     <option value="human_verified">Human verified against source</option>
     <option value="rejected">Rejected / unsupported</option>
    </select></label>
   </div>
   {e.status==="human_verified"&&<label>Reviewer identifier (required)<input value={e.reviewer} onChange={ev=>change(e.id,{reviewer:ev.target.value})} placeholder="Authorized reviewer code"/></label>}
   {e.documentReview&&<div className="review" aria-label="Saved document-level review">
      <strong>Document-wide review: {e.documentReview.outcome}</strong>
      <p className="muted">Recorded {e.documentReview.recordedAt} by {e.documentReview.reviewerId}. Original SHA-256: {e.documentReview.documentSha256.slice(0,12)}…</p>
      <p style={{whiteSpace:"pre-wrap"}}>{e.documentReview.rationale}</p>
      <p className="hint">This records a human document-wide judgment. It does not automatically verify clinical facts or change the evidence review state above.</p>
    </div>}
   <label>Evidence note, limited to supported facts<textarea rows={2} value={e.note} onChange={ev=>change(e.id,{note:ev.target.value})} placeholder="Describe what the source actually states and what remains uncertain."/></label>
   <div className="actions">
     {!e.blobId?<button type="button" className="secondary" disabled={busy!==null} onClick={()=>void attach(e.id)}>Attach encrypted source…</button>:<>
       <span className="hint">Encrypted source: {e.originalFilename||"document"} · {e.bytes??0} bytes · SHA-256 {e.sha256?.slice(0,12)}…</span>
       <button type="button" className="secondary" disabled={busy!==null||!e.sha256||e.bytes===undefined} onClick={()=>void verifyAttached(e)}>Verify encrypted original</button>
       <button type="button" className="secondary" disabled={busy!==null} onClick={()=>void exportAttached(e)}>Export decrypted copy…</button>
     </>}
     <button type="button" className="linkbutton" disabled={busy!==null} onClick={()=>{
       if(e.blobId&&!window.confirm("Remove this reference? The encrypted source blob remains on disk until separately retired."))return;
       setEvidence(list=>list.filter(item=>item.id!==e.id));
     }}>Remove source reference</button>
   </div>
  </fieldset>)}
  <button className="secondary" type="button" onClick={add}>Add evidence reference</button>
  <button className="secondary" type="button" disabled={busy!==null} onClick={()=>void recoverUnregistered()}>Recover unregistered encrypted originals…</button>
 </section>;
}
