import { useEffect,useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { extractMetadata, type MetadataCandidate, type MetadataCategory } from "./metadata";
import { reviewedSuggestions,type PrefillSuggestion } from "./document-prefill";
import type {AttachedSource} from "./evidence-attachment";

type Page = { page: number; text: string; method: string; warning: string | null };
type Document = { document_id: string; sha256: string; pages: Page[] };
type ModelAnswer = { choice?: string; answer_confidence?: number; probabilities?: Record<string,number>; confidence?: number; noul?: number };
type LayaResult = { model: string; truncated?: boolean; document_type?: { answer?: ModelAnswer; mode?: string; model?: string; usage?: { truncated?: boolean; state_tokens_dropped?: number } }; functional_evidence?: { answer?: ModelAnswer; mode?: string; model?: string; usage?: { truncated?: boolean; state_tokens_dropped?: number } } };
type Segment = { page: number; index: number; text: string; result?: LayaResult; error?: string };
type QwenFinding = {category:string; value:string; quote:string; review_status:string};
type QwenResult = {model:string; backend?:"npu"|"cpu"; summary:string; findings:QwenFinding[]; proposed_only:boolean};
type QwenSegment = {page:number; index:number; data?:QwenResult; error?:string};
type Review = "PendingHumanReview" | "HumanVerified" | "Rejected" | "NeedsMoreEvidence";
const MAX_SEGMENT = 1100;
const TYPE_LABELS: Record<string,string> = {
  clinical_note: "Clinical note", hospital_summary: "Hospital encounter / discharge summary",
  work_history: "Employment or work-history record", other: "Other / undetermined"
};
function splitPage(page: Page): Segment[] {
  const paragraphs = page.text.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
  const parts: string[] = [];
  let current = "";
  for (const p of paragraphs) {
    let remaining = p;
    while (remaining.length > 0) {
      const room = MAX_SEGMENT - current.length - (current ? 2 : 0);
      if (room < 100) { parts.push(current); current = ""; continue; }
      if (remaining.length <= room) { current += (current ? "\n\n" : "") + remaining; break; }
      let cut = remaining.lastIndexOf(" ", room);
      if (cut < Math.floor(room / 2)) cut = room;
      current += (current ? "\n\n" : "") + remaining.slice(0,cut).trim();
      parts.push(current); current = "";
      remaining = remaining.slice(cut).trimStart();
    }
  }
  if (current) parts.push(current);
  return parts.map((text,index) => ({page:page.page,index:index+1,text}));
}
function confidence(answer?: ModelAnswer): number | undefined {
  return typeof answer?.answer_confidence === "number" ? answer.answer_confidence : undefined;
}
function summarise(parts: Segment[]) {
  const complete = parts.filter(p => p.result && !p.result.truncated &&
    !p.result.document_type?.usage?.truncated && !p.result.functional_evidence?.usage?.truncated &&
    !p.result.document_type?.usage?.state_tokens_dropped && !p.result.functional_evidence?.usage?.state_tokens_dropped);
  const votes = new Map<string, number>();
  for (const segment of complete) {
    const answer = segment.result?.document_type?.answer;
    if (answer?.choice && confidence(answer) !== undefined && confidence(answer)! >= 0.55) {
      votes.set(answer.choice,(votes.get(answer.choice) ?? 0) + confidence(answer)!);
    }
  }
  const ordered = [...votes.entries()].sort((a,b)=>b[1]-a[1]);
  const category = ordered[0] && (ordered.length === 1 || ordered[0][1] >= ordered[1][1]*1.5) ?
    TYPE_LABELS[ordered[0][0]] ?? "Other / undetermined" : "Uncertain — human classification required";
  const scored = complete.filter(p => typeof p.result?.functional_evidence?.answer?.noul === "number");
  return {category, processed:complete.length, total:parts.length, failed:parts.length-complete.length,
    functional:scored.length ? "Functional-evidence signals available for review; verify each against source passages." : "No reliable functional-evidence classification available.",
    status: parts.length && complete.length === parts.length && ordered.length > 0 ? "Ready for human review" : "Incomplete — review required"};
}
export default function Documents({caseReference,syntheticOnly,onPrefill,onEvidenceAttached}:{caseReference:string;syntheticOnly:boolean;onPrefill:(items:PrefillSuggestion[],caseReference:string)=>void;onEvidenceAttached:(source:AttachedSource,caseReference:string)=>void}) {
  const [confirmed,setConfirmed] = useState(false);
  const [path,setPath] = useState("");
  const [documentCase,setDocumentCase]=useState("");
  const [document,setDocument] = useState<Document | null>(null);
  const [segments,setSegments] = useState<Segment[]>([]);
  const [metadata,setMetadata] = useState<MetadataCandidate[]>([]);
  const [qwen,setQwen] = useState<QwenSegment[]>([]);
  const [progress,setProgress] = useState("");
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [review,setReview] = useState<Review>("PendingHumanReview");
  const [reviewer,setReviewer] = useState("");
  const [rationale,setRationale] = useState("");
  const generation = useRef(0);
  useEffect(()=>{
    // Do not leave old source-document plaintext or review state visible after
    // changing to another case. Cancel outstanding inference sequences.
    generation.current++;
    setDocument(null);setSegments([]);setMetadata([]);setQwen([]);
    setPath("");setDocumentCase("");setConfirmed(false);setProgress("");
    setError("");setReview("PendingHumanReview");setReviewer("");setRationale("");
    setBusy(false);
  },[caseReference,syntheticOnly]);

  async function ingest(filePath:string) {
    const run = ++generation.current;
    setPath(filePath);setDocumentCase(caseReference);setDocument(null);setSegments([]);setMetadata([]);setQwen([]);setError("");setReview("PendingHumanReview");setReviewer("");setRationale("");
    setBusy(true);setProgress("Extracting document text and performing OCR…");
    try {
      const doc = await invoke<Document>("extract_synthetic_document",{request:{path:filePath,synthetic_confirmed:syntheticOnly,local_risk_acknowledged:!syntheticOnly}});
      if (generation.current !== run) return;
      setDocument(doc);
      setMetadata(extractMetadata(doc.pages));
      const chunks = doc.pages.flatMap(splitPage);
      setSegments(chunks);
      if (!chunks.length) {setError("No readable text was found. Verify the original scan and OCR installation.");return;}
      // Inference is sequential to avoid loading multiple heavyweight ARM64 model processes.
      const output:Segment[] = [...chunks];
      for (let i=0;i<chunks.length;i++) {
        if (generation.current !== run) return;
        setProgress(`Classifying passage ${i+1} of ${chunks.length} (page ${chunks[i].page})…`);
        try {
          const result=await invoke<LayaResult>("classify_synthetic_text",{request:{text:chunks[i].text,synthetic_confirmed:syntheticOnly,local_risk_acknowledged:!syntheticOnly}});
          output[i]={...chunks[i],result};
        } catch(e) {output[i]={...chunks[i],error:String(e)};}
        if (generation.current === run) setSegments([...output]);
      }
      setProgress("Laya complete. Extracting proposed clinical findings with Qwen3 4B…");
      const extracted: QwenSegment[] = [];
      for (let i=0;i<chunks.length;i++) {
        if (generation.current !== run) return;
        setProgress(`Qwen3 4B: passage ${i+1} of ${chunks.length} (page ${chunks[i].page})…`);
        try {
          const data=await invoke<QwenResult>("extract_qwen_candidates",{request:{text:chunks[i].text,synthetic_confirmed:true}});
          extracted.push({page:chunks[i].page,index:chunks[i].index,data});
        } catch(e) {
          extracted.push({page:chunks[i].page,index:chunks[i].index,error:String(e)});
          // Do not repeatedly call an unavailable model server for every passage.
          if (String(e).includes("not available on 127.0.0.1:8080")) {
            setQwen([...extracted]);break;
          }
        }
        if (generation.current===run)setQwen([...extracted]);
      }
      setProgress("Document assessment ready. All model-generated findings require human review.");
    } catch(e) {if (generation.current === run) setError(String(e));}
    finally {if (generation.current === run) setBusy(false);}
  }
  async function attachAnalyzedDocument(){
    if(!document||!path||documentCase!==caseReference||busy)return;
    setError("");setBusy(true);
    try{
      const attached=await invoke<AttachedSource>("attach_evidence_document",{request:{
        source_path:path,case_reference:caseReference,expected_sha256:document.sha256,
        synthetic_confirmed:syntheticOnly,local_risk_acknowledged:!syntheticOnly
      }});
      onEvidenceAttached(attached,caseReference);
    }catch(e){setError("Encrypted attachment could not be created: "+String(e));}
    finally{setBusy(false);}
  }
  async function browse() {
    if (!confirmed || busy) return;
    setError("");
    try {
      const selected=await open({multiple:false,directory:false,title:syntheticOnly?"Select a fictional evidence document":"Select a locally authorized evidence document",
        filters:[{name:"PDF and images",extensions:["pdf","png","jpg","jpeg","tif","tiff"]}]});
      if (typeof selected === "string") await ingest(selected);
    } catch(e) {setError("Unable to select document: "+String(e));}
  }
  const summary=summarise(segments);
  const inferenceBackends=[...new Set(qwen.map(item=>item.data?.backend).filter(Boolean))];
  const qwenFindings=qwen.flatMap(s=>(s.data?.findings??[]).map(f=>({...f,page:s.page,segment:s.index})));
  const qwenFailures=qwen.filter(s=>s.error).length;
  const metadataGroups: MetadataCategory[] = ["Document","Patient","Encounter","Diagnoses","Medical history","Psychiatric history","Medications","Allergies","Functional evidence"];
  const verifiedMetadata = metadata.filter(m=>m.status==="HumanVerified").length;
  const fillCandidates = document && documentCase===caseReference ? reviewedSuggestions(metadata,document.sha256,documentCase) : [];
  function updateMetadata(id:string, patch:Partial<MetadataCandidate>){setMetadata(items=>items.map(m=>m.id===id?{...m,...patch,status:patch.value!==undefined?"PendingHumanReview":(patch.status??m.status)}:m)); setReview("PendingHumanReview");}
  const readyToReview=!busy && !!document && segments.length>0 && review!=="PendingHumanReview" && !!reviewer.trim() && !!rationale.trim();
  return <section className="panel" aria-label="Document intake and evidence assessment">
    <div className="eyebrow">{syntheticOnly?"DOCUMENT PROCESSING · SYNTHETIC TEST DATA ONLY":"RESTRICTED LOCAL DOCUMENT ANALYSIS · NOT DEPLOYMENT-APPROVED"}</div>
    <h1>Document intake and evidence review</h1>
    <p className="intro">Select {syntheticOnly?"a fictional":"an organization-authorized local"} document. Text extraction, OCR, classification and source-grounded proposals run on this computer. Results are not disability determinations. Original document bytes and complete model analyses are not yet part of the encrypted case vault.</p>
    <label className="checkline"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/>{syntheticOnly?"I confirm the selected document contains only fictional test information.":"I am authorized by the nonprofit to process this document locally. I understand this development version has not completed a PHI/security review; its inference server receives content over local loopback and extracted text is held in application memory."}</label>
    <button type="button" className="primary" disabled={!confirmed||busy} onClick={browse}>Browse and analyze document…</button>
    {path && <p className="muted" style={{overflowWrap:"anywhere"}}><strong>Selected file:</strong> {path}</p>}
    {progress && <p role="status" aria-live="polite">{progress}</p>}
    {busy && <progress aria-label="Document processing in progress" />}
    {error && <div className="error" role="alert"><strong>Document processing issue</strong><p>{error}</p></div>}
    {document && <>
      <section className="review">
        <h2>Document-wide proposed assessment</h2>
        <p className="muted">Document {document.document_id} · {document.pages.length} pages · {segments.length} passages</p>
        <div className="case-document-actions">
          <button type="button" className="primary" disabled={busy||documentCase!==caseReference}
             onClick={()=>void attachAnalyzedDocument()}>Attach original securely to this case →</button>
          <p className="hint">Requires a writable unlocked case vault. The native backend encrypts the original and checks that its SHA-256 still matches this analyzed document. This action does not mark clinical interpretations verified.</p>
        </div>
        <p><strong>Likely document type:</strong> {summary.category}</p>
        <p><strong>Processing:</strong> {summary.processed} of {summary.total} passages classified; {summary.failed} incomplete or failed.</p>
        <p><strong>Functional evidence:</strong> {summary.functional}</p>
        <p><strong>Review readiness:</strong> {busy ? "Processing" : summary.status}</p>
        <p className="muted">This assessment combines passage classifications, not clinical findings. It cannot establish disability, severity, duration, or eligibility. Uncertainty and conflicting classifications require human examination.</p>
      </section>
      <section className="review">
        <h2>Qwen3 4B · Proposed clinical evidence summary</h2>
        <p className="muted">Locally generated, unverified and source-linked. The model must not decide SSI/SSDI eligibility. A quotation match is a basic safeguard, not proof the interpretation is accurate.</p>
        <p><strong>Inference backend:</strong> {inferenceBackends.length ? inferenceBackends.map(b=>b==="npu"?"Windows GenieX (NPU-capable)":"Ubuntu llama.cpp (CPU)").join(", ") : (busy ? "Waiting for Qwen…" : "Not available")}</p>
        <p><strong>{qwenFindings.length}</strong> proposed clinical findings · <strong>{qwenFailures}</strong> inference errors.</p>
        {qwen.filter(s=>s.error).map(s=><p key={`${s.page}-${s.index}`} role="alert" className="error">Page {s.page}, passage {s.index}: {s.error}</p>)}
        {qwen.length===0 && <p>{busy ? "Waiting for the Laya stage to complete…" : "Qwen results not available. Start the local llama.cpp server; see docs/QWEN-LOCAL.md."}</p>}
        {qwenFindings.length===0 && qwen.length>0 && <p>No verifiable quoted findings returned. Inspect the original document; do not infer that no clinical evidence exists.</p>}
        {Array.from(new Set(qwenFindings.map(f=>f.category))).map(category=><details key={category} open={category==="diagnosis"||category==="functional_limitation"}>
          <summary><strong>{category.replace(/_/g," ")}</strong> ({qwenFindings.filter(f=>f.category===category).length})</summary>
          {qwenFindings.filter(f=>f.category===category).map((f,i)=><div className="question" key={`${f.page}-${f.segment}-${i}`}>
            <p><strong>Page {f.page}, passage {f.segment}:</strong> {f.value}</p>
            <blockquote style={{whiteSpace:"pre-wrap"}}>{f.quote}</blockquote>
            <p className="muted">Pending human review — confirm the proposed interpretation against the original PDF.</p>
          </div>)}
        </details>)}
      </section>
      <section className="review">
        <h2>Structured metadata · source-linked proposals</h2>
        <p className="muted">Extracted from explicit labels and section text; never inferred from diagnoses or clinical knowledge. Every proposed value starts unverified. Select an individual value to edit or reject it after checking the source.</p>
        <p><strong>{metadata.length}</strong> candidate fields · <strong>{verifiedMetadata}</strong> human verified · <strong>{metadata.filter(m=>m.status==="PendingHumanReview").length}</strong> pending</p>
        {metadata.length === 0 && <p>No clearly labeled fields were detected. Inspect the original document and enter necessary details manually in a later reviewed workflow; no missing values have been invented.</p>}
        {metadataGroups.map(group=>{
          const fields=metadata.filter(m=>m.category===group);
          return fields.length ? <details key={group} open={group==="Patient"||group==="Diagnoses"}>
            <summary><strong>{group}</strong> ({fields.length})</summary>
            {fields.map(m=><fieldset key={m.id} className="question">
              <legend>{m.field} · Page {m.page}</legend>
              <label>Extracted value<textarea rows={2} value={m.value} onChange={e=>updateMetadata(m.id,{value:e.target.value})}/></label>
              <p className="muted"><strong>Source passage:</strong> {m.excerpt}</p>
              <label>Human verification<select value={m.status} onChange={e=>updateMetadata(m.id,{status:e.target.value as MetadataCandidate["status"]})} disabled={busy}>
                <option value="PendingHumanReview">Pending human review</option>
                <option value="HumanVerified">Verified against original record</option>
                <option value="Rejected">Reject extracted value</option>
              </select></label>
            </fieldset>)}
          </details> : null;
        })}
        <div className="review">
          <h3>Prefill application fields</h3>
          <p className="muted">After verifying individual labeled values against the original document, send them to the application as suggestions. This does not automatically overwrite the interview or treat model output as fact. Conflicting values within the same document are excluded.</p>
          {documentCase!==caseReference&&<p className="error">This document was ingested for {documentCase}. Switch back to that case or ingest it again; its fields will not be applied to another case.</p>}
          <p><strong>{fillCandidates.length}</strong> verified, eligible applicant fields</p>
          <button type="button" className="primary" disabled={busy||fillCandidates.length===0}
             onClick={()=>onPrefill(fillCandidates,documentCase)}>Review {fillCandidates.length} suggestions in Application Preparation →</button>
        </div>
        <p className="muted">Clinical fields are candidate text excerpts, not normalized diagnoses or verified ICD-10 codes. Values and review selections are in memory only.</p>
      </section>
      <section className="review">
        <h2>Page-by-page evidence passages</h2>
        <p className="muted">Each passage retains its original page number. Expand to check the extracted wording against the actual source PDF.</p>
        {segments.map(s=><details key={`${s.page}-${s.index}`} style={{marginBottom:"0.75rem"}}>
          <summary><strong>Page {s.page}, passage {s.index}</strong> — {s.error ? "Classification unavailable" : s.result ? (TYPE_LABELS[s.result.document_type?.answer?.choice ?? ""] ?? "Classification uncertain") : "Awaiting analysis"}</summary>
          <p style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{s.text}</p>
          {s.result && <>
            <p><strong>Classification:</strong> {TYPE_LABELS[s.result.document_type?.answer?.choice ?? ""] ?? "Undetermined"} · confidence {confidence(s.result.document_type?.answer) === undefined ? "unavailable" : Math.round(confidence(s.result.document_type?.answer)!*100)+"%"}</p>
            <p><strong>Functional evidence signal:</strong> {typeof s.result.functional_evidence?.answer?.noul === "number" ? "Model score available (review original source; not a clinical conclusion)" : "Not available"}</p>
          </>}
          {s.error && <p role="alert">Laya: {s.error}</p>}
        </details>)}
      </section>
      <section className="review">
        <h2>Human decision on document evidence</h2>
        <p>No findings are automatically approved. Verify completeness, OCR fidelity, provenance and model suggestions before recording a document review. This does not decide whether the applicant qualifies for SSI/SSDI or SOAR services.</p>
        <label>Review outcome<select value={review} onChange={e=>setReview(e.target.value as Review)} disabled={busy}>
          <option value="PendingHumanReview">Pending human review</option>
          <option value="HumanVerified">Document evidence reviewed and verified</option>
          <option value="Rejected">Reject proposed interpretation</option>
          <option value="NeedsMoreEvidence">Needs additional evidence or correction</option>
        </select></label>
        <label>Fictitious reviewer identifier<input value={reviewer} onChange={e=>setReviewer(e.target.value)} disabled={busy}/></label>
        <label>Rationale<textarea rows={3} value={rationale} onChange={e=>setRationale(e.target.value)} disabled={busy} placeholder="Record what was verified and what remains uncertain."/></label>
        {readyToReview && <p className="success" role="status">Review fields completed in this session. No approval has been saved or signed; production audit controls are not implemented.</p>}
      </section>
    </>}
  </section>;
}
