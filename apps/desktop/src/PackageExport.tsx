import { useMemo,useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { buildDraftPackage,type PackageInput } from "./application-package";

type Props={input:PackageInput};
export default function PackageExport({input}:Props){
 const [acknowledged,setAcknowledged]=useState(false);
 const [busy,setBusy]=useState(false);
 const [result,setResult]=useState("");
 const [error,setError]=useState("");
 const preview=useMemo(()=>{
   try{return {package:buildDraftPackage(input,"2026-01-01T00:00:00.000Z"),error:""};}
   catch(e){return {package:null,error:e instanceof Error?e.message:String(e)};}
 },[input]);
 const draft=preview.package;
 async function exportDraft(){
   setError("");setResult("");
   if(!acknowledged){setError("Confirm that this is a synthetic-only, incomplete draft before saving.");return;}
   if(preview.error){setError(preview.error);return;}
   setBusy(true);
   try{
     // Capture the latest state at export time and include actual current UTC.
     const packageData=buildDraftPackage(input);
     const safeCase=packageData.case_reference.replace(/[^A-Za-z0-9_-]/g,"_");
     const chosen=await save({
       title:"Save synthetic SOAR Desk draft package",
       defaultPath:safeCase+"-draft-package.json",
       filters:[{name:"JSON document",extensions:["json"]}]
     });
     if(!chosen){setResult("Export canceled. No file was created.");return;}
     const created=await invoke<string>("export_synthetic_draft",{
       request:{path:chosen,content:JSON.stringify(packageData,null,2)+"\n",synthetic_confirmed:true}
     });
     setResult("Synthetic draft created at "+created+". This is not an SSA-submitted application.");
   }catch(e){setError(e instanceof Error?e.message:String(e));}
   finally{setBusy(false);}
 }
 return <section className="panel">
  <div className="eyebrow">PREPARATION OUTPUT · NO OFFICIAL SSA FORMS</div>
  <h2>Reviewable draft package</h2>
  <p className="muted">Generate an unencrypted JSON research/development draft containing only the current fictitious interview, mapped form questions, human evidence references, unresolved answers and staff-entered submission ledger. No medical-record files, official PDF forms, signatures or SSA receipts are bundled.</p>
  {preview.error?<p className="error" role="alert">{preview.error}</p>:draft&&<>
   <div className="submit-summary">
    <div><strong>{draft.forms.length}</strong><span>Selected form outlines (partial mappings)</span></div>
    <div><strong>{draft.summary.unresolved_questions}</strong><span>Unanswered mapped questions</span></div>
    <div><strong>{draft.summary.unverified_evidence}</strong><span>Evidence sources not verified</span></div>
   </div>
   <div className="example">
    <strong>Never an official SSA submission package</strong>
    <p>All form question crosswalks are incomplete. Even with no unanswered mapped questions, the program <strong>cannot</strong> certify SSA form completeness, generate an official filing or infer an eligibility decision.</p>
   </div>
   <h3>Included form outlines</h3>
   <div className="draft-form-overview">{draft.forms.map(f=><div className="draft-form-line" key={f.form_id}>
    <div><strong>{f.form_id}</strong> — {f.title}<p className="hint">Edition {f.edition} · {f.reference_only?"Reference only":"Partial question mapping"} · original <a href={f.official_url} rel="noreferrer" target="_blank">SSA form ↗</a></p></div>
    <span>{f.reference_only?"Not mapped":f.captured_questions+"/"+f.mapped_questions+" captured items"}</span>
   </div>)}</div>
   <h3>Source linkage</h3>
   <p><strong>{draft.evidence_register.length}</strong> manually indexed sources · <strong>{draft.evidence_register.filter(e=>e.status==="human_verified").length}</strong> marked human-verified.</p>
   {draft.source_reference_warnings.length>0&&<div className="error" role="alert"><strong>Missing source IDs</strong><ul>{draft.source_reference_warnings.map(s=><li key={s}>{s}</li>)}</ul></div>}
   <h3>Outstanding mapped answers</h3>
   <p className="hint">This is a preview of unmapped omissions, not a complete regulatory checklist.</p>
   {draft.forms.flatMap(f=>f.sections.flatMap(s=>s.questions.filter(q=>q.review==="not_asked").map(q=>({form:f.form_id,label:q.label,ref:q.ref})))).slice(0,25).map((q,i)=>
    <p className="hint" key={q.form+"-"+q.ref+"-"+i}>{q.form} · {q.ref}: {q.label}</p>)}
   {draft.summary.unresolved_questions>25&&<p className="hint">More unanswered fields are recorded in the exported file.</p>}
   <h3>External submission history</h3>
   <p>{draft.summary.manual_submissions} staff-reported submissions · {draft.summary.external_receipts_reported_verified} acknowledgments entered as human-verified (not independently checked by SOAR Desk).</p>
  </>}
  <label className="checkline draft-ack">
   <input type="checkbox" checked={acknowledged} onChange={e=>setAcknowledged(e.target.checked)}/>
   I confirm this workspace contains <strong>only fictional training information</strong> and understand the export is not a completed SSA form.
  </label>
  <button type="button" className="primary" disabled={busy||!acknowledged||!!preview.error} onClick={exportDraft}>
   {busy?"Saving…":"Save synthetic draft JSON…"}
  </button>
  {result&&<p className="success" role="status">{result}</p>}
  {error&&<p className="error" role="alert">{error}</p>}
  <p className="hint">You choose the local file path. The exporter refuses to overwrite existing files. The JSON is not encrypted: never use it with real applicant information. Nothing is sent to SSA or an external service.</p>
 </section>;
}
