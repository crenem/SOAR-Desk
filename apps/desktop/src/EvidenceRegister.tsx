import type { EvidenceReference,EvidenceStatus } from "./application-package";
import type { Dispatch,SetStateAction } from "react";

type Props={evidence:EvidenceReference[];setEvidence:Dispatch<SetStateAction<EvidenceReference[]>>;syntheticOnly?:boolean};
const kinds:{value:EvidenceReference["kind"];label:string}[]=[
 {value:"medical",label:"Medical or clinical record"},
 {value:"employment",label:"Employment / vocational record"},
 {value:"applicant_statement",label:"Applicant / witness statement"},
 {value:"other",label:"Other source"}
];
export default function EvidenceRegister({evidence,setEvidence,syntheticOnly=true}:Props){
 function add(){
   const prefix=syntheticOnly?"SYN-EV-":"EV-";
   const indices=evidence.map(e=>Number(e.id.match(new RegExp("^"+prefix+"(\\d+)$"))?.[1]||0));
   const next=Math.max(0,...indices)+1;
   setEvidence(list=>[...list,{id:prefix+String(next).padStart(4,"0"),title:"",
     kind:"medical",location:"",note:"",status:"pending",reviewer:""}]);
 }
 function change(id:string,patch:Partial<EvidenceReference>){
   setEvidence(list=>list.map(e=>e.id===id?{...e,...patch}:e));
 }
 return <section className="panel">
  <div className="eyebrow">CASE-SPECIFIC SOURCE REFERENCES</div>
  <h2>Evidence register</h2>
  <p className="muted">Record locally indexed source references that can be linked to individual form answers. For a linked answer, enter the exact <strong>{syntheticOnly?"SYN-EV-...":"EV-..."}</strong> identifier in its <strong>Answer source and review</strong> field. A registered source is not proof that a clinical interpretation is correct.</p>
  <p className="hint"><strong>Important:</strong> This is a metadata-only index. No PDF bytes or extracted clinical content are attached, transmitted, or saved. Laya/Qwen findings are not imported automatically. Human verification must occur outside the model's output.</p>
  {evidence.length===0&&<p className="muted">No evidence source references registered yet.</p>}
  {evidence.map(e=><fieldset key={e.id} className="intake-repeat">
   <legend>{e.id} · {e.title||"New evidence source"}</legend>
   <div className="fieldgrid">
    <label>Source title<input value={e.title} onChange={ev=>change(e.id,{title:ev.target.value})} placeholder="Discharge summary, employer statement…"/></label>
    <label>Source type<select value={e.kind} onChange={ev=>change(e.id,{kind:ev.target.value as EvidenceReference["kind"]})}>
     {kinds.map(k=><option key={k.value} value={k.value}>{k.label}</option>)}
    </select></label>
    <label>Location in source / page numbers<input value={e.location} onChange={ev=>change(e.id,{location:ev.target.value})} placeholder="Page 3, functional limitations paragraph"/></label>
    <label>Human review state<select value={e.status} onChange={ev=>change(e.id,{status:ev.target.value as EvidenceStatus,reviewer:""})}>
     <option value="pending">Pending human review</option>
     <option value="human_verified">Human verified against source</option>
     <option value="rejected">Rejected / unsupported</option>
    </select></label>
   </div>
   {e.status==="human_verified"&&<label>Reviewer identifier (required)<input value={e.reviewer} onChange={ev=>change(e.id,{reviewer:ev.target.value})} placeholder="Authorized reviewer code"/></label>}
   <label>Evidence note, limited to supported facts<textarea rows={2} value={e.note} onChange={ev=>change(e.id,{note:ev.target.value})} placeholder="Describe what the source actually states and what remains uncertain."/></label>
   <button type="button" className="linkbutton" onClick={()=>setEvidence(list=>list.filter(item=>item.id!==e.id))}>Remove source reference</button>
  </fieldset>)}
  <button className="secondary" type="button" onClick={add}>Add evidence reference</button>
 </section>;
}
