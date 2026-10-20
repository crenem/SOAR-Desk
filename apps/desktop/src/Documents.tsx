import {useEffect,useRef,useState} from "react";
import {invoke} from "@tauri-apps/api/core";
import {open} from "@tauri-apps/plugin-dialog";
import {extractMetadata,type MetadataCandidate,type MetadataCategory} from "./metadata";
import {reviewedSuggestions,type PrefillSuggestion} from "./document-prefill";
import {kindFor,normalizeOnBlur,validateDisplay} from "./field-format";
import type {AttachedSource} from "./evidence-attachment";
import type {DocumentReviewRecord} from "./application-package";
import {analysisMode} from "./document-intake-policy";

type Page={page:number;text:string;method:string;warning:string|null};
type Document={document_id:string;sha256:string;pages:Page[]};
type Finding={category:string;value:string;quote:string;page:number;source_start:number;review_status:"PendingHumanReview"};
type FieldProposal={key:string;label:string;value:string;quote:string;page:number;source_start:number;review_status:"PendingHumanReview"};
type WholeDocument={
 schema_version:number;document_sha256:string;model:string;backend:string;summary:string;
 findings:Finding[];field_suggestions:FieldProposal[];
 processed_windows:number;total_windows:number;unreadable_pages:number[];
 failed_windows:{page:number;window:number;message:string}[];
 analysis_complete:boolean;warnings:string[];proposed_only:true;
};
type Review="PendingHumanReview"|"HumanVerified"|"Rejected"|"NeedsMoreEvidence";
const metadataCategories:MetadataCategory[]=["Document","Patient","Encounter","Diagnoses","Medical history","Psychiatric history","Medications","Allergies","Functional evidence"];
const narrativeTargets=[
 {key:"medical.remarks",label:"Medical evidence remarks"},
 {key:"function.work",label:"Evidence relevant to ability to work"},
 {key:"function.abilities",label:"Functional abilities and limitations"},
 {key:"work.explain",label:"Work demands and limitations"},
 {key:"function.remarks",label:"Function report remarks"},
];
const proposalId=(item:{page:number;source_start:number;quote:string},index:number)=>`${item.page}:${item.source_start}:${index}`;
function verifiedQwenPrefills(items:FieldProposal[],checked:Record<string,boolean>,sha:string):PrefillSuggestion[]{
 const proposals:PrefillSuggestion[]=[];
 const conflicts=new Set<string>();
 const values=new Map<string,string>();
 for(let index=0;index<items.length;index++){
  const item=items[index];
  if(!checked[proposalId(item,index)])continue;
  const kind=kindFor(item.key,item.key==="person.dob"?"date":"text");
  const value=normalizeOnBlur(kind,item.value);
  if(validateDisplay(kind,value))continue;
  if(values.has(item.key)&&values.get(item.key)!==value){conflicts.add(item.key);continue;}
  values.set(item.key,value);
  proposals.push({key:item.key,label:item.label,value,
   page:item.page,documentSha256:sha,excerpt:item.quote,
   source:`Document SHA-256 ${sha} · page ${item.page} · Qwen proposal verified against original by practitioner`});
 }
 return proposals.filter(item=>!conflicts.has(item.key)).filter((item,index,self)=>self.findIndex(q=>q.key===item.key)===index);
}

