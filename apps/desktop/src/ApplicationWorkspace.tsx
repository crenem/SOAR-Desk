import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {getCurrentWindow} from "@tauri-apps/api/window";
import { FORMS, FORM_BY_ID, applicable, progress, type AnswerStatus, type Answers, type Column, type FormId, type Program, type Response, type Rows, type Section } from "./forms";
import SubmissionTracker from "./SubmissionTracker";
import type { SubmissionLog } from "./ssa-submissions";
import EvidenceRegister from "./EvidenceRegister";
import PackageExport from "./PackageExport";
import VaultLab from "./VaultLab";
import SignatureWorkbench from "./SignatureWorkbench";
import type {SignatureReceipt} from "./signature-policy";
import type {PrefillSuggestion} from "./document-prefill";
import type {AttachedSource} from "./evidence-attachment";
import {kindFor,inputMask,normalizeOnBlur,validateDisplay} from "./field-format";
import {formCoverage,type FormCoverage,type MissingTarget} from "./form-navigation";
import {buildUnifiedInterview,unifiedProgress} from "./unified-interview";
import type {EvidenceReference,PackageInput,SyntheticRecoveryEvent,DocumentReviewRecord} from "./application-package";

const emptyAnswer=():Response=>({value:"",status:"reported",source:""});
const statuses:{value:AnswerStatus;label:string}[]=[
 {value:"reported",label:"Applicant reported"},
 {value:"verified",label:"Human verified"},
 {value:"unknown",label:"Applicant does not know"},
 {value:"clarify",label:"Needs clarification"}
];
const display=(s:Response|undefined)=>s?.status==="unknown"?"Unknown":s?.value || "Not collected";
const fieldsOf=(rows:Rows,key:string)=>rows[key]??[];
type View="unified"|"overview"|"interview"|"review"|"evidence"|"package"|"submissions"|"casefiles"|"signatures";
type Props={onCaseChange?:(ref:string)=>void;onCaseModeChange?:(syntheticOnly:boolean)=>void;prefill?:PrefillSuggestion[];onPrefillApplied?:()=>void;onProgress?:(items:FormCoverage[])=>void;navigate?:{target:MissingTarget;token:number}|null;stageJump?:{view:"unified"|"package";token:number}|null;inboundEvidence?:{source:AttachedSource;caseReference:string;sequence:number;documentReview?:DocumentReviewRecord}|null;onEvidenceReceived?:()=>void};


