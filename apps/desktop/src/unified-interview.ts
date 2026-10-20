/** One canonical interview per applicant, keyed to the existing SSA crosswalk.
 * This deduplicates ONLY currently inventoried fields. It cannot imply that
 * every question in every official SSA edition has been audited or mapped. */
import type {Answers,Collection,FormDef,Question} from "./forms";
import {applicable} from "./forms";
export type SharedQuestion=Question&{references:string[]};
export type SharedCollection=Collection&{references:string[]};
export type InterviewDomain={id:string;title:string;questions:SharedQuestion[];collections:SharedCollection[]};
export type InterviewIndex={
  domains:InterviewDomain[];
  questionCount:number;
  repeatedQuestionOccurrences:number;
  collectionCount:number;
  repeatedCollectionOccurrences:number;
  mappingConflicts:string[];
};
const DOMAIN_ORDER=[
 ["person","Applicant identity, contacts & representation"],
 ["work","Employment and work activity"],
 ["education","Education and training"],
 ["medical","Medical conditions and treatment"],
 ["function","Functioning and daily activities"],
 ["living","Living arrangements and household"],
 ["resources","Resources and financial information"],
 ["income","Income and other benefits"],
 ["auth","Authorization and signatures"],
 ["ssi","SSI-specific information"],
 ["other","Additional information and remarks"],
] as const;
function domainFor(key:string){
 const root=key.split(".")[0];
 if(root==="person"||root==="contacts"||root==="representative")return "person";
 if(root==="work"||root.startsWith("ssa3368"))return "work";
 if(root==="education"||root==="school")return "education";
 if(root==="medical"||root==="conditions"||root==="providers"||root==="medicines")return "medical";
 if(root==="function")return "function";
 if(root==="living"||root==="household")return "living";
 if(root==="resources")return "resources";
 if(root==="income"||root==="benefits")return "income";
 if(root==="auth"||root==="signature")return "auth";
 if(root==="ssi")return "ssi";
 return "other";
}
/** Canonical keys are unique regardless of how many forms refer to a question.
 * Every mapped reference is preserved. Incompatible definitions are reported,
 * rather than silently assuming identical wording/branching.
 */
export function buildUnifiedInterview(forms:FormDef[]):InterviewIndex{
 const qMap=new Map<string,SharedQuestion>();
 const cMap=new Map<string,SharedCollection>();
 const conflicts=new Set<string>();
 let questionOccurrences=0, collectionOccurrences=0;
 for(const f of forms.filter(f=>!f.referenceOnly)){
  for(const section of f.sections){
   for(const item of section.questions){
    questionOccurrences++;
    const ref=f.id+" "+item.ref;
    const old=qMap.get(item.key);
    if(!old){qMap.set(item.key,{...item,references:[ref]});continue;}
    if(!old.references.includes(ref))old.references.push(ref);
    if(old.kind!==item.kind||JSON.stringify(old.when??null)!==JSON.stringify(item.when??null)
      ||JSON.stringify(old.options??[])!==JSON.stringify(item.options??[])){
      conflicts.add(item.key+": inconsistent form-specific type, branch or options");
    }
   }
   for(const item of section.collections??[]){
    collectionOccurrences++;
    const ref=f.id+" "+item.ref;
    const old=cMap.get(item.key);
    if(!old){cMap.set(item.key,{...item,references:[ref]});continue;}
    if(!old.references.includes(ref))old.references.push(ref);
    if(JSON.stringify(old.columns)!==JSON.stringify(item.columns)
      ||JSON.stringify(old.when??null)!==JSON.stringify(item.when??null)){
      conflicts.add(item.key+": inconsistent repeating-row crosswalk");
    }
   }
  }
 }
 const domains:InterviewDomain[]=DOMAIN_ORDER.map(([id,title])=>({
  id,title,
  questions:[...qMap.values()].filter(q=>domainFor(q.key)===id),
  collections:[...cMap.values()].filter(c=>domainFor(c.key)===id),
 })).filter(d=>d.questions.length+d.collections.length>0);
 return {domains,questionCount:qMap.size,repeatedQuestionOccurrences:questionOccurrences-qMap.size,
   collectionCount:cMap.size,repeatedCollectionOccurrences:collectionOccurrences-cMap.size,
   mappingConflicts:[...conflicts]};
}
export function unifiedProgress(index:InterviewIndex,answers:Answers,rows:Record<string,Record<string,string>[]>){
 const fields=index.domains.flatMap(d=>d.questions).filter(q=>applicable(q,answers));
 const groups=index.domains.flatMap(d=>d.collections).filter(c=>applicable(c,answers));
 const answered=fields.filter(q=>Boolean(answers[q.key]?.value.trim())||answers[q.key]?.status==="unknown").length;
 const filledGroups=groups.filter(g=>(rows[g.key]??[]).some(r=>Object.entries(r).some(([k,v])=>!k.startsWith("_")&&!!v.trim()))).length;
 return {possible:fields.length+groups.length,answered:answered+filledGroups,
  remaining:fields.length+groups.length-answered-filledGroups};
}