export default function Documents({caseReference,syntheticOnly,onPrefill,onEvidenceAttached}:{
 caseReference:string;syntheticOnly:boolean;
 onPrefill:(items:PrefillSuggestion[],caseReference:string)=>void;
 onEvidenceAttached:(source:AttachedSource,caseReference:string,review?:DocumentReviewRecord)=>void;
}){
 const [confirmed,setConfirmed]=useState(false);
 const [path,setPath]=useState("");
 const [documentCase,setDocumentCase]=useState("");
 const [document,setDocument]=useState<Document|null>(null);
 const [metadata,setMetadata]=useState<MetadataCandidate[]>([]);
 const [qwen,setQwen]=useState<WholeDocument|null>(null);
 const [checked,setChecked]=useState<Record<string,boolean>>({});
 const [narrativeChecked,setNarrativeChecked]=useState<Record<string,boolean>>({});
 const [narrativeTarget,setNarrativeTarget]=useState(narrativeTargets[0].key);
 const [progress,setProgress]=useState("");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [review,setReview]=useState<Review>("PendingHumanReview");
 const [reviewer,setReviewer]=useState("");
 const [rationale,setRationale]=useState("");
 const generation=useRef(0);
 useEffect(()=>{
  generation.current++;
  setDocument(null);setQwen(null);setMetadata([]);setChecked({});setNarrativeChecked({});
  setPath("");setDocumentCase("");setConfirmed(false);setProgress("");setError("");
  setReview("PendingHumanReview");setReviewer("");setRationale("");setBusy(false);
 },[caseReference,syntheticOnly]);
 async function ingest(filePath:string){
  const run=++generation.current;
  setPath(filePath);setDocumentCase(caseReference);setDocument(null);setQwen(null);
  setChecked({});setNarrativeChecked({});setMetadata([]);setError("");
  setReview("PendingHumanReview");setReviewer("");setRationale("");
  setBusy(true);setProgress("Extracting local text and OCR; preserving page references…");
  try{
   const doc=await invoke<Document>("extract_synthetic_document",{request:{path:filePath,...analysisMode(syntheticOnly)}});
   if(generation.current!==run)return;
   setDocument(doc);setMetadata(extractMetadata(doc.pages));
   setProgress("Running Qwen over the full extracted document. Large documents are processed in bounded windows and merged into one JSON result…");
   try{
    const result=await invoke<WholeDocument>("extract_qwen_document",{
      request:{sha256:doc.sha256,pages:doc.pages,...analysisMode(syntheticOnly)}
    });
    if(generation.current!==run)return;
    if(result.document_sha256.toLowerCase()!==doc.sha256.toLowerCase()||result.proposed_only!==true)
      throw new Error("The Qwen result did not match the analyzed document.");
    setQwen(result);
    setProgress(result.analysis_complete
      ?"Qwen JSON ready for human review. No model finding has been accepted automatically."
      :"Partial Qwen JSON: failed or unreadable pages need human examination or re-acquisition.");
   }catch(e){
    if(generation.current===run){
      setError("Local Qwen document analysis unavailable: "+String(e)+". OCR and manually reviewed fields remain accessible.");
      setProgress("Local OCR ready; Qwen analysis incomplete.");
    }
   }
  }catch(e){if(generation.current===run)setError(String(e));}
  finally{if(generation.current===run)setBusy(false);}
 }
 async function browse(){
  if(!confirmed||busy)return;
  try{
   const file=await open({multiple:false,directory:false,
    title:syntheticOnly?"Select fictional medical evidence":"Select locally authorized medical evidence",
    filters:[{name:"PDF and images",extensions:["pdf","png","jpg","jpeg","tif","tiff"]}]});
   if(typeof file==="string")await ingest(file);
  }catch(e){setError("Unable to select document: "+String(e));}
 }
 async function attachDocument(){
  if(!document||!path||documentCase!==caseReference||busy)return;
  const run=generation.current;
  setError("");setBusy(true);
  try{
   const attached=await invoke<AttachedSource>("attach_evidence_document",{request:{
    source_path:path,case_reference:caseReference,expected_sha256:document.sha256,
    ...analysisMode(syntheticOnly)
   }});
   if(run!==generation.current)return;
   const humanReview:DocumentReviewRecord|undefined=
    review!=="PendingHumanReview"&&reviewer.trim().length>=3&&rationale.trim().length>=12
     ?{outcome:review,reviewerId:reviewer.trim(),rationale:rationale.trim(),
       recordedAt:new Date().toISOString(),documentSha256:document.sha256}
     :undefined;
   onEvidenceAttached(attached,caseReference,humanReview);
  }catch(e){if(run===generation.current)setError("Encrypted source attachment failed: "+String(e));}
  finally{if(run===generation.current)setBusy(false);}
 }
 function updateMetadata(id:string,patch:Partial<MetadataCandidate>){
  setMetadata(old=>old.map(x=>x.id===id?{...x,...patch,status:patch.value!==undefined?"PendingHumanReview":(patch.status??x.status)}:x));
  setReview("PendingHumanReview");
 }
 const directSuggestions=document&&documentCase===caseReference?reviewedSuggestions(metadata,document.sha256,documentCase):[];
 const modelSuggestions=document&&qwen&&documentCase===caseReference?verifiedQwenPrefills(qwen.field_suggestions,checked,document.sha256):[];
 const filledSuggestions=[...directSuggestions,...modelSuggestions].filter((item,index,all)=>
  all.findIndex(other=>other.key===item.key)===index);
 const selectedNarratives=qwen?.findings.filter((f,i)=>narrativeChecked[proposalId(f,i)])??[];
 const narrativeSuggestion:PrefillSuggestion[]=
  document&&selectedNarratives.length>0?[{
   key:narrativeTarget,label:narrativeTargets.find(t=>t.key===narrativeTarget)?.label??"Narrative evidence",
   value:selectedNarratives.map(f=>`Medical record p. ${f.page} [${f.category.replace(/_/g," ")}]: "${f.quote}"`).join("\n\n"),
   page:selectedNarratives[0].page,excerpt:selectedNarratives.map(f=>f.quote).join(" | "),
   documentSha256:document.sha256,
   source:`Document SHA-256 ${document.sha256} · selected source quotations · practitioner verified`
  }]:[];
 const canSubmitSuggestions=!!document&&documentCase===caseReference&&!busy;
 return <section className="panel" aria-label="Local evidence and document JSON analysis">
  <div className="eyebrow">{syntheticOnly?"LOCAL DOCUMENT AI · SYNTHETIC ONLY":"RESTRICTED LOCAL DOCUMENT PROCESSING · NOT SECURITY-APPROVED"}</div>
  <h1>2 · Evidence: local document to structured JSON</h1>
  <p className="intro">Qwen, not Laya, examines the extracted text of the complete uploaded document. Long sources use bounded page-anchored windows and return a single combined JSON object. OCR, Qwen interpretations and narrative suggestions are unverified until reviewed. No cloud API is used.</p>
  <label className="checkline"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/>
   {syntheticOnly?"The selected document contains fictional information only.":"My nonprofit authorizes this locally restricted document processing; I understand the build is not approved for production PHI."}
  </label>
  <button type="button" className="primary" disabled={!confirmed||busy} onClick={()=>void browse()}>Select and analyze local document…</button>
  {path&&<p className="hint" style={{overflowWrap:"anywhere"}}>Local source: {path}</p>}
  {busy&&<progress aria-label="Local document analysis in progress"/>}
  {progress&&<p role="status">{progress}</p>}
  {error&&<div className="error" role="alert">{error}</div>}
  {document&&<>
   <section className="review">
    <h2>One structured document record</h2>
    <p>{document.pages.length} pages · SHA-256 {document.sha256.slice(0,16)}… · {qwen?.processed_windows??0}/{qwen?.total_windows??"?"} extraction windows</p>
    {qwen?<><p><strong>Inference:</strong> {qwen.backend} · {qwen.model}</p>
      <p><strong>Analysis:</strong> {qwen.analysis_complete?"All machine-readable windows processed":"INCOMPLETE — inspect unreadable and failed sections"}</p>
      {qwen.summary&&<p style={{whiteSpace:"pre-wrap"}}>{qwen.summary}</p>}
      {qwen.unreadable_pages.length>0&&<p className="field-warning">Unreadable OCR pages: {qwen.unreadable_pages.join(", ")}. Do not treat missing text as missing clinical evidence.</p>}
      {qwen.failed_windows.map((f,i)=><p className="field-warning" key={i}>Page {f.page}, window {f.window}: {f.message}</p>)}
      <details><summary>View structured JSON proposals (read-only)</summary>
       <pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere",maxHeight:"20rem",overflow:"auto"}}>{JSON.stringify(qwen,null,2)}</pre>
       <p className="hint">This JSON remains in local application memory. Only individually reviewed interview answers and the encrypted original become case data.</p>
      </details>
    </>:<p>Local Qwen has not returned a document analysis. Manually verify any usable OCR.</p>}
    <button type="button" className="secondary" disabled={busy||documentCase!==caseReference}
      onClick={()=>void attachDocument()}>Attach original to encrypted case →</button>
    <p className="hint">Original SHA-256 is checked again on attachment. A document review does not validate all medical findings.</p>
   </section>
   <section className="review">
    <h2>Interview answers proposed by source documents</h2>
    <p className="hint">Verify each candidate against the original, not just OCR. Select only values you have checked. Nothing overwrites an existing interview answer.</p>
    {qwen?.field_suggestions.map((f,i)=>{
     const id=proposalId(f,i);
     return <label className="checkline" key={id}><input type="checkbox" checked={!!checked[id]} onChange={e=>setChecked(prev=>({...prev,[id]:e.target.checked}))}/>
      <span><strong>{f.label} · page {f.page}</strong>: {f.key==="person.ssn"?"[restricted value]":f.value}
       <small>Exact source OCR: {f.quote}</small><small>Check only after verifying original document</small></span>
     </label>;
    })}
    {metadataCategories.map(group=>{
     const entries=metadata.filter(m=>m.category===group);
     return entries.length?<details key={group} open={group==="Patient"}>
      <summary>Explicitly labeled OCR values · {group} ({entries.length})</summary>
      {entries.map(m=><fieldset className="question" key={m.id}>
       <legend>{m.field} — page {m.page}</legend>
       <label>OCR value<textarea rows={2} value={m.value} onChange={e=>updateMetadata(m.id,{value:e.target.value})}/></label>
       <p className="hint">Source OCR: {m.excerpt}</p>
       <label>Verification<select value={m.status} disabled={busy} onChange={e=>updateMetadata(m.id,{status:e.target.value as MetadataCandidate["status"]})}>
        <option value="PendingHumanReview">Not verified</option>
        <option value="HumanVerified">Verified against original</option>
        <option value="Rejected">Rejected</option>
       </select></label>
      </fieldset>)}
     </details>:null;
    })}
    <p><strong>{filledSuggestions.length}</strong> reviewed field proposals available.</p>
    <button type="button" className="primary" disabled={!canSubmitSuggestions||filledSuggestions.length===0}
     onClick={()=>onPrefill(filledSuggestions,documentCase)}>1 · Review these in the interview →</button>
   </section>
   <section className="review">
    <h2>Narrative evidence candidates</h2>
    <p className="hint">Source quotations are not applicant testimony. Select passages reviewed against the original and send them to a blank narrative answer for editing. Never auto-append to or overwrite existing answers.</p>
    {qwen?.findings.map((f,i)=>{
     const id=proposalId(f,i);
     return <label className="checkline" key={id}>
      <input type="checkbox" checked={!!narrativeChecked[id]} onChange={e=>setNarrativeChecked(prev=>({...prev,[id]:e.target.checked}))}/>
      <span><strong>Page {f.page} · {f.category.replace(/_/g," ")}</strong>: {f.value}
       <small>Source OCR: {f.quote}</small></span>
     </label>;
    })}
    {qwen?.findings.length===0&&<p className="hint">No source-supported AI findings available. This does not mean there is no relevant evidence.</p>}
    <label>Interview narrative field
     <select value={narrativeTarget} onChange={e=>setNarrativeTarget(e.target.value)}>
      {narrativeTargets.map(t=><option value={t.key} key={t.key}>{t.label}</option>)}
     </select>
    </label>
    <button type="button" className="secondary" disabled={!canSubmitSuggestions||selectedNarratives.length===0}
     onClick={()=>onPrefill(narrativeSuggestion,documentCase)}>Review {selectedNarratives.length} selected source quotations in interview →</button>
   </section>
   <section className="review">
    <h2>Source quality and document-level review</h2>
    {document.pages.map(p=><details key={p.page}><summary>Page {p.page} · {p.method}{p.warning?" · OCR warning":""}</summary>
      {p.warning&&<p className="field-warning">{p.warning}</p>}
      <pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere",maxHeight:"18rem",overflow:"auto"}}>{p.text||"[No OCR text. Inspect original and request a legible replacement if necessary.]"}</pre>
     </details>)}
    <label>Outcome<select value={review} onChange={e=>setReview(e.target.value as Review)} disabled={busy}>
     <option value="PendingHumanReview">Pending human review</option>
     <option value="HumanVerified">Document-level review completed</option>
     <option value="Rejected">Reject proposed interpretation</option>
     <option value="NeedsMoreEvidence">Request better copy or more evidence</option>
    </select></label>
    <label>Reviewer identifier<input value={reviewer} onChange={e=>setReviewer(e.target.value)}/></label>
    <label>Review rationale<textarea rows={3} value={rationale} onChange={e=>setRationale(e.target.value)}/></label>
    <p className="hint">To persist this document-level review with the encrypted original, enter at least three characters of reviewer ID and twelve characters of rationale, then attach the original. Extracted proposals remain session-only unless individually reviewed and applied.</p>
   </section>
  </>}
 </section>;
}
