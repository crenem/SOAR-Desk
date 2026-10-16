/** Conditional question coverage for left navigation.
 * These are mapped intake fields, NOT an SSA completeness certification.
 */
import {FORMS,applicable,type Answers,type FormId,type Program,type Rows} from "./forms";
export type MissingTarget = {
 formId:FormId;sectionId:string;fieldId:string;label:string;
 kind:"question"|"collection";status:"uncollected"|"clarify";
};
export type SectionCoverage = {
 id:string;label:string;collected:number;total:number;missing:MissingTarget[];
};
export type FormCoverage = {
 id:FormId;label:string;collected:number;total:number;sections:SectionCoverage[];
 referenceOnly:boolean;
};
const captured=(value:string|undefined,status?:string)=>Boolean(value?.trim())||status==="unknown";
export function formCoverage(
 programs:Program[],includeDeferred:boolean,answers:Answers,rows:Rows
):FormCoverage[]{
 return FORMS.filter(f=>f.programs.some(p=>programs.includes(p))
   &&(f.id!=="SSA-8001-BK"||includeDeferred)).map(form=>{
  const sections:SectionCoverage[]=form.sections.map(section=>{
   let collected=0,total=0;
   const missing:MissingTarget[]=[];
   for(const q of section.questions.filter(x=>applicable(x,answers))){
    total++;
    const answer=answers[q.key];
    if(captured(answer?.value,answer?.status)&&answer?.status!=="clarify"){collected++;continue;}
    missing.push({formId:form.id,sectionId:section.id,fieldId:q.key,
      label:q.label,kind:"question",status:answer?.status==="clarify"?"clarify":"uncollected"});
   }
   for(const group of (section.collections??[]).filter(x=>applicable(x,answers))){
    total++;
    const entries=rows[group.key]??[];
    if(entries.some(r=>Object.entries(r).some(([k,v])=>!k.startsWith("_")&&!!v?.trim()))){collected++;continue;}
    missing.push({formId:form.id,sectionId:section.id,fieldId:group.key,
      label:group.title,kind:"collection",status:"uncollected"});
   }
   return {id:section.id,label:section.title,collected,total,missing};
  });
  return {id:form.id,label:form.title,referenceOnly:!!form.referenceOnly,
   collected:sections.reduce((n,s)=>n+s.collected,0),
   total:sections.reduce((n,s)=>n+s.total,0),sections};
 });
}