export default function ApplicationWorkspace({onCaseChange,onCaseModeChange,prefill=[],onPrefillApplied,onProgress,navigate,stageJump,inboundEvidence,onEvidenceReceived}:Props){
 const [programs,setPrograms]=useState<Program[]>(["ssi","ssdi"]);
 // Sidebar stage switch stays independent of per-form missing-field navigation.
 useEffect(()=>{if(stageJump?.token)setView(stageJump.view);},[stageJump?.token]);
 const [formId,setFormId]=useState<FormId>("SSA-3368-BK");
 const [section,setSection]=useState("identity");
 const [view,setView]=useState<View>("unified");
 const [domainId,setDomainId]=useState("person");
 const [answers,setAnswers]=useState<Answers>({});
 const [rows,setRows]=useState<Rows>({});
 const [includeDeferred,setIncludeDeferred]=useState(false);
 const [caseLabel,setCaseLabel]=useState("SYN-APPLICATION-001");
 const [syntheticOnly,setSyntheticOnly]=useState(true);
 const [submissionLog,setSubmissionLog]=useState<SubmissionLog>({records:[],events:[]});
 const [evidence,setEvidence]=useState<EvidenceReference[]>([]);
 const [recoveryEvents,setRecoveryEvents]=useState<SyntheticRecoveryEvent[]>([]);
 const [signatures,setSignatures]=useState<SignatureReceipt[]>([]);
 useEffect(()=>{
   if(!inboundEvidence)return;
   if(inboundEvidence.caseReference!==caseLabel)return;
   const attached=inboundEvidence.source;
   setEvidence(items=>{
     if(items.some(item=>item.blobId===attached.blob_id))return items;
     const prefix=syntheticOnly?"SYN-EV-":"EV-";
     const next=Math.max(0,...items.map(e=>Number(e.id.match(new RegExp("^"+prefix+"(\\d+)$"))?.[1]||0)))+1;
     return [...items,{
       id:prefix+String(next).padStart(4,"0"),title:attached.original_name,
       kind:"other",location:"",note:"Original source imported from Document evidence; classify and verify against the original.",
       status:"pending",reviewer:"",blobId:attached.blob_id,
       originalFilename:attached.original_name,sha256:attached.sha256,bytes:attached.bytes,documentReview:inboundEvidence.documentReview
     }];
   });
   setView("evidence");
   onEvidenceReceived?.();
 // Applied exactly once per incoming source identifier.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[inboundEvidence?.sequence]);
 const [activeVault,setActiveVault]=useState<string|null>(null);
 const [autosaveState,setAutosaveState]=useState("Create or unlock an encrypted vault to enable autosave.");
 const [vaultMode,setVaultMode]=useState<"create"|"open">("open");
 const [prefillSelected,setPrefillSelected]=useState<Record<string,boolean>>({});
 const autosavePending=useRef(false);
 const lastSaved=useRef("");
 const snapshotRef=useRef<PackageInput>({
   caseReference:caseLabel,syntheticOnly,programs,includeDeferred,answers,rows,evidence,submissions:submissionLog,recoveryEvents,signatures
 });
 const mappedCoverage=useMemo(()=>formCoverage(programs,includeDeferred,answers,rows),
   [programs,includeDeferred,answers,rows]);
 useEffect(()=>{onProgress?.(mappedCoverage)},[mappedCoverage,onProgress]);
 useEffect(()=>{
   if(!navigate)return;
   const {target}=navigate;
   setFormId(target.formId);
   setSection(target.sectionId);
   setView("interview");
 },[navigate?.token]);
 useEffect(()=>{
   if(!navigate||view!=="interview"||formId!==navigate.target.formId||section!==navigate.target.sectionId)return;
   const id=navigate.target.kind==="question"?"q-"+navigate.target.fieldId:"group-"+navigate.target.fieldId;
   const handle=window.requestAnimationFrame(()=>{
     const element=document.getElementById(id);
     element?.scrollIntoView({block:"center",behavior:"smooth"});
     if(element instanceof HTMLElement)element.focus({preventScroll:true});
   });
   return ()=>window.cancelAnimationFrame(handle);
 },[navigate?.token,view,formId,section]);
 const currentSnapshot=useMemo<PackageInput>(()=>({
   caseReference:caseLabel,syntheticOnly,programs,includeDeferred,answers,rows,evidence,
   submissions:submissionLog,recoveryEvents,signatures
 }),[caseLabel,syntheticOnly,programs,includeDeferred,answers,rows,evidence,submissionLog,recoveryEvents,signatures]);
 snapshotRef.current=currentSnapshot;
 useEffect(()=>{onCaseChange?.(caseLabel);},[caseLabel,onCaseChange]);
 useEffect(()=>{onCaseModeChange?.(syntheticOnly);},[syntheticOnly,onCaseModeChange]);
 useEffect(()=>{setPrefillSelected(Object.fromEntries(prefill.map(p=>[p.key,!answers[p.key]?.value])));},
   [prefill]); // Incoming review batch, never silent field replacement.
 useEffect(()=>{
   if(activeVault&&JSON.stringify(snapshotRef.current)!==lastSaved.current)
     setAutosaveState("Unsaved changes · encrypted autosave due within 10 seconds");
 },[activeVault,currentSnapshot]);
 async function saveEncryptedNow(){
   if(!activeVault||autosavePending.current)return false;
   const snapshot=snapshotRef.current;
   const signature=JSON.stringify(snapshot);
   if(signature===lastSaved.current)return true;
   autosavePending.current=true;
   setAutosaveState("Encrypting and saving…");
   try{
     await invoke("autosave_synthetic_case",{request:{
       snapshot:{
         file_kind:syntheticOnly?"soar-desk-synthetic-case-snapshot":"soar-desk-local-case-snapshot",
         schema_version:syntheticOnly?1:2,synthetic_only:syntheticOnly,case_reference:snapshot.caseReference,
         programs:snapshot.programs,include_deferred:snapshot.includeDeferred,
         answers:snapshot.answers,rows:snapshot.rows,evidence:snapshot.evidence,
         submissions:snapshot.submissions,recovery_events:snapshot.recoveryEvents??[],
         signatures:snapshot.signatures??[]
       },synthetic_confirmed:syntheticOnly,local_risk_acknowledged:!syntheticOnly
     }});
     lastSaved.current=signature;
     setAutosaveState(signature===JSON.stringify(snapshotRef.current)
       ?"Encrypted · saved "+new Date().toLocaleTimeString()
       :"Encrypted · newer changes waiting for next save");
     return signature===JSON.stringify(snapshotRef.current);
   }catch(error){
     setAutosaveState("Autosave FAILED — "+String(error));
     return false;
   }finally{autosavePending.current=false;}
 }
 // Closing the window must not silently abandon edits in the 10-second gap.
 // Tauri close callbacks are synchronous for preventDefault; flush thereafter.
 useEffect(()=>{
   const win=getCurrentWindow();
   let alive=true;
   let closing=false;
   const unlisten=win.onCloseRequested(async event=>{
     if(closing)return;
     const snapshot=JSON.stringify(snapshotRef.current);
     const hasData=Object.keys(snapshotRef.current.answers).length>0
       ||Object.values(snapshotRef.current.rows).some(v=>v.length>0)
       ||snapshotRef.current.evidence.length>0;
     const dirty=activeVault ? snapshot!==lastSaved.current : hasData;
     if(!dirty)return;
     event.preventDefault();
     if(activeVault){
       if(autosavePending.current){
         setAutosaveState("Save in progress — wait for completion, then close.");
         return;
       }
       await saveEncryptedNow();
       if(!alive)return;
       if(lastSaved.current!==JSON.stringify(snapshotRef.current)){
         window.alert("Encrypted save did not complete. The case remains open; check autosave status.");
         return;
       }
     }else if(!window.confirm("This case has UNSAVED interview information. Close and discard the unsaved information?")){
       return;
     }
     closing=true;
     try{await win.close();}catch(error){closing=false;setAutosaveState("Close failed: "+String(error));}
   }).catch(error=>{setAutosaveState("Could not register close protection: "+String(error));return undefined;});
   return ()=>{alive=false;void unlisten.then(fn=>fn?.());};
 // Reattach if active-vault identity changes. Case data are read from refs.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[activeVault]);
 useEffect(()=>{
   if(!activeVault)return;
   const interval=window.setInterval(()=>{void saveEncryptedNow();},10_000);
   return ()=>window.clearInterval(interval);
 // Restart interval only when the selected vault changes.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[activeVault]);
 function vaultReady(path:string|null,restored?:PackageInput){
   setActiveVault(path);
   lastSaved.current=path?JSON.stringify(restored??snapshotRef.current):"";
   setAutosaveState(path?"Encrypted case open · autosave every 10 seconds":
      "No writable case vault open. Create or unlock a .soarvault.");
 }
 function applyPrefill(){
   setAnswers(old=>{
     const next={...old};
     for(const item of prefill){
       if(prefillSelected[item.key]&&!old[item.key]?.value){
         next[item.key]={value:item.value,status:"clarify",source:item.source};
       }
     }
     return next;
   });
   onPrefillApplied?.();
   setView("unified");
   setDomainId("person");
 }
 function openCaseFiles(mode:"create"|"open"){
   setVaultMode(mode);
   setView("casefiles");
 }

 const activeForms=useMemo(()=>FORMS.filter(f=>f.programs.some(p=>programs.includes(p))&&(f.id!=="SSA-8001-BK"||includeDeferred)),[programs,includeDeferred]);
 const unifiedIndex=useMemo(()=>buildUnifiedInterview(activeForms),[activeForms]);
 const unifiedStats=useMemo(()=>unifiedProgress(unifiedIndex,answers,rows),[unifiedIndex,answers,rows]);
 const activeDomain=unifiedIndex.domains.find(d=>d.id===domainId)??unifiedIndex.domains[0];
 const current=FORM_BY_ID[formId];
 const validCurrent=activeForms.some(f=>f.id===formId)?current:activeForms[0];
 const activeSection=validCurrent?.sections.find(s=>s.id===section)??validCurrent?.sections[0];
 const total=activeForms.filter(f=>!f.referenceOnly).map(f=>({f,p:progress(f,answers,rows)}));
 const captured=total.reduce((n,x)=>n+x.p.captured,0);
 const possible=total.reduce((n,x)=>n+x.p.total,0);
 const sections=validCurrent?.sections??[];
 function hasCaseContent(){
  const state=snapshotRef.current;
  return Object.keys(state.answers).length>0 ||
    Object.values(state.rows).some(group=>group.length>0) ||
    state.evidence.length>0||state.submissions.records.length>0||
    state.submissions.events.length>0||(state.signatures?.length??0)>0;
 }
 function canReplaceCase(){
  if(activeVault && JSON.stringify(snapshotRef.current)!==lastSaved.current){
    window.alert("The current encrypted case has unsaved changes. Click Save now and retry; the active vault was not changed.");
    return false;
  }
  return true;
 }
 async function beforeCaseBackup(path:string){
  if(activeVault===path){
    const saved=await saveEncryptedNow();
    if(!saved)window.alert("The current case could not be saved. Backup stopped to avoid an outdated snapshot.");
    return saved;
  }
  if(!canReplaceCase())return false;
  return true;
 }
 function newLocalCase(){
  if(!canReplaceCase())return;
  if(hasCaseContent()&&!window.confirm("Discard the current in-memory case and start a new one? Save its encrypted vault before proceeding."))return;
  if(!window.confirm("Start a NEW restricted local encrypted case? This development build has NOT passed HIPAA/security deployment review. Do not proceed unless your nonprofit has authorized this installation and accepts responsibility for local protection, backups, incident handling, and SSA form submission."))return;
  setCaseLabel("CASE-"+crypto.randomUUID());
  setSyntheticOnly(false);
  setPrograms(["ssi","ssdi"]);
  setAnswers({});setRows({});setEvidence([]);setRecoveryEvents([]);setSignatures([]);
  setSubmissionLog({records:[],events:[]});
  setActiveVault(null);lastSaved.current="";
  void invoke("lock_synthetic_autosave").catch(()=>{});
  setAutosaveState("Restricted local case created in memory. Create an encrypted vault BEFORE entering records.");
  setFormId("SSA-3368-BK");setSection("identity");setDomainId("person");setVaultMode("create");setView("casefiles");
 }
 function loadSyntheticExample(){
  if(!canReplaceCase())return;
  if(hasCaseContent()&&!window.confirm("Replace the current case with a fictional demonstration? In-memory answers, sources and submission records will be cleared."))return;
  setEvidence([]);
  setRecoveryEvents([]);
  setSignatures([]);
  setActiveVault(null);
  lastSaved.current="";
  setAutosaveState("Synthetic demonstration loaded · create an encrypted vault to autosave.");
  void invoke("lock_synthetic_autosave").catch(()=>{});
  setSubmissionLog({records:[],events:[]});
  const facts:Record<string,string>={
    "person.name":"Jane Doe", "person.phone":"No reliable telephone; use alternate contact with permission",
    "person.language":"English","work.current":"stopped","work.onset":"03/12/2024",
    "work.stop":"03/12/2024","work.any":"yes","work.changed":"yes",
    "medical.treated":"yes","medical.medicines":"yes",
    "contacts.available":"no","function.where":"shelter",
    "function.work":"Applicant reports back pain limiting prolonged standing; verify against the source record.",
    "function.day":"Applicant reports needing breaks throughout the day; interview for specific daily activities.",
    "ssi.month":"10/2026","living.type":"transient or homeless",
    "living.homeless":"Fictional scenario: shelter stays and occasional nights without shelter; mailing arrangements need confirmation.",
    "resources.date":"10/01/2026"
  };
  const next:Answers={};
  for(const [key,value] of Object.entries(facts)){next[key]={value,status:"reported",source:"SYN-DEMO / fictitious applicant statement"};}
  setAnswers(next);
  setRows({
    conditions:[{condition:"Lumbar radiculopathy (fictional clinical scenario)",details:"Unverified; do not infer disability.",_status:"reported"}],
    providers:[{facility:"Example Community Clinic (fictional)",provider:"Not yet identified",conditions:"Back pain",_status:"reported"}],
    jobs:[{title:"Stock clerk",business:"Retail",from:"04/2019",to:"03/2024",hours:"8",days:"5",tasks:"Stocked shelves and moved merchandise",impact:"Reports that standing and lifting became difficult",_status:"reported"}],
    medicines:[{medicine:"Fictional medication — confirm with record",reason:"Pain management",_status:"reported"}]
  });
  setSyntheticOnly(true);
  setFormId("SSA-3368-BK");setSection("identity");setDomainId("person");setView("unified");setCaseLabel("SYN-JANE-DOE-001");
 }
 function restoreSyntheticCase(saved:PackageInput){
  // The vault import interface explicitly asks for confirmation before calling.
  setCaseLabel(saved.caseReference);
  setSyntheticOnly(saved.syntheticOnly!==false);
  setPrograms([...saved.programs]);
  setIncludeDeferred(saved.includeDeferred);
  setAnswers({...saved.answers});
  setRows({...saved.rows});
  setEvidence([...saved.evidence]);
  setRecoveryEvents([...(saved.recoveryEvents??[])]);
  setSignatures([...(saved.signatures??[])]);
  setSubmissionLog({records:[...saved.submissions.records],events:[...saved.submissions.events]});
  setFormId("SSA-3368-BK");
  setSection("identity");
  setDomainId("person");setView("unified");
 }
 function chooseProgram(p:Program){
   const next=programs.includes(p)?programs.filter(x=>x!==p):[...programs,p];
   if(!next.length)return;
   setPrograms(next);
   const available=FORMS.filter(f=>f.programs.some(x=>next.includes(x))&&(f.id!=="SSA-8001-BK"||includeDeferred));
   if(!available.some(f=>f.id===formId)){setFormId(available[0].id);setSection(available[0].sections[0]?.id||"");}
 }
 function chooseForm(id:FormId){setFormId(id);setSection(FORM_BY_ID[id].sections[0]?.id||"");setView(FORM_BY_ID[id].referenceOnly?"overview":"interview");}
 function change(key:string,patch:Partial<Response>){
  setAnswers(a=>({...a,[key]:{...(a[key]??emptyAnswer()),...patch}}));
 }
 function setRow(group:string,index:number,key:string,value:string){
  setRows(old=>({...old,[group]:(old[group]??[]).map((v,i)=>i===index?{...v,[key]:value,...(key==="_status"?{}:{_status:"reported"})}:v)}));
 }
 function addRow(group:string){setRows(old=>({...old,[group]:[...(old[group]??[]),{_status:"reported"}]}));}
 function removeRow(group:string,index:number){setRows(old=>({...old,[group]:(old[group]??[]).filter((_,i)=>i!==index)}));}
 function editor(key:string,value:string,kind:string,update:(v:string)=>void,options?:string[],fieldKey=key){
  if(kind==="yesno"||kind==="choice")return <select id={key} value={value} onChange={e=>update(e.target.value)}>
    <option value="">Not yet answered</option>
    {(kind==="yesno"?["yes","no"]:options??[]).map(o=><option value={o} key={o}>{o==="yes"?"Yes":o==="no"?"No":o}</option>)}
   </select>;
  if(kind==="long")return <textarea id={key} rows={3} value={value} onChange={e=>update(e.target.value)} placeholder="Record the person's actual answer"/>;
  const format=kindFor(fieldKey,kind);
  const issue=validateDisplay(format,value);
  return <div className="formatted-field">
    <input id={key} type="text" inputMode={["ssn","phone","weight","date","month"].includes(format)?"numeric":"text"}
      value={value}
      onChange={e=>update(inputMask(format,e.target.value))}
      onBlur={()=>{const normalized=normalizeOnBlur(format,value);if(normalized!==value)update(normalized);}}
      aria-invalid={!!issue}
      placeholder={format==="ssn"?"000-00-0000":format==="phone"?"(318) 555-0100":
        format==="height"?"5 ft 11 in":format==="weight"?"180 lb":
        kind==="date"?"MM/DD/YYYY":kind==="month"?"MM/YYYY":"Enter answer"}/>
    {issue&&<small className="field-warning" role="status">{issue}</small>}
   </div>;
 }
 function evidencePicker(value:string,onPick:(reference:string)=>void){
  const chosen=evidence.some(item=>item.id===value)?value:"";
  return <label>Link a registered source
    <select value={chosen} onChange={event=>{if(event.target.value)onPick(event.target.value)}}>
      <option value="">Choose an evidence reference…</option>
      {evidence.filter(item=>item.status!=="rejected").map(item=>
        <option key={item.id} value={item.id}>{item.id} — {item.title||"Untitled"} ({item.status.replace("_"," ")})</option>
      )}
    </select>
  </label>;
 }
 function renderQuestion(question:Section["questions"][number]){
  if(!applicable(question,answers))return null;
  const r=answers[question.key]??emptyAnswer();
  return <div className="intake-question" key={question.key} data-field-anchor={question.key}>
   <div className="intake-label"><strong>{question.label}</strong><span>{question.ref}</span></div>
   <label className="intake-control" htmlFor={"q-"+question.key}>
    <span className="sr-only">{question.label}</span>
    {editor("q-"+question.key,r.value,question.kind,v=>change(question.key,{value:v,status:"reported"}),question.options,question.key)}
   </label>
   {question.hint&&<p className="hint">{question.hint}</p>}
   <details className="intake-provenance"><summary>Answer source and review</summary>
    <div className="fieldgrid">
     <label>Review status<select value={r.status} onChange={e=>change(question.key,{status:e.target.value as AnswerStatus})}>
      {statuses.map(s=><option value={s.value} key={s.value}>{s.label}</option>)}
     </select></label>
     <label>Source reference (if available)<input value={r.source} onChange={e=>change(question.key,{source:e.target.value})} placeholder="Interview, document or evidence reference"/></label>
     {evidencePicker(r.source,value=>change(question.key,{source:value}))}
    </div>
    <p className="hint">Verification is a human assertion, not an automated model judgment. Select a case evidence reference above or enter descriptive provenance manually. Pending or rejected evidence is not human-verified proof.</p>
   </details>
  </div>;
 }
 function rowEditor(col:Column,value:string,changeValue:(v:string)=>void,group:string,index:number){
  return <label key={col.key}>{col.label}
    {editor(`${group}-${index}-${col.key}`,value,col.kind??"text",changeValue,col.options,col.key)}
   </label>;
 }
 function renderCollection(group:NonNullable<Section["collections"]>[number]){
  if(!applicable(group,answers))return null;
  const items=fieldsOf(rows,group.key);
  return <fieldset key={group.key} id={"group-"+group.key} tabIndex={-1} className="intake-repeat">
   <legend>{group.title} <small>{group.ref}</small></legend>
   {group.hint&&<p className="hint">{group.hint}</p>}
   {items.length===0&&<p className="muted">No entries yet. Leaving this blank does not mean none.</p>}
   {items.map((item,i)=><div className="intake-row" key={i}>
    <div className="rowheader"><strong>Entry {i+1}</strong><button type="button" className="linkbutton" onClick={()=>removeRow(group.key,i)}>Remove</button></div>
    <div className="fieldgrid">{group.columns.map(col=>rowEditor(col,item[col.key]??"",v=>setRow(group.key,i,col.key,v),group.key,i))}</div>
    <div className="fieldgrid">
     <label>Human review<select value={item._status??"reported"} onChange={e=>setRow(group.key,i,"_status",e.target.value)}>
      {statuses.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
     </select></label>
     <label>Source reference<input value={item._source??""} onChange={e=>setRow(group.key,i,"_source",e.target.value)}/></label>
     {evidencePicker(item._source??"",value=>setRow(group.key,i,"_source",value))}
    </div>
   </div>)}
   <button type="button" className="secondary" onClick={()=>addRow(group.key)}>Add entry</button>
  </fieldset>;
 }
 return <div className="application-workspace">
   <div className="eyebrow">POST-SCREENING · ADULT SSI / SSDI</div>
   <div className="case-file-toolbar">
      <div className="case-file-actions">
        <button type="button" className="primary" onClick={()=>openCaseFiles("open")}>Open / import case…</button>
        <button type="button" className="secondary" onClick={()=>openCaseFiles("create")}>Save / export encrypted case…</button>
        <button type="button" className="secondary" onClick={()=>setView("package")}>SSA document exports</button>
      </div>
      <div className="autosave-indicator" aria-live="polite"><strong>{activeVault?"Encrypted autosave · 10s":"Autosave needs vault setup"}</strong>
        <span>{autosaveState}</span>
        {activeVault&&<button type="button" className="linkbutton" onClick={()=>void saveEncryptedNow()}>Save now</button>}
      </div>
   </div>
   {prefill.length>0&&<section className="panel prefill-review">
     <h2>Review document prefill suggestions ({prefill.length})</h2>
     <p className="muted">These values were explicitly labeled in an ingested document and marked human-verified. Select which blank case fields to prefill. Existing answers are never overwritten; accepted entries remain applicant-reported until independently confirmed.</p>
     {prefill.map(item=><label className="checkline" key={item.key}>
       <input type="checkbox" checked={!!prefillSelected[item.key]&&!answers[item.key]?.value} disabled={!!answers[item.key]?.value}
         onChange={e=>setPrefillSelected(o=>({...o,[item.key]:e.target.checked}))}/>
       <span><strong>{item.label}:</strong> {item.key==="person.ssn"?"[SSN from verified source]":item.value}
       <small>Page {item.page} · {answers[item.key]?.value?"Existing case value preserved":"Verified source proposal"}</small></span>
     </label>)}
     <button type="button" className="primary" onClick={applyPrefill}>Apply selected blank-field suggestions</button>
     <button type="button" className="secondary" onClick={()=>onPrefillApplied?.()}>Dismiss suggestions</button>
   </section>}

   <h1>Application workspace</h1>
   <p className="intro">One applicant interview, reusable facts and separate SSA form sections. {syntheticOnly?"Training mode is fictional-only.":"Restricted local-case mode uses encrypted snapshots but has not passed a deployment security review."} Autosave starts only after creating or unlocking a vault. Official form mappings and submission pathways remain incomplete.</p>
   <div className="panel intake-setup">
     <div className="fieldgrid">
      <label>{syntheticOnly?"Fictional case reference":"Opaque local case reference"}<input value={caseLabel} onChange={e=>setCaseLabel(e.target.value)} disabled={submissionLog.records.length>0||!!activeVault} maxLength={80}/></label>
      <div><strong>Applications being prepared</strong>
       <div className="intake-choices"><label className="checkline"><input type="checkbox" checked={programs.includes("ssi")} onChange={()=>chooseProgram("ssi")}/> SSI</label>
       <label className="checkline"><input type="checkbox" checked={programs.includes("ssdi")} onChange={()=>chooseProgram("ssdi")}/> SSDI</label></div>
      </div>
     </div>
     <label className="checkline"><input type="checkbox" checked={includeDeferred} onChange={e=>setIncludeDeferred(e.target.checked)}/> Show SSA-8001 deferred/abbreviated SSI as a reference (not the default)</label>
     <p className="hint">Application pathways reflect your manual case planning, not an automated determination of eligibility or whether each form is required.</p>
     {submissionLog.records.length>0&&<p className="hint">Case reference is locked while this in-memory session contains submission records. Loading the demo anew clears these records after confirmation.</p>}
     <div className="case-mode-buttons"><button type="button" className="secondary" onClick={loadSyntheticExample}>Load fictional training example</button>
     <button type="button" className="secondary" disabled={!syntheticOnly||!!activeVault} onClick={newLocalCase}>New restricted local case…</button></div>
     {!syntheticOnly&&<p className="field-warning">Local case beta: store only in an encrypted vault. This build has no SQLCipher, authenticated staff roles, independently anchored audit, or encrypted source-document storage. Do not treat this as an SSA filing system or a certified medical-record system.</p>}
   </div>
   <div className="intake-tabs" role="group" aria-label="Application views">
    {(["unified","review","evidence","package","overview","interview","signatures","submissions","casefiles"] as View[]).map(v=><button type="button" key={v} className={view===v?"active":""} onClick={()=>setView(v)}>{v==="unified"?"1 · Unified interview":v==="overview"?"Form inventory":v==="interview"?"Form-specific crosswalk":v==="review"?"Review gaps":v==="evidence"?"Evidence register":v==="signatures"?"Acknowledgments":v==="package"?"3 · Package":v==="casefiles"?"Case files":"Submissions & receipts"}</button>)}
   </div>
   {view==="unified"&&<section className="panel">
    <div className="eyebrow">STEP 1 · ENTER ONCE, REUSE ACROSS SSA FORMS</div>
    <h2>Unified applicant interview</h2>
    <p className="intro">These interview questions are generated from the <strong>currently mapped</strong> SSA forms. Each canonical answer is asked once even when multiple forms use it. Form references remain visible. This is not yet a complete audit of every question in every official SSA edition.</p>
    <div className="submit-summary">
     <div><strong>{unifiedStats.answered} / {unifiedStats.possible}</strong><span>Mapped answer groups captured</span></div>
     <div><strong>{unifiedIndex.repeatedQuestionOccurrences+unifiedIndex.repeatedCollectionOccurrences}</strong><span>Repeated entries avoided</span></div>
     <div><strong>{unifiedStats.remaining}</strong><span>Mapped answer groups remaining</span></div>
    </div>
    {unifiedIndex.mappingConflicts.length>0&&<div className="field-warning" role="alert">
      <strong>Crosswalk conflicts requiring SSA form audit:</strong> {unifiedIndex.mappingConflicts.join(" · ")}
    </div>}
    <div className="intake-sections" role="group" aria-label="Unified interview domains">
      {unifiedIndex.domains.map(d=><button type="button" key={d.id}
       className={d.id===activeDomain?.id?"active":""} onClick={()=>setDomainId(d.id)}>{d.title}</button>)}
    </div>
    {activeDomain&&<>
      <h3>{activeDomain.title}</h3>
      {activeDomain.questions.map(q=>renderQuestion({...q,ref:q.references.join(" · ")}))}
      {activeDomain.collections.map(c=>renderCollection({...c,ref:c.references.join(" · ")}))}
      <div className="actions">
       <button className="secondary" type="button" disabled={unifiedIndex.domains.indexOf(activeDomain)===0}
         onClick={()=>setDomainId(unifiedIndex.domains[unifiedIndex.domains.indexOf(activeDomain)-1].id)}>Previous domain</button>
       <div className="spacer"/>
       <button className="primary" type="button" onClick={()=>{
         const next=unifiedIndex.domains[unifiedIndex.domains.indexOf(activeDomain)+1];
         if(next)setDomainId(next.id);else setView("review");
       }}>{unifiedIndex.domains.indexOf(activeDomain)<unifiedIndex.domains.length-1?"Next domain →":"Review interview gaps →"}</button>
      </div>
    </>}
   </section>}
   {view==="overview"&&<section className="panel">
    <h2>Selected application forms</h2>
    <p className="muted">Only starter-level questions are currently mapped. Progress below is information collected, <strong>not form completeness or submission readiness</strong>.</p>
    <div className="intake-form-list">{activeForms.map(f=>{const p=progress(f,answers,rows);return <div key={f.id} className="intake-form-card">
     <div><strong>{f.id} · {f.title}</strong><p className="hint">{f.note}</p><small>{f.edition} · {f.pages} pages · {f.phase}</small></div>
     <div className="intake-form-actions"><span>{f.referenceOnly?"Reference only":`${p.captured}/${p.total} captured`}</span>
      <button className="secondary" type="button" onClick={()=>chooseForm(f.id)}>{f.referenceOnly?"View status":"Interview"}</button>
      <a href={f.url} target="_blank" rel="noreferrer">Official SSA PDF ↗</a>
     </div>
    </div>})}</div>
   </section>}
   {view==="interview"&&validCurrent&&<section className="panel">
    <div className="intake-formheading"><div><div className="eyebrow">OFFICIAL PDF CROSSWALK · {validCurrent.edition}</div><h2>{validCurrent.id} — {validCurrent.title}</h2><p className="hint">{validCurrent.note}</p></div><a href={validCurrent.url} target="_blank" rel="noreferrer">Open SSA form ↗</a></div>
    <label>Select form<select value={validCurrent.id} onChange={e=>chooseForm(e.target.value as FormId)}>
      {activeForms.map(f=><option value={f.id} key={f.id}>{f.id} — {f.title}{f.referenceOnly?" (reference only)":""}</option>)}
    </select></label>
    {validCurrent.referenceOnly?<div className="example">The source PDF is inventoried, but question-level editing for this form isn't implemented yet. It cannot be marked complete.</div>:<>
      <div className="intake-sections" role="group" aria-label="Form sections">
       {sections.map(s=><button type="button" key={s.id} className={s.id===activeSection?.id?"active":""} onClick={()=>setSection(s.id)}>{s.title}</button>)}
      </div>
      {activeSection&&<div><h3>{activeSection.title} <small>Pages {activeSection.pages}</small></h3>
        {activeSection.questions.map(renderQuestion)}
        {(activeSection.collections??[]).map(renderCollection)}
        <div className="actions">
         <button className="secondary" disabled={sections.indexOf(activeSection)===0} onClick={()=>setSection(sections[sections.indexOf(activeSection)-1].id)}>Previous section</button>
         <div className="spacer"/>
         <button className="primary" onClick={()=>{const next=sections[sections.indexOf(activeSection)+1];if(next)setSection(next.id);else setView("review");}}>
          {sections.indexOf(activeSection)<sections.length-1?"Next section →":"Review gaps →"}</button>
        </div>
       </div>}
     </>}
   </section>}
   {view==="review"&&<section className="panel">
    <h2>Interview coverage and next actions</h2>
    <p className="intro"><strong>{captured} / {possible}</strong> currently applicable mapped question groups captured. This does not measure whether SSA will accept a particular form.</p>
    {total.map(({f,p})=><details key={f.id} className="intake-review" open={p.captured<p.total}>
      <summary><strong>{f.id}</strong> — {p.captured}/{p.total} captured · {p.verified} human-verified</summary>
      <p className="hint">{f.note}</p>
      {f.sections.map(s=>{const pending=s.questions.filter(q=>applicable(q,answers)).filter(q=>{const a=answers[q.key];return !a || (!a.value.trim()&&a.status!=="unknown");});return pending.length?<div key={s.id}><strong>{s.title}</strong><p className="hint">{pending.map(q=>q.ref+": "+q.label).join(" · ")}</p></div>:null;})}
    </details>)}
    <div className="example"><strong>Not ready for an SSA submission</strong><p>Only a limited SSA-16 synthetic PDF preview is implemented. Complete field mapping, other SSA PDF population, applicant review, physical signatures, SSA submission requirements, protected storage and audit trails remain unfinished. No claim has been filed or signed.</p></div>
    <p><strong>Current synthetic case:</strong> {caseLabel}</p>
    <p><strong>Applicant:</strong> {display(answers["person.name"])} · <strong>Onset:</strong> {display(answers["work.onset"])} · <strong>Reported living arrangement:</strong> {display(answers["living.type"])}</p>
   </section>}
   {view==="evidence"&&<EvidenceRegister evidence={evidence} setEvidence={setEvidence} syntheticOnly={syntheticOnly} caseReference={caseLabel}/>}
   {view==="signatures"&&<SignatureWorkbench formId={formId} caseReference={caseLabel} answers={answers} rows={rows} receipts={signatures} onChange={setSignatures}/>}
   {view==="package"&&<PackageExport input={currentSnapshot}/>}\n   {view==="casefiles"&&<VaultLab input={currentSnapshot} onRestore={restoreSyntheticCase} onVaultReady={vaultReady} canReplaceCase={canReplaceCase} beforeBackup={beforeCaseBackup} initialMode={vaultMode}/>}
   <div hidden={view!=="submissions"}><SubmissionTracker log={submissionLog} setLog={setSubmissionLog} caseReference={caseLabel} programs={programs}/></div>
   <p className="hint">Encrypted autosave requires an unlocked writable vault. The application does not file claims or determine eligibility. All signatures here are internal acknowledgments, not SSA-accepted electronic submissions.</p>
  </div>;
}
