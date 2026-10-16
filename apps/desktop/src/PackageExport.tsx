import { useEffect,useMemo,useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open,save } from "@tauri-apps/plugin-dialog";
import { buildDraftPackage,type PackageInput } from "./application-package";

type Props={input:PackageInput};
export default function PackageExport({input}:Props){
 const training=input.syntheticOnly!==false;
 const [acknowledged,setAcknowledged]=useState(false);
 const [busy,setBusy]=useState(false);
 const [pdfBusy,setPdfBusy]=useState(false);
 const [pdfResult,setPdfResult]=useState("");
 const [pdfError,setPdfError]=useState("");
 const [templateStatus,setTemplateStatus]=useState<{installed:boolean;message:string}|null>(null);
 const [templateBusy,setTemplateBusy]=useState(false);
 const [templateError,setTemplateError]=useState("");
 useEffect(()=>{
   let mounted=true;
   invoke<{installed:boolean;message:string}>("ssa16_template_status")
     .then(value=>{if(mounted)setTemplateStatus(value);})
     .catch(error=>{if(mounted)setTemplateError(error instanceof Error?error.message:String(error));});
   return ()=>{mounted=false;};
 },[]);
 async function installSsa16(){
   setTemplateError("");
   setTemplateBusy(true);
   try{
     const selected=await open({title:"Select the ORIGINAL BLANK SSA-16 (09-2025) PDF",
       multiple:false,directory:false,filters:[{name:"Official SSA PDF",extensions:["pdf"]}]});
     if(typeof selected!=="string")return;
     const result=await invoke<{installed:boolean;message:string}>("install_ssa16_template",{sourcePath:selected});
     setTemplateStatus(result);
   }catch(error){setTemplateError(error instanceof Error?error.message:String(error));}
   finally{setTemplateBusy(false);}
 }

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
 async function exportSsa16Preview(){
   setPdfError("");setPdfResult("");
   if(!acknowledged){setPdfError("Confirm the selected mode and the incomplete/unsigned export first.");return;}
   setPdfBusy(true);
   try{
     const data=buildDraftPackage(input);
     const selected=data.forms.find(form=>form.form_id==="SSA-16");
     if(!selected || selected.reference_only){throw new Error("Select SSDI to create an SSA-16 training draft.");}
     const output=await save({
       title:training?"Save fictional SSA-16 review PDF":"Save unsigned SSA-16 working PDF (contains personal information)",
       defaultPath:data.case_reference+(training?"-SSA-16-SYNTHETIC-DRAFT.pdf":"-SSA-16-UNSIGNED-REVIEW.pdf"),
       filters:[{name:"PDF document",extensions:["pdf"]}]
     });
     if(!output){setPdfResult("Export canceled. No PDF created.");return;}
     const details=await invoke<{output:string;fields_populated:number;synthetic_only:boolean;ready_for_ssa_submission:boolean}>(
       training?"export_synthetic_ssa16_pdf":"export_local_ssa16_working_pdf",
       {request:{output_path:output,package:data,synthetic_confirmed:training,local_risk_acknowledged:!training}}
     );
     if(details.synthetic_only!==training||details.ready_for_ssa_submission!==false){
       throw new Error("PDF worker returned an unexpected signature/readiness status.");
     }
     setPdfResult((training?"Training":"UNSIGNED working")+" SSA-16 saved to "+details.output+
       " ("+details.fields_populated+" mapped responses). Review every question; signatures and SSA submission remain separate.");
   }catch(e){setPdfError(e instanceof Error?e.message:String(e));}
   finally{setPdfBusy(false);}
 }
 return <section className="panel">
  <div className="eyebrow">{training?"TRAINING OUTPUT":"RESTRICTED LOCAL CASE · UNSIGNED REVIEW OUTPUT"}</div>
  <h2>Form packet preparation</h2>
  <p className="muted">{training?"Generate a fictional review-only JSON research draft and limited SSA-16 training PDF.":"Review collected facts and prepare an unsigned SSA-16 working PDF using the reviewed official template. This working PDF is unencrypted and may contain real personal information. Only mapped fields are populated; the claimant must review and complete missing fields before using an accepted signature and filing channel."}</p>
  {preview.error?<p className="error" role="alert">{preview.error}</p>:draft&&<>
   <div className="submit-summary">
    <div><strong>{draft.forms.length}</strong><span>Selected form outlines (partial mappings)</span></div>
    <div><strong>{draft.summary.unresolved_questions}</strong><span>Unanswered mapped questions</span></div>
    <div><strong>{draft.summary.unverified_evidence}</strong><span>Evidence sources not verified</span></div>
   </div>
   <div className="example">
    <strong>{training?"Not an official SSA submission package":"Unsubmitted, unsigned working form"}</strong>
    <p>Source question crosswalks remain incomplete. Even when all mapped questions have answers, SOAR Desk <strong>cannot</strong> certify that the form is complete, signed, submitted or accepted by SSA.</p>
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
   {training?"I confirm this workspace contains only fictional training information and understand the export is not a completed SSA form.":"I have organizational authorization to export this case. I understand the PDF is UNENCRYPTED, contains personal details, and is a PARTIAL, UNSIGNED working draft requiring manual review, completion, signature and filing."}
  </label>
  {training&&<button type="button" className="primary" disabled={busy||!acknowledged||!!preview.error} onClick={exportDraft}>
   {busy?"Saving…":"Save fictional draft JSON…"}
  </button>}
  <div className="review">
    <h3>{training?"Original SSA-16 PDF — training preview":"SSA-16 — unsigned working PDF"}</h3>
    <p className="muted">Create a locally rendered, visibly labeled {training?"training PDF":"unsigned, incomplete working PDF"} using the <strong>September 2025 SSA-16</strong>. Only independently reviewed widget mappings are populated. Unmapped questions, signatures, bank account information and SSA-only fields remain blank.</p>
    <p className="hint">The seven-page original form layout is preserved. The output is interactive and requires review in a PDF viewer; it is not a verified complete or signed claim. SSA-3368 mapping remains blocked pending source-template field verification.</p>
    <div className="example">
      <strong>Blank SSA-16 template:</strong> {templateStatus?.message??"Checking local template..."}
      <p className="hint">If SSA blocks automatic downloads, download the original PDF using a browser (or reuse your blank SSA-16 file) and select it here. SOAR Desk verifies it against the reviewed original before installing it. This does not upload the file.</p>
      <button type="button" className="secondary" disabled={templateBusy}
        onClick={installSsa16}>{templateBusy?"Verifying template...":"Install SSA-16 PDF from file…"}</button>
      {templateError&&<p className="error" role="alert">{templateError}</p>}
    </div>
    <button type="button" className="secondary" disabled={pdfBusy||!acknowledged||!!preview.error||!input.programs.includes("ssdi")||!templateStatus?.installed} onClick={exportSsa16Preview}>
      {pdfBusy?"Rendering…":training?"Save fictional SSA-16 PDF…":"Save unsigned SSA-16 working PDF…"}
    </button>
    {pdfResult&&<p className="success" role="status">{pdfResult}</p>}
    {pdfError&&<p className="error" role="alert">{pdfError}</p>}
  </div>
  {result&&<p className="success" role="status">{result}</p>}
  {error&&<p className="error" role="alert">{error}</p>}
  <p className="hint">You choose the local output path. Existing files cannot be overwritten. Never use unencrypted JSON exports for personal records. Working PDFs are plaintext and must be protected by your organization. Nothing is transmitted to SSA automatically.</p>
 </section>;
}
