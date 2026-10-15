import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

type Page = { page: number; text: string; method: string; warning: string | null };
type Document = { document_id: string; sha256: string; pages: Page[] };
type Review = "PendingHumanReview" | "HumanVerified" | "Rejected" | "NeedsMoreEvidence";
export default function Documents() {
  const [path, setPath] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [document, setDocument] = useState<Document | null>(null);
  const [page, setPage] = useState(0);
  const [edited, setEdited] = useState<Record<number,string>>({});
  const [classification, setClassification] = useState<unknown>(null);
  const [review, setReview] = useState<Review>("PendingHumanReview");
  const [reviewer, setReviewer] = useState("");
  const [rationale, setRationale] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function extract() {
    setBusy(true); setError(""); setClassification(null); setReview("PendingHumanReview"); setDocument(null); setEdited({});
    try { const result = await invoke<Document>("extract_synthetic_document", {request:{path,synthetic_confirmed:confirmed}}); setDocument(result); setPage(0); }
    catch(e) { setError(String(e)); } finally { setBusy(false); }
  }
  async function classify() {
    if (!document?.pages[page]) return;
    setBusy(true); setError(""); setClassification(null); setReview("PendingHumanReview");
    try { const data = await invoke<unknown>("classify_synthetic_text", {request:{text:edited[page] ?? document.pages[page].text, synthetic_confirmed:confirmed}}); setClassification(data); }
    catch(e) {setError(String(e));} finally {setBusy(false);}
  }
  const selected = document?.pages[page];
  return <section className="panel" aria-label="Synthetic document intake">
    <div className="eyebrow">DOCUMENT PROCESSING · DEVELOPMENT PREVIEW</div>
    <h1>Document intake & Laya</h1>
    <p className="intro">Extract local PDF or image text, classify with Laya, and verify every suggested classification. No persistent storage or real client documents.</p>
    <label className="checkline"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} />I confirm this document is entirely synthetic and contains no real client data.</label>
    <label>Absolute local file path<input value={path} onChange={e=>setPath(e.target.value)} placeholder="/home/user/Projects/test-data/example.pdf" /></label>
    <button className="primary" disabled={!confirmed || !path.trim() || busy} onClick={extract}>Extract text / OCR</button>
    {error && <div role="alert" className="error"><strong>Processing unavailable</strong><p>{error}</p></div>}
    {document && <section className="review">
      <h2>Extracted document</h2>
      <p className="muted">ID: {document.document_id} · SHA-256: {document.sha256} · {document.pages.length} page(s)</p>
      <label>Page<select value={page} onChange={e=>{setPage(Number(e.target.value));setClassification(null);setReview("PendingHumanReview");}}>{document.pages.map((p,i)=><option value={i} key={p.page}>Page {p.page} — {p.method}</option>)}</select></label>
      {selected && <>
        {selected.warning && <p role="status">{selected.warning}</p>}
        <label>Extracted text — corrections are temporary<textarea rows={16} value={edited[page] ?? selected.text} onChange={e=>{setEdited(s=>({...s,[page]:e.target.value}));setClassification(null);setReview("PendingHumanReview");}}/></label>
        <p className="muted">Compare against the source document using your local PDF viewer. This preview does not yet display the original page.</p>
        <button className="primary" disabled={busy || !confirmed} onClick={classify}>Classify this page with local Laya</button>
      </>}
    </section>}
    {classification !== null && <section className="review">
      <h2>Laya classification proposal</h2>
      <p className="muted">Unverified model output for document {document?.document_id}, page {selected?.page}. No finding is automatically accepted.</p>
      <pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{JSON.stringify(classification,null,2)}</pre>
      <label>Human review status<select value={review} onChange={e=>setReview(e.target.value as Review)}><option value="PendingHumanReview">Pending human review</option><option value="HumanVerified">Verified</option><option value="Rejected">Rejected</option><option value="NeedsMoreEvidence">Needs more evidence</option></select></label>
      <label>Fictitious reviewer identifier<input value={reviewer} onChange={e=>setReviewer(e.target.value)}/></label>
      <label>Review rationale<textarea value={rationale} rows={3} onChange={e=>setRationale(e.target.value)}/></label>
      {review !== "PendingHumanReview" && <p role="status" className={reviewer.trim() && rationale.trim() ? "success" : "error"}>{reviewer.trim() && rationale.trim() ? "Review fields complete for this session only; no decision was saved." : "Reviewer identifier and rationale are required to complete review."}</p>}
    </section>}
  </section>;
}
