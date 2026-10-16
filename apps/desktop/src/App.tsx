import { useState } from "react";
import Documents from "./Documents";
import ApplicationWorkspace from "./ApplicationWorkspace";
import type {PrefillSuggestion} from "./document-prefill";
import { invoke } from "@tauri-apps/api/core";

type Status = "Documented" | "Reported" | "Unknown" | "NotSupported";
type EvidenceKind = "ApplicantReport" | "ClinicianRecord" | "HospitalRecord" | "WorkHistory" | "AdvocateObservation" | "Other";
type Decision = "AcceptForIntake" | "RequestMoreEvidence" | "ReferElsewhere";
type Finding = { status: Status; rationale: string; source_references: string[] };
type EvidenceSource = { reference: string; kind: EvidenceKind; summary: string };
type ScreeningRecommendation = { status: "AdvanceForReview" | "FurtherAssessment" | "ReviewServiceFit"; reasons: string[] };
const questions = [
  { key: "medically_determinable_impairment", title: "Impairment evidence", hint: "Record available clinical evidence or why medical documentation is not yet available." },
  { key: "severe_functional_impact", title: "Functional impact", hint: "Describe work-related limitations and consider combined or episodic impairments." },
  { key: "expected_duration", title: "Expected duration", hint: "Describe evidence relevant to the SSA duration requirement; do not infer duration from a diagnosis." },
  { key: "inability_to_sustain_work", title: "Work capacity", hint: "Describe consistency, attendance, accommodations, previous work, and limitations." },
] as const;
type QuestionKey = typeof questions[number]["key"];
const labels: Record<Status, string> = { Documented: "Documented", Reported: "Reported only", Unknown: "Unknown / records needed", NotSupported: "Not supported by available evidence" };
const initialFinding = (): Finding => ({ status: "Unknown", rationale: "", source_references: [] });
const initialAnswers = (): Record<QuestionKey, Finding> => ({ medically_determinable_impairment: initialFinding(), severe_functional_impact: initialFinding(), expected_duration: initialFinding(), inability_to_sustain_work: initialFinding() });
const syntheticSource: EvidenceSource = { reference: "SYN-001", kind: "ApplicantReport", summary: "Fictitious applicant interview; for interface testing only." };
const domains = ["Physical", "Cognitive", "Social", "Adaptation", "AttendanceAndPersistence"] as const;
type Domain = typeof domains[number];
const friendlyDomain: Record<Domain,string> = { Physical: "Physical abilities", Cognitive: "Cognition and concentration", Social: "Interacting with others", Adaptation: "Adapting and managing oneself", AttendanceAndPersistence: "Attendance and sustained performance" };

