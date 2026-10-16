import { useMemo, useState } from "react";
import { FORMS, FORM_BY_ID, applicable, progress, type AnswerStatus, type Answers, type Column, type FormId, type Program, type Response, type Rows, type Section } from "./forms";

const emptyAnswer=():Response=>({value:"",status:"reported",source:""});
const statuses:{value:AnswerStatus;label:string}[]=[
 {value:"reported",label:"Applicant reported"},
 {value:"verified",label:"Human verified"},
 {value:"unknown",label:"Applicant does not know"},
 {value:"clarify",label:"Needs clarification"}
];
const display=(s:Response|undefined)=>s?.status==="unknown"?"Unknown":s?.value || "Not collected";
const fieldsOf=(rows:Rows,key:string)=>rows[key]??[];
type View="overview"|"interview"|"review";

export default function ApplicationWorkspace(){
 const [programs,setPrograms]=useState<Program[]>(["ssi","ssdi"]);
 const [formId,setFormId]=useState<FormId>("SSA-3368-BK");
 const [section,setSection]=useState("identity");
 const [view,setView]=useState<View>("overview");
 const [answers,setAnswers]=useState<Answers>({});
 const [rows,setRows]=useState<Rows>({});
 const [includeDeferred,setIncludeDeferred]=useState(false);
 const [caseLabel,setCaseLabel]=useState("SYN-APPLICATION-001");
 const activeForms=useMemo(()=>FORMS.filter(f=>f.programs.some(p=>programs.includes(p))&&(f.id!=="SSA-8001-BK"||includeDeferred)),[programs,includeDeferred]);
 const current=FORM_BY_ID[formId];
 const validCurrent=activeForms.some(f=>f.id===formId)?current:activeForms[0];
 const activeSection=validCurrent?.sections.find(s=>s.id===section)??validCurrent?.sections[0];
 const total=activeForms.filter(f=>!f.referenceOnly).map(f=>({f,p:progress(f,answers,rows)}));
 const captured=total.reduce((n,x)=>n+x.p.captured,0);
 const possible=total.reduce((n,x)=>n+x.p.total,0);
 const sections=validCurrent?.sections??[];
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
 function editor(key:string,value:string,kind:string,update:(v:string)=>void,options?:string[]){
  if(kind==="yesno"||kind==="choice")return <select id={key} value={value} onChange={e=>update(e.target.value)}>
    <option value="">Not yet answered</option>
    {(kind==="yesno"?["yes","no"]:options??[]).map(o=><option value={o} key={o}>{o==="yes"?"Yes":o==="no"?"No":o}</option>)}
   </select>;
  if(kind==="long")return <textarea id={key} rows={3} value={value} onChange={e=>update(e.target.value)} placeholder="Record the person's actual answer"/>;
  // Keep SSA dates as text; native date inputs normalize/assume missing month/day.
  return <input id={key} type="text" inputMode={kind==="date"||kind==="month"?"numeric":"text"} value={value} onChange={e=>update(e.target.value)}
    placeholder={kind==="date"?"MM/DD/YYYY":kind==="month"?"MM/YYYY":"Enter answer"}/>;
 }
 function renderQuestion(question:Section["questions"][number]){
  if(!applicable(question,answers))return null;
  const r=answers[question.key]??emptyAnswer();
  return <div className="intake-question" key={question.key}>
   <div className="intake-label"><strong>{question.label}</strong><span>{question.ref}</span></div>
   <label className="intake-control" htmlFor={"q-"+question.key}>
    <span className="sr-only">{question.label}</span>
    {editor("q-"+question.key,r.value,question.kind,v=>change(question.key,{value:v,status:"reported"}),question.options)}
   </label>
   {question.hint&&<p className="hint">{question.hint}</p>}
   <details className="intake-provenance"><summary>Answer source and review</summary>
    <div className="fieldgrid">
     <label>Review status<select value={r.status} onChange={e=>change(question.key,{status:e.target.value as AnswerStatus})}>
      {statuses.map(s=><option value={s.value} key={s.value}>{s.label}</option>)}
     </select></label>
     <label>Source reference (if available)<input value={r.source} onChange={e=>change(question.key,{source:e.target.value})} placeholder="Interview, document or evidence reference"/></label>
    </div>
    <p className="hint">Verification is a human assertion, not an automated model judgment.</p>
   </details>
  </div>;
 }
 function rowEditor(col:Column,value:string,changeValue:(v:string)=>void,group:string,index:number){
  return <label key={col.key}>{col.label}
    {editor(`${group}-${index}-${col.key}`,value,col.kind??"text",changeValue,col.options)}
   </label>;
 }
 function renderCollection(group:NonNullable<Section["collections"]>[number]){
  if(!applicable(group,answers))return null;
  const items=fieldsOf(rows,group.key);
  return <fieldset key={group.key} className="intake-repeat">
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
    </div>
   </div>)}
   <button type="button" className="secondary" onClick={()=>addRow(group.key)}>Add entry</button>
  </fieldset>;
 }
 return <div className="application-workspace">
   <div className="eyebrow">POST-SCREENING · ADULT SSI / SSDI</div>
   <h1>Application workspace</h1>
   <p className="intro">One applicant interview, reusable facts, and separate SSA form sections. No real client information: this preview saves nothing and does not generate or submit official forms.</p>
   <div className="panel intake-setup">
     <div className="fieldgrid">
      <label>Fictional case reference<input value={caseLabel} onChange={e=>setCaseLabel(e.target.value)} maxLength={80}/></label>
      <div><strong>Applications being prepared</strong>
       <div className="intake-choices"><label className="checkline"><input type="checkbox" checked={programs.includes("ssi")} onChange={()=>chooseProgram("ssi")}/> SSI</label>
       <label className="checkline"><input type="checkbox" checked={programs.includes("ssdi")} onChange={()=>chooseProgram("ssdi")}/> SSDI</label></div>
      </div>
     </div>
     <label className="checkline"><input type="checkbox" checked={includeDeferred} onChange={e=>setIncludeDeferred(e.target.checked)}/> Show SSA-8001 deferred/abbreviated SSI as a reference (not the default)</label>
     <p className="hint">Application pathways reflect your manual case planning, not an automated determination of eligibility or whether each form is required.</p>
   </div>
   <div className="intake-tabs" role="group" aria-label="Application views">
    {(["overview","interview","review"] as View[]).map(v=><button type="button" key={v} className={view===v?"active":""} onClick={()=>setView(v)}>{v==="overview"?"Form inventory":v==="interview"?"Guided interview":"Review gaps"}</button>)}
   </div>
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
    <div className="example"><strong>Not ready for an SSA submission</strong><p>Original PDF field population, comprehensive question mapping, applicant review, physical signatures, SSA-specific submission requirements, protected storage, and audit trails are not implemented. No claim has been filed or signed.</p></div>
    <p><strong>Current synthetic case:</strong> {caseLabel}</p>
    <p><strong>Applicant:</strong> {display(answers["person.name"])} · <strong>Onset:</strong> {display(answers["work.onset"])} · <strong>Reported living arrangement:</strong> {display(answers["living.type"])}</p>
   </section>}
   <p className="hint">In-memory only · No autosave, transmission, official signature, or SSA eligibility decision. Verify form editions and complete all source questions before using any generated paperwork.</p>
  </div>;
}
