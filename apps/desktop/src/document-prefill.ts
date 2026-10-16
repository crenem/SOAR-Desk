/** Human-confirmed import proposals from a source document reviewed in an explicitly selected local case.
 * Never infer unlabelled facts or overwrite an existing application answer. */
import type {MetadataCandidate} from "./metadata";
import {kindFor,normalizeOnBlur,validateDisplay} from "./field-format";
export type PrefillSuggestion={
  key:string;value:string;label:string;source:string;excerpt:string;page:number;
  documentSha256:string;
};
const FIELDS:Record<string,{key:string;label:string}>={
 "Patient|Patient name":{key:"person.name",label:"Applicant name"},
 "Patient|Date of birth":{key:"person.dob",label:"Date of birth"},
 "Patient|Social Security number":{key:"person.ssn",label:"Social Security number"},
 "Patient|Phone number":{key:"person.phone",label:"Telephone"},
 "Patient|Height":{key:"medical.height",label:"Height"},
 "Patient|Weight":{key:"medical.weight",label:"Weight"}
};
export function reviewedSuggestions(
 metadata:MetadataCandidate[],sha256:string,caseReference:string
):PrefillSuggestion[]{
 if(!/^(?:SYN-[A-Za-z0-9_-]{1,76}|CASE-[A-Za-z0-9_-]{11,75})$/.test(caseReference)||!/^[0-9a-f]{64}$/i.test(sha256))return [];
 const found=new Map<string,PrefillSuggestion>();
 const conflicted=new Set<string>();
 for(const item of metadata){
  if(item.status!=="HumanVerified"||item.source!=="explicit-label"||!item.value.trim())continue;
  const target=FIELDS[item.category+"|"+item.field];
  if(!target)continue;
  const kind=kindFor(target.key,item.field==="Date of birth"?"date":"text");
  const formatted=normalizeOnBlur(kind,item.value);
  if(validateDisplay(kind,formatted))continue;
  const suggestion:PrefillSuggestion={
    key:target.key,label:target.label,value:formatted,
    source:`Document SHA-256 ${sha256} · page ${item.page} · verified field ${item.id}`,
    excerpt:item.excerpt,page:item.page,documentSha256:sha256
  };
  const previous=found.get(target.key);
  if(previous&&previous.value!==suggestion.value)conflicted.add(target.key);
  else if(!previous)found.set(target.key,suggestion);
 }
 for(const key of conflicted)found.delete(key);
 return [...found.values()];
}
