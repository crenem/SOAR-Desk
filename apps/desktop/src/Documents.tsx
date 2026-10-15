import { useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

type Page = { page: number; text: string; method: string; warning: string | null };
type Document = { document_id: string; sha256: string; pages: Page[] };
type ModelAnswer = { choice?: string; answer_confidence?: number; probabilities?: Record<string,number>; confidence?: number; noul?: number };
type LayaResult = { model: string; truncated?: boolean; document_type?: { answer?: ModelAnswer; mode?: string; model?: string; usage?: { truncated?: boolean; state_tokens_dropped?: number } }; functional_evidence?: { answer?: ModelAnswer; mode?: string; model?: string; usage?: { truncated?: boolean; state_tokens_dropped?: number } } };
type Segment = { page: number; index: number; text: string; result?: LayaResult; error?: string };
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
export default function Documents() {
  const [confirmed,setConfirmed] = useState(false);
  const [path,setPath] = useState("");
  const [document,setDocument] = useState<Document | null>(null);
  const [segments,setSegments] = useState<Segment[]>([]);
  const [progress,setProgress] = useState("");
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [review,setReview] = useState<Review>("PendingHumanReview");
  const [reviewer,setReviewer] = useState("");
  const [rationale,setRationale] = useState("");
  const generation = useRef(0);

  async function ingest(filePath:string) {
    const run = ++generation.current;
    setPath(filePath);setDocument(null);setSegments([]);setError("");setReview("PendingHumanReview");setReviewer("");setRationale("");
    setBusy(true);setProgress("Extracting document text and performing OCR…");
    try {
      const doc = await invoke<Document>("extract_synthetic_document",{request:{path:filePath,synthetic_confirmed:true}});
      if (generation.current !== run) return;
      setDocument(doc);
      const chunks = doc.pages.flatMap(splitPage);
      setSegments(chunks);
      if (!chunks.length) {setError("No readable text was found. Verify the original scan and OCR installation.");return;}
      // Inference is sequential to avoid loading multiple heavyweight ARM64 model processes.
      const output:Segment[] = [...chunks];
      for (let i=0;i<chunks.length;i++) {
        if (generation.current !== run) return;
        setProgress(`Classifying passage ${i+1} of ${chunks.length} (page ${chunks[i].page})…`);
        try {
          const result=await invoke<LayaResult>("classify_synthetic_text",{request:{text:chunks[i].text,synthetic_confirmed:true}});
          output[i]={...chunks[i],result};
        } catch(e) {output[i]={...chunks[i],error:String(e)};}
        if (generation.current === run) setSegments([...output]);
      }
      setProgress("Document-wide assessment prepared; human verification required.");
    } catch(e) {if (generation.current === run) setError(String(e));}
    finally {if (generation.current === run) setBusy(false);}
  }
  async function browse() {
    if (!confirmed || busy) return;
    setError("");
    try {
      const selected=await open({multiple:false,directory:false,title:"Select a synthetic evidence document",
        filters:[{name:"PDF and images",extensions:["pdf","png","jpg","jpeg","tif","tiff"]}]});
      if (typeof selected === "string") await ingest(selected);
    } catch(e) {setError("Unable to select document: "+String(e));}
  }
  const summary=summarise(segments);
  const readyToReview=!busy && !!document && segments.length>0 && review!=="PendingHumanReview" && !!reviewer.trim() && !!rationale.trim();
  return <section className="panel" aria-label="Document intake and evidence assessment">
    <div className="eyebrow">DOCUMENT PROCESSING · SYNTHETIC TEST DATA ONLY</div>
    <h1>Document intake and evidence review</h1>
    <p className="intro">Select a fictional document. Text extraction, OCR where needed, passage classification and document-level synthesis run automatically. Results are proposals—not disability or service decisions.</p>
    <label className="checkline"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/>I confirm the selected document contains only fictional test data and no identifying patient records.</label>
    <button type="button" className="primary" disabled={!confirmed||busy} onClick={browse}>Browse and analyze document…</button>
    {path && <p className="muted" style={{overflowWrap:"anywhere"}}><strong>Selected file:</strong> {path}</p>}
    {progress && <p role="status" aria-live="polite">{progress}</p>}
    {busy && <progress aria-label="Document processing in progress" />}
    {error && <div className="error" role="alert"><strong>Document processing issue</strong><p>{error}</p></div>}
    {document && <>
      <section className="review">
        <h2>Document-wide proposed assessment</h2>
        <p className="muted">Document {document.document_id} · {document.pages.length} pages · {segments.length} passages</p>
        <p><strong>Likely document type:</strong> {summary.category}</p>
        <p><strong>Processing:</strong> {summary.processed} of {summary.total} passages classified; {summary.failed} incomplete or failed.</p>
        <p><strong>Functional evidence:</strong> {summary.functional}</p>
        <p><strong>Review readiness:</strong> {busy ? "Processing" : summary.status}</p>
        <p className="muted">This assessment combines passage classifications, not clinical findings. It cannot establish disability, severity, duration, or eligibility. Uncertainty and conflicting classifications require human examination.</p>
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
