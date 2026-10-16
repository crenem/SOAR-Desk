import { useEffect,useMemo,useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open,save } from "@tauri-apps/plugin-dialog";
import { buildDraftPackage,type PackageInput } from "./application-package";
import VaultLab from "./VaultLab";

type Props={input:PackageInput;onRestore:(input:PackageInput)=>void};
export default function PackageExport({input,onRestore}:Props){
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
   if(!acknowledged){setPdfError("Confirm fictional-only data before saving.");return;}
   setPdfBusy(true);
   try{
     const data=buildDraftPackage(input);
     const selected=data.forms.find(form=>form.form_id==="SSA-16");
     if(!selected || selected.reference_only){throw new Error("Select SSDI to create an SSA-16 training draft.");}
     const output=await save({
       title:"Save fictional SSA-16 review PDF",
       defaultPath:data.case_reference+"-SSA-16-SYNTHETIC-DRAFT.pdf",
       filters:[{name:"PDF document",extensions:["pdf"]}]
     });
     if(!output){setPdfResult("Export canceled. No PDF created.");return;}
     const details=await invoke<{output:string;fields_populated:number;synthetic_only:boolean;ready_for_ssa_submission:boolean}>(
       "export_synthetic_ssa16_pdf",
       {request:{output_path:output,package:data,synthetic_confirmed:true}}
     );
     if(details.synthetic_only!==true||details.ready_for_ssa_submission!==false){
       throw new Error("PDF worker returned an unexpected safety status.");
     }
     setPdfResult("Synthetic SSA-16 saved to "+details.output+" ("+details.fields_populated+" mapped responses). Not a complete SSA application.");
   }catch(e){setPdfError(e instanceof Error?e.message:String(e));}
   finally{setPdfBusy(false);}
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
  <div className="review">
    <h3>Original SSA-16 PDF — controlled training preview</h3>
    <p className="muted">Create a locally rendered, conspicuously watermarked copy of the <strong>September 2025 SSA-16</strong>. Only individually verified widget mappings are populated. Unmapped questions, real signatures, bank information and SSA-only fields remain blank.</p>
    <p className="hint">The seven-page original form layout is preserved. The output is an interactive XFA-based review copy, not a flattened or approved final filing form. SSA-3368 PDF field binding remains disabled pending independent source-template verification.</p>
    <div className="example">
      <strong>Blank SSA-16 template:</strong> {templateStatus?.message??"Checking local template..."}
      <p className="hint">If SSA blocks automatic downloads, download the original PDF using a browser (or reuse your blank SSA-16 file) and select it here. SOAR Desk verifies it against the reviewed original before installing it. This does not upload the file.</p>
      <button type="button" className="secondary" disabled={templateBusy}
        onClick={installSsa16}>{templateBusy?"Verifying template...":"Install SSA-16 PDF from file…"}</button>
      {templateError&&<p className="error" role="alert">{templateError}</p>}
    </div>
    <button type="button" className="secondary" disabled={pdfBusy||!acknowledged||!!preview.error||!input.programs.includes("ssdi")||!templateStatus?.installed} onClick={exportSsa16Preview}>
      {pdfBusy?"Rendering…":"Save synthetic SSA-16 PDF…"}
    </button>
    {pdfResult&&<p className="success" role="status">{pdfResult}</p>}
    {pdfError&&<p className="error" role="alert">{pdfError}</p>}
  </div>
  <VaultLab input={input} onRestore={onRestore}/>
  {result&&<p className="success" role="status">{result}</p>}
  {error&&<p className="error" role="alert">{error}</p>}
  <p className="hint">You choose the local file path. The exporter refuses to overwrite existing files. The JSON is not encrypted: never use it with real applicant information. Nothing is sent to SSA or an external service.</p>
 </section>;
}