export default function App() {
  const [step, setStep] = useState(0);
  const [workspaceMode, setWorkspaceMode] = useState<"screening"|"documents"|"applications">("applications");
  const [caseReference,setCaseReference]=useState("SYN-APPLICATION-001");
  const [prefill,setPrefill]=useState<{caseReference:string;items:PrefillSuggestion[]}|null>(null);
  const [answers, setAnswers] = useState(initialAnswers);
  const [sources, setSources] = useState<EvidenceSource[]>([syntheticSource]);
  const [functional, setFunctional] = useState<Partial<Record<Domain, Finding>>>({});
  const [result, setResult] = useState<ScreeningRecommendation | null>(null);
  const [error, setError] = useState("");
  const [reviewer, setReviewer] = useState("");
  const [decision, setDecision] = useState<Decision>("RequestMoreEvidence");
  const [reviewRationale, setReviewRationale] = useState("");
  const [reviewComplete, setReviewComplete] = useState(false);
  const update = (key: QuestionKey, patch: Partial<Finding>) => { setAnswers(a => ({ ...a, [key]: { ...a[key], ...patch } })); setResult(null); setReviewComplete(false); };
  const updateDomain = (key: Domain, patch: Partial<Finding>) => { setFunctional(a => ({ ...a, [key]: { ...(a[key] || initialFinding()), ...patch } })); setResult(null); setReviewComplete(false); };
  const steps = ["Welcome", "Evidence sources", "Core screening", "Functional findings", "Recommendation & review"];
  async function requestRecommendation() {
    setError(""); setResult(null); setReviewComplete(false);
    try {
      const recommendation = await invoke<ScreeningRecommendation>("evaluate_screen", {
        screen: { ...answers, functional_findings: domains.filter(domain => functional[domain]).map(domain => ({ domain, finding: functional[domain] })), sources }
      });
      setResult(recommendation);
    } catch (e) { setError(String(e)); }
  }
  async function recordReview() {
    setError("");
    try {
      await invoke("validate_human_review", { review: { reviewer_id: reviewer, decision, rationale: reviewRationale } });
      setReviewComplete(true);
    } catch (e) { setReviewComplete(false); setError(String(e)); }
  }
  function reset() {
    setStep(0); setAnswers(initialAnswers()); setSources([syntheticSource]); setFunctional({}); setResult(null); setError(""); setReviewer(""); setReviewRationale(""); setDecision("RequestMoreEvidence"); setReviewComplete(false);
  }
  return <div className="shell">
    <a href="#main" className="skip">Skip to main content</a>
    <aside className="sidebar" aria-label="Screening navigation">
      <div className="brand"><span aria-hidden="true" className="brandmark">✳</span><span>SOAR <strong>Desk</strong><small>Community edition</small></span></div>
      <div className="sidebar-header">REFERRAL WORKSPACE</div>
      <div className="workspace-nav" role="group" aria-label="Workspace">
      <button type="button" className={workspaceMode==="applications"?"selected":""} onClick={()=>setWorkspaceMode("applications")}>Application preparation</button>
      <button type="button" className={workspaceMode==="documents"?"selected":""} onClick={()=>setWorkspaceMode("documents")}>Document evidence</button>
      <button type="button" className={workspaceMode==="screening"?"selected":""} onClick={()=>setWorkspaceMode("screening")}>Screening (optional)</button>
      </div>
      {workspaceMode==="screening"&&<ol className="steps">{steps.map((label,index) => <li key={label}><button className={index === step ? "active" : ""} aria-current={step === index ? "step" : undefined} onClick={() => {setStep(index);setError("");}}><span className="stepnumber">{index + 1}</span>{label}</button></li>)}</ol>}
      <div className="side-note"><strong>Development preview</strong><p>Synthetic data only. Encrypted case saving is available after opening a fictional vault. No production identity, access controls, or PHI storage.</p></div>
    </aside>
    <main id="main" className="main" tabIndex={-1}>
      <header className="topbar"><span>Adult SSI/SSDI · {workspaceMode==="applications"?"Application preparation":workspaceMode==="documents"?"Evidence review":"Referral screening"}</span><span className="demo">SYNTHETIC DATA ONLY</span></header>
      <div className="content" hidden={workspaceMode!=="applications"}><ApplicationWorkspace
        onCaseChange={setCaseReference}
        prefill={prefill?.caseReference===caseReference?prefill.items:[]}
        onPrefillApplied={()=>setPrefill(null)}
      /></div>
      <div className="content" hidden={workspaceMode!=="documents"}><Documents caseReference={caseReference} onPrefill={(items,forCase)=>{
        setPrefill({caseReference:forCase,items});setWorkspaceMode("applications");
      }}/></div>
      {workspaceMode==="screening" ? <div className="content"><div className="eyebrow">STEP {step + 1} OF {steps.length}</div><h1>{steps[step]}</h1>
      <p className="intro">This tool organizes preliminary service triage. It does not determine SSA eligibility or prevent an applicant from applying.</p>
      {step === 0 && <section className="panel"><h2>Start a training referral</h2><p>Use this prototype only with fictional examples. Your entries remain in memory and are discarded when the window closes.</p><div className="example"><strong>Practice file: SYN-DEMO-001</strong><p>Invented referral, not an actual client. Consider both documented limitations and gaps caused by limited access to treatment.</p></div><p>Screening recommendations require evidence references and a separate human review.</p></section>}
      {step === 1 && <section className="panel"><h2>Evidence sources</h2><p className="muted">Sources are fictional, identified by local references. Avoid all real names and clinical information.</p>{sources.map((source,index)=><fieldset key={index} className="source"><legend>Source {index + 1}</legend><div className="fieldgrid"><label>Reference ID<input value={source.reference} onChange={e=>setSources(s=>s.map((v,i)=>i===index?{...v,reference:e.target.value}:v))}/></label><label>Source type<select value={source.kind} onChange={e=>setSources(s=>s.map((v,i)=>i===index?{...v,kind:e.target.value as EvidenceKind}:v))}>{(["ApplicantReport","ClinicianRecord","HospitalRecord","WorkHistory","AdvocateObservation","Other"] as const).map(v=><option key={v} value={v}>{v.replace(/([a-z])([A-Z])/g,"$1 $2")}</option>)}</select></label></div><label>Evidence summary<textarea rows={2} value={source.summary} onChange={e=>setSources(s=>s.map((v,i)=>i===index?{...v,summary:e.target.value}:v))}/></label><button className="linkbutton" type="button" disabled={sources.length===1} onClick={()=>setSources(s=>s.filter((_,i)=>i!==index))}>Remove source</button></fieldset>)}<button type="button" className="secondary" onClick={()=>setSources(s=>[...s,{reference:`SYN-${String(s.length+1).padStart(3,"0")}`,kind:"Other",summary:""}])}>Add evidence source</button></section>}
      {step === 2 && <section className="panel"><h2>Core eligibility indicators</h2><p className="muted">A diagnosis does not by itself prove disability; missing records do not prove work capacity. Record why each conclusion is supported or unknown.</p>{questions.map((q,i)=><fieldset key={q.key} className="question"><legend>{i + 1}. {q.title}</legend><p className="hint">{q.hint}</p><div className="fieldgrid"><label>Evidence assessment<select value={answers[q.key].status} onChange={e=>update(q.key,{status:e.target.value as Status})}>{(Object.keys(labels) as Status[]).map(value=><option key={value} value={value}>{labels[value]}</option>)}</select></label><label>Supporting source<select value={answers[q.key].source_references[0] || ""} onChange={e=>update(q.key,{source_references:e.target.value?[e.target.value]:[]})}><option value="">No linked source yet</option>{sources.filter(s=>s.reference).map(s=><option key={s.reference} value={s.reference}>{s.reference}</option>)}</select></label></div><label>Rationale (required)<textarea rows={3} value={answers[q.key].rationale} onChange={e=>update(q.key,{rationale:e.target.value})} placeholder="Describe what is known, what is missing, and the impact on functioning."/></label></fieldset>)}</section>}
      {step === 3 && <section className="panel"><h2>Functional impact</h2><p className="muted">Select relevant domains to document specific limitations and preserved abilities. Omitted domains remain outside the prototype's review; do not interpret that as no impairment.</p>{domains.map(domain=><fieldset key={domain} className="question"><legend>{friendlyDomain[domain]}</legend><label className="checkline"><input type="checkbox" checked={!!functional[domain]} onChange={e=>setFunctional(f=>{const copy={...f};if(e.target.checked)copy[domain]=initialFinding();else delete copy[domain];setResult(null);return copy;})}/>Include this domain</label>{functional[domain] && <><div className="fieldgrid"><label>Evidence status<select value={functional[domain]!.status} onChange={e=>updateDomain(domain,{status:e.target.value as Status})}>{(Object.keys(labels) as Status[]).map(s=><option key={s} value={s}>{labels[s]}</option>)}</select></label><label>Supporting source<select value={functional[domain]!.source_references[0] || ""} onChange={e=>updateDomain(domain,{source_references:e.target.value?[e.target.value]:[]})}><option value="">Not yet linked</option>{sources.filter(s=>s.reference).map(s=><option key={s.reference} value={s.reference}>{s.reference}</option>)}</select></label></div><label>Functional observations<textarea rows={3} value={functional[domain]!.rationale} onChange={e=>updateDomain(domain,{rationale:e.target.value})}/></label></>}</fieldset>)}</section>}
      {step === 4 && <section className="panel"><h2>Recommendation and human review</h2><p>Rust evaluates the evidence statuses and validates source references. This is a program-service recommendation, not a federal benefits determination.</p><button className="primary" type="button" onClick={requestRecommendation}>Run Rust screening review</button>{result && <div className="result" role="status" aria-live="polite"><strong>{({AdvanceForReview:"Advance for review",FurtherAssessment:"Further assessment needed",ReviewServiceFit:"Review service fit"})[result.status]}</strong>{result.reasons.map(reason=><p key={reason}>{reason}</p>)}</div>}{result && <div className="review"><h3>Human service review</h3><p className="muted">Reviewer information is validated but not saved. Enter a fictional reviewer code.</p><label>Reviewer code<input value={reviewer} onChange={e=>{setReviewer(e.target.value);setReviewComplete(false);}} placeholder="SYN-REVIEWER"/></label><label>Service decision<select value={decision} onChange={e=>{setDecision(e.target.value as Decision);setReviewComplete(false);}}><option value="AcceptForIntake">Accept for comprehensive intake</option><option value="RequestMoreEvidence">Request more evidence</option><option value="ReferElsewhere">Refer to alternative services</option></select></label><label>Decision rationale<textarea rows={3} value={reviewRationale} onChange={e=>{setReviewRationale(e.target.value);setReviewComplete(false);}} placeholder="Document service rationale without making an SSA disability determination."/></label><button className="secondary" type="button" onClick={recordReview}>Validate review (not saved)</button>{reviewComplete && <p className="success" role="status">Review validated in memory. Nothing was saved.</p>}</div>}</section>}
      {error && <div className="error" role="alert"><strong>Unable to complete request.</strong><p>{error}</p></div>}
      <div className="actions"><button type="button" className="secondary" onClick={reset}>Start over</button><div className="spacer"/><button type="button" className="secondary" disabled={step===0} onClick={()=>{setStep(s=>s-1);setError("");}}>Back</button><button type="button" className="primary" disabled={step===steps.length-1} onClick={()=>{setStep(s=>s+1);setError("");}}>Continue <span aria-hidden="true">→</span></button></div>
      </div> : null}
    </main>
  </div>;
}
