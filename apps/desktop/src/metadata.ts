/** Source-linked metadata candidate extraction; synthetic-only, no clinical inference. */
export type MetadataCategory = "Patient" | "Encounter" | "Document" | "Diagnoses" | "Medical history" | "Psychiatric history" | "Medications" | "Allergies" | "Functional evidence";
export type MetadataCandidate = {
  id: string; category: MetadataCategory; field: string; value: string;
  page: number; excerpt: string; source: "explicit-label" | "section-text";
  status: "PendingHumanReview" | "HumanVerified" | "Rejected";
};
export type SourcePage = { page: number; text: string };
const headings: {category: MetadataCategory; pattern: RegExp}[] = [
  {category:"Diagnoses",pattern:/^(?:primary |secondary |discharge |final |working )?diagnos(?:is|es)\b|^assessment(?:\s*\/\s*diagnos(?:is|es))?\b/i},
  {category:"Medical history",pattern:/^(?:past )?medical history\b|^past medical history\b|^pmh\b/i},
  {category:"Psychiatric history",pattern:/^(?:past )?psychiatric history\b|^mental health history\b/i},
  {category:"Medications",pattern:/^(?:current |discharge |home )?medications?\b|^medication reconciliation\b/i},
  {category:"Allergies",pattern:/^allerg(?:y|ies)\b/i},
  {category:"Functional evidence",pattern:/^functional (?:status|limitations?|assessment|history)\b|^activities of daily living\b|^adls\b/i}
];
const fields: {category:MetadataCategory;field:string;pattern:RegExp}[] = [
 {category:"Patient",field:"Patient name",pattern:/^(?:patient(?: name)?|name)\s*:\s*(.+)$/i},
 {category:"Patient",field:"Date of birth",pattern:/^(?:date of birth|dob)\s*:\s*(.+)$/i},
 {category:"Patient",field:"Social Security number",pattern:/^(?:social security (?:number|no\.?|#)|ssn)\s*:\s*(.+)$/i},
 {category:"Patient",field:"Phone number",pattern:/^(?:phone(?: number)?|telephone|contact phone)\s*:\s*(.+)$/i},
 {category:"Patient",field:"Height",pattern:/^height\s*:\s*(.+)$/i},
 {category:"Patient",field:"Weight",pattern:/^weight\s*:\s*(.+)$/i},
 {category:"Patient",field:"Medical record number",pattern:/^(?:medical record (?:number|no\.?)|mrn)\s*:\s*(.+)$/i},
 {category:"Encounter",field:"Admission date",pattern:/^(?:admission date|admitted(?: on)?)\s*:\s*(.+)$/i},
 {category:"Encounter",field:"Discharge date",pattern:/^(?:discharge date|discharged(?: on)?)\s*:\s*(.+)$/i},
 {category:"Encounter",field:"Encounter date",pattern:/^(?:encounter date|date of service|visit date)\s*:\s*(.+)$/i},
 {category:"Encounter",field:"Department",pattern:/^(?:department|unit|service)\s*:\s*(.+)$/i},
 {category:"Document",field:"Facility",pattern:/^(?:facility|hospital|organization)\s*:\s*(.+)$/i},
 {category:"Document",field:"Document type",pattern:/^(?:document type|note type|record type)\s*:\s*(.+)$/i},
 {category:"Document",field:"Author",pattern:/^(?:author|attending physician|provider|clinician)\s*:\s*(.+)$/i}
];
const MAX_VALUE=350;
const MAX_CANDIDATES=200;
/** Extract only explicitly visible source wording. Review all candidates against the original PDF. */
export function extractMetadata(pages:SourcePage[]):MetadataCandidate[] {
 const candidates:MetadataCandidate[]=[];
 const seen=new Set<string>();
 function add(category:MetadataCategory, field:string, value:string, page:number, excerpt:string, source:MetadataCandidate["source"]) {
   value=value.trim().replace(/^[-•*]\s*/,"").trim();
   if(!value || value.length>MAX_VALUE || /^(?:none|unknown|n\/a|not documented)$/i.test(value))return;
   const key=category+"|"+field+"|"+value.toLowerCase()+"|"+page;
   if(seen.has(key)||candidates.length>=MAX_CANDIDATES)return;
   seen.add(key);candidates.push({id:"M-"+(candidates.length+1),category,field,value,page,excerpt,source,status:"PendingHumanReview"});
 }
 for(const page of pages) {
   let section:MetadataCategory|null=null;
   let linesInSection=0;
   for(const raw of page.text.split(/\r?\n/)) {
     const line=raw.trim();
     if(!line)continue;
     const heading=line.replace(/:\s*$/,"").trim();
     const header=headings.find(h=>heading.length<75&&h.pattern.test(heading)&& !/:\s*\S/.test(line));
     if(header){section=header.category;linesInSection=0;continue;}
     // A different title/section should terminate previous capture; avoid sweeping prose.
     if(/^[A-Z][A-Za-z /()-]{2,55}:$/.test(line) && !header){section=null;continue;}
     let matched=false;
     for(const field of fields) {
       const result=line.match(field.pattern);
       if(result){add(field.category,field.field,result[1],page.page,line,"explicit-label"); matched=true;break;}
     }
     if(matched)continue;
     const inline=line.match(/^(diagnos(?:is|es)|medications?|allerg(?:y|ies)|medical history|psychiatric history|functional (?:limitations?|status))\s*:\s*(.+)$/i);
     if(inline){
       const match=headings.find(h=>h.pattern.test(inline[1]));
       if(match)add(match.category,"Documented statement",inline[2],page.page,line,"explicit-label");
       section=null;continue;
     }
     if(section && linesInSection<12 && line.length<=MAX_VALUE){
       add(section,"Documented statement",line,page.page,line,"section-text");
       linesInSection++;
     }else if(linesInSection>=12){section=null;}
   }
 }
 return candidates;
}
