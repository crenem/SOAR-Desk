import { useState, type Dispatch, type SetStateAction } from "react";
import { ADAPTERS, CHANNELS, DESTINATIONS, OFFICIAL_RESOURCES, PURPOSES,
  preparePacket, reportManualSubmission, stateOf, verifyExternalReceipt,
  type Channel, type Destination, type ManualSubmission, type OfficialReceipt,
  type Packet, type Purpose, type SubmissionLog } from "./ssa-submissions";
import type { Program } from "./forms";

type Props={log:SubmissionLog;setLog:Dispatch<SetStateAction<SubmissionLog>>;caseReference:string;programs:Program[]};
const defaults={purpose:"initial_application" as Purpose,destination:"ssa" as Destination,channel:"ssa_online" as Channel,
  description:"",documents:"",preparer:"SYN-REVIEWER",notes:""};
const newSubmission=():ManualSubmission=>({submittedOn:"",reportedBy:"",attested:false,evidenceNote:""});
const newReceipt=():OfficialReceipt=>({receiptOn:"",reference:"",verifiedBy:"",evidenceSource:""});
const cleanError=(error:unknown)=>error instanceof Error?error.message:String(error);
export default function SubmissionTracker({log,setLog,caseReference,programs}:Props){
 const [draft,setDraft]=useState(defaults);
 const [sent,setSent]=useState<Record<string,ManualSubmission>>({});
 const [receipts,setReceipts]=useState<Record<string,OfficialReceipt>>({});
 const [openRecord,setOpenRecord]=useState<string>("");
 const [error,setError]=useState("");
 const [feedback,setFeedback]=useState("");
 const active=log.records.filter(r=>r.caseReference===caseReference);
 const history=log.events.filter(e=>e.caseReference===caseReference);
 function updateDraft<K extends keyof typeof defaults>(key:K,value:(typeof defaults)[K]){
   setDraft(v=>({...v,[key]:value}));
 }
 function transaction(action:(old:SubmissionLog)=>SubmissionLog,success:string){
   // Validate synchronously; do not show confirmation if the model rejected a transition.
   try{
     const next=action(log);
     setLog(next);setError("");setFeedback(success);
   }catch(err){setError(cleanError(err));setFeedback("");}
 }
 function create(){
   const id="SYN-PKT-"+String(log.records.length+1).padStart(4,"0");
   const docs=draft.documents.split(/[\n,]+/g).map(s=>s.trim()).filter(Boolean);
   const packet:Packet={id,caseReference,purpose:draft.purpose,destination:draft.destination,
     channel:draft.channel,description:draft.description,documentRefs:docs,createdBy:draft.preparer,notes:draft.notes};
   transaction(old=>preparePacket(old,packet),"Prepared a local packet record. Nothing was transmitted to SSA.");
   // Only clear on validated creation; leave filled fields intact on error.
   try{preparePacket(log,packet);setDraft(defaults);setOpenRecord(id);}catch{ /* original transaction displayed error */ }
 }
 function submit(id:string){
   transaction(old=>reportManualSubmission(old,id,sent[id]??newSubmission()),
     "Staff-reported external submission recorded. SSA receipt has NOT been verified.");
   try{reportManualSubmission(log,id,sent[id]??newSubmission());setOpenRecord(id);}catch{ /* error already shown */ }
 }
 function receipt(id:string){
   transaction(old=>verifyExternalReceipt(old,id,receipts[id]??newReceipt()),
     "External acknowledgment documented from a human-reviewed source; this was not obtained through an SSA API.");
   try{verifyExternalReceipt(log,id,receipts[id]??newReceipt());setOpenRecord(id);}catch{ /* error already shown */ }
 }
 function patchSent(id:string,patch:Partial<ManualSubmission>){setSent(old=>({...old,[id]:{...(old[id]??newSubmission()),...patch}}));}
 function patchReceipt(id:string,patch:Partial<OfficialReceipt>){setReceipts(old=>({...old,[id]:{...(old[id]??newReceipt()),...patch}}));}
 return <section className="panel ssa-submission-panel">
  <div className="eyebrow">LOCAL CASE LOG · EXTERNAL SSA SUBMISSIONS</div>
  <h2>Submissions and SSA acknowledgments</h2>
  <p className="muted">Prepare a record of a packet, then document a filing or evidence upload you performed through an official channel. Only mark a receipt verified after checking an SSA/DDS acknowledgment yourself. <strong>This screen never sends data or determines case status.</strong></p>
  <div className="submit-summary">
   <div><strong>{active.filter(r=>stateOf(r)==="prepared").length}</strong><span>Prepared locally</span></div>
   <div><strong>{active.filter(r=>stateOf(r)==="reported_submitted").length}</strong><span>Submission reported; no receipt</span></div>
   <div><strong>{active.filter(r=>stateOf(r)==="receipt_verified").length}</strong><span>Acknowledgment logged</span></div>
  </div>
  <div className="submit-adapters">
   <strong>Integration adapters</strong>
   <p className="hint">The adapter boundary is implemented; only manual tracking is enabled. Restricted SSA services are disabled until there is a confirmed authorization and a tested transport.</p>
   {ADAPTERS.map(a=><div className="adapter-row" key={a.id}><span>{a.label}</span><small>{a.availability==="active_manual"?"Manual log available":"Not connected · no automatic upload"}</small></div>)}
  </div>
  <fieldset className="intake-repeat">
   <legend>1. Prepare a submission record</legend>
   <p className="hint">A prepared packet is a checklist entry, not a generated PDF or filed application. Case reference: <strong>{caseReference}</strong>. Selected programs: <strong>{programs.map(p=>p.toUpperCase()).join(" + ")}</strong>.</p>
   <div className="fieldgrid">
    <label>Purpose<select value={draft.purpose} onChange={e=>updateDraft("purpose",e.target.value as Purpose)}>{Object.entries(PURPOSES).map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></label>
    <label>Destination<select value={draft.destination} onChange={e=>updateDraft("destination",e.target.value as Destination)}>{Object.entries(DESTINATIONS).map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></label>
    <label>Actual or planned manual channel<select value={draft.channel} onChange={e=>updateDraft("channel",e.target.value as Channel)}>{Object.entries(CHANNELS).map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></label>
    <label>Fictitious preparer code<input value={draft.preparer} onChange={e=>updateDraft("preparer",e.target.value)}/></label>
   </div>
   <label>Packet description<input placeholder="e.g., synthetic initial SSDI claim preparation" value={draft.description} onChange={e=>updateDraft("description",e.target.value)}/></label>
   <label>Exact document/form references (comma or newline separated)<textarea rows={3} value={draft.documents} onChange={e=>updateDraft("documents",e.target.value)} placeholder="SSA-16 (09-2025), SSA-3368 (06-2024), SSA-827 (06-2024)"/></label>
   <label>Preparation notes (optional)<textarea rows={2} value={draft.notes} onChange={e=>updateDraft("notes",e.target.value)}/></label>
   <button className="primary" type="button" onClick={create}>Create local packet record</button>
  </fieldset>
  {error&&<p className="error" role="alert">{error}</p>}
  {feedback&&<p className="success" role="status">{feedback}</p>}
  <h3>2. Document real-world actions (synthetic test entries only)</h3>
  {active.length===0&&<p className="muted">No prepared packets yet. Do not confuse an unfilled interview with an SSA submission.</p>}
  {active.map(r=>{
    const status=stateOf(r);
    const work=sent[r.id]??newSubmission();
    const confirmed=receipts[r.id]??newReceipt();
    return <article className="submission-record" key={r.id}>
      <div className="rowheader">
        <div><strong>{r.id}: {r.description}</strong>
          <p className="hint">{PURPOSES[r.purpose]} · {CHANNELS[r.channel]} · {DESTINATIONS[r.destination]}</p></div>
        <span className="submission-state">{status==="prepared"?"Prepared only":status==="reported_submitted"?"Reported submitted · unverified":"Externally acknowledged"}</span>
      </div>
      <p className="hint"><strong>Documents:</strong> {r.documentRefs.join(" · ")} · <strong>Prepared by:</strong> {r.createdBy}</p>
      {r.notes&&<p className="hint">{r.notes}</p>}
      <button className="secondary" type="button" aria-expanded={openRecord===r.id} onClick={()=>setOpenRecord(old=>old===r.id?"":r.id)}>{openRecord===r.id?"Hide record details":"Open record details"}</button>
      {openRecord===r.id&&<div className="submission-details">
        {status==="prepared"&&<>
          <h4>Staff-reported submission</h4>
          <p className="hint">Do this only after submission through the chosen external channel. We do not open a connection or send anything.</p>
          <div className="fieldgrid">
           <label>Date actually submitted (YYYY-MM-DD)<input type="date" value={work.submittedOn} onChange={e=>patchSent(r.id,{submittedOn:e.target.value})}/></label>
           <label>Staff code<input value={work.reportedBy} onChange={e=>patchSent(r.id,{reportedBy:e.target.value})}/></label>
          </div>
          <label>How was the submission performed or witnessed?<textarea rows={2} value={work.evidenceNote} onChange={e=>patchSent(r.id,{evidenceNote:e.target.value})} placeholder="Describe method and where its confirmation can be found"/></label>
          <label className="checkline"><input type="checkbox" checked={work.attested} onChange={e=>patchSent(r.id,{attested:e.target.checked})}/> I personally confirm this external submission actually occurred.</label>
          <button className="secondary" onClick={()=>submit(r.id)}>Record staff-reported submission</button>
        </>}
        {r.submitted&&<div>
          <h4>Submission reported by {r.submitted.reportedBy}</h4>
          <p>{r.submitted.submittedOn} · {r.submitted.evidenceNote}</p>
        </div>}
        {status==="reported_submitted"&&<>
          <h4>Independently verify external acknowledgment</h4>
          <p className="hint">A portal/upload transmission report or case note is not automatically evidence SSA accepted the claim. Record the exact identifier and how you checked it.</p>
          <div className="fieldgrid">
           <label>SSA/DDS acknowledgment date<input type="date" value={confirmed.receiptOn} onChange={e=>patchReceipt(r.id,{receiptOn:e.target.value})}/></label>
           <label>Fictitious reviewer code<input value={confirmed.verifiedBy} onChange={e=>patchReceipt(r.id,{verifiedBy:e.target.value})}/></label>
          </div>
          <label>Externally issued reference or acknowledgment identifier<input value={confirmed.reference} onChange={e=>patchReceipt(r.id,{reference:e.target.value})} placeholder="Synthetic external receipt example only"/></label>
          <label>Source independently checked<input value={confirmed.evidenceSource} onChange={e=>patchReceipt(r.id,{evidenceSource:e.target.value})} placeholder="e.g. ERE portal confirmation screen or SSA stamped copy"/></label>
          <button className="primary" type="button" onClick={()=>receipt(r.id)}>Record independently verified receipt</button>
        </>}
        {r.receipt&&<div className="example">
          <strong>Recorded acknowledgment (staff attestation)</strong>
          <p>{r.receipt.receiptOn} · External reference: {r.receipt.reference}<br/>
             Verified by: {r.receipt.verifiedBy} · Source: {r.receipt.evidenceSource}</p>
          <p className="hint">This record was entered by a person. SOAR Desk did not authenticate it with SSA.</p>
        </div>}
      </div>}
    </article>;
  })}
  <details className="intake-review">
   <summary><strong>Local activity history</strong> ({history.length} events)</summary>
   {history.length===0?<p>No events recorded.</p>:<ol>{history.map((e,i)=><li key={i}>{e.type.replace(/_/g," ")} · {e.packetId} · {e.actor}{e.type==="packet_prepared"?"":` · ${e.on}`}</li>)}</ol>}
  </details>
  <div className="submit-resources">
    <strong>Official SSA resources</strong>
    <p className="hint">These links open external sites on your instruction. They are not automated integrations.</p>
    {OFFICIAL_RESOURCES.map(r=><a key={r.url} target="_blank" rel="noreferrer" href={r.url}>{r.name} ↗</a>)}
  </div>
  <p className="hint">No form contents or PHI transmitted. No automatic case status, receipt creation or initial filing. Everything disappears when the application closes.</p>
 </section>;
}
