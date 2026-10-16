import {useState} from "react";
import type {FormCoverage,MissingTarget} from "./form-navigation";
type Props={forms:FormCoverage[];onJump:(target:MissingTarget)=>void};
export default function ProgressNav({forms,onJump}:Props){
 const [expanded,setExpanded]=useState<Record<string,boolean>>({});
 return <nav className="form-progress" aria-label="Form progress and missing answer navigation">
  <div className="progress-heading">FORM PROGRESS <small>Mapped questions only</small></div>
  {forms.map(form=>{
   const missing=form.total-form.collected;
   return <div key={form.id} className="progress-form">
    <button className="progress-form-title" type="button" aria-expanded={!!expanded[form.id]}
      onClick={()=>setExpanded(old=>({...old,[form.id]:!old[form.id]}))}>
      <span aria-hidden="true">{expanded[form.id]?"▾":"▸"}</span>
      <span>{form.id}</span>
      <small>{form.referenceOnly?"Reference":form.total?Math.round(100*form.collected/form.total)+"%":"—"}</small>
    </button>
    {!form.referenceOnly&&<div role="progressbar"
       aria-label={form.id+" mapped question coverage"}
       aria-valuenow={form.collected} aria-valuemin={0}
       aria-valuemax={form.total||1} className="progress-track">
      <span style={{width:(form.total?100*form.collected/form.total:0)+"%"}}/>
    </div>}
    {expanded[form.id]&&<div className="progress-subtree">
      {form.referenceOnly?<p className="sidebar-hint">Open official form for manual review; no mapped fields yet.</p>:
      form.sections.map(section=>{
       const id=form.id+"|"+section.id;
       const remaining=section.missing.length;
       return <div key={id}>
        <button type="button" className="progress-section"
          aria-expanded={!!expanded[id]}
          onClick={()=>setExpanded(old=>({...old,[id]:!old[id]}))}>
          <span aria-hidden="true">{expanded[id]?"▾":"▸"}</span>
          <span className="progress-section-label">{section.label}</span>
          <small aria-label={remaining+" uncollected mapped fields"}>
           {remaining===0?"✓":remaining}</small>
        </button>
        {expanded[id]&&<div className="progress-fields">
          {section.missing.length?
            section.missing.map(target=><button key={target.kind+target.fieldId}
             type="button" title={"Go to "+target.label} onClick={()=>onJump(target)}>
             <span aria-hidden="true">{target.status==="clarify"?"!":"○"}</span>
             <span>{target.label}</span>
             </button>):
            <p className="sidebar-hint">All mapped fields collected. Check the original PDF for unmapped questions.</p>}
         </div>}
       </div>})}
    </div>}
    {!form.referenceOnly&&missing>0&&<button type="button" className="progress-next"
      onClick={()=>{const first=form.sections.flatMap(s=>s.missing)[0];if(first)onJump(first);}}>
      Next uncollected ({missing}) →
     </button>}
   </div>;
  })}
  <p className="sidebar-hint">Progress counts collected mapped fields, not required answers or SSA approval.</p>
 </nav>;
}
