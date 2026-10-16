/** Official-SSA-sourced, deliberately PARTIAL synthetic intake map. Not a completed federal form. */
export type Program="ssi"|"ssdi";
export type FormId="SSA-16"|"SSA-8000-BK"|"SSA-8001-BK"|"SSA-3368-BK"|"SSA-827"|"SSA-3369-BK"|"SSA-3373-BK";
export type AnswerStatus="reported"|"verified"|"unknown"|"clarify";
export type Response={value:string;status:AnswerStatus;source:string};
export type Answers=Record<string,Response>;
export type Kind="text"|"long"|"date"|"month"|"yesno"|"choice";
export type Question={key:string;ref:string;label:string;kind:Kind;options?:string[];when?:{key:string;equals:string};hint?:string};
export type Column={key:string;label:string;kind?:Kind;options?:string[]};
export type Collection={key:string;title:string;ref:string;columns:Column[];when?:{key:string;equals:string};hint?:string};
export type Section={id:string;title:string;pages:string;questions:Question[];collections?:Collection[]};
export type FormDef={id:FormId;title:string;edition:string;pages:number;url:string;programs:Program[];phase:"application"|"disability"|"authorization";sections:Section[];referenceOnly?:boolean;note:string};
export type Rows=Record<string,Record<string,string>[]>;
const q=(key:string,ref:string,label:string,kind:Kind="text",extras:Partial<Question>={}):Question=>({key,ref,label,kind,...extras});
const yn=(key:string,ref:string,label:string)=>q(key,ref,label,"yesno");
const conditional=(key:string,ref:string,label:string,dep:string,equals="yes",kind:Kind="long"):Question=>q(key,ref,label,kind,{when:{key:dep,equals}});
const choose=(key:string,ref:string,label:string,options:string[])=>q(key,ref,label,"choice",{options});
const collection=(key:string,title:string,ref:string,columns:Column[],hint?:string,when?:{key:string;equals:string}):Collection=>({key,title,ref,columns,hint,when});
const applicant=[
 q("person.name","Name","Applicant name"),q("person.ssn","SSN","Social Security number"),
 q("person.dob","DOB","Date of birth","date"),q("person.phone","Phone","Daytime / message telephone"),
 q("person.mail","Mailing address","Safe mailing address"),q("person.language","Language","Preferred spoken language")
];
const jobs=collection("jobs","Qualifying employment in five years before unable to work","SSA-3368 §6 / SSA-3369 §2",
 [{key:"title",label:"Job title"},{key:"business",label:"Type of business"},{key:"from",label:"Start MM/YYYY",kind:"month"},{key:"to",label:"End MM/YYYY",kind:"month"},
 {key:"hours",label:"Hours/day"},{key:"days",label:"Days/week"},{key:"pay",label:"Rate of pay"},
 {key:"tasks",label:"Actual duties and tasks",kind:"long"},{key:"demands",label:"Tools, lifting, physical demands and hazards",kind:"long"},
 {key:"impact",label:"Impact of conditions on that job",kind:"long"}],
 "Each job title separately, including qualifying foreign and self-employment. Do not infer work capacity.",{key:"work.any",equals:"yes"});
const providers=collection("providers","Medical treatment sources","SSA-3368 §8",
 [{key:"facility",label:"Facility/office"},{key:"provider",label:"Clinician (if known)"},{key:"address",label:"Address"},
 {key:"phone",label:"Telephone"},{key:"conditions",label:"Conditions treated",kind:"long"},{key:"first",label:"First seen MM/YYYY",kind:"month"},
 {key:"last",label:"Last seen MM/YYYY",kind:"month"},{key:"next",label:"Next visit MM/YYYY",kind:"month"}],
 "Record source contacts, including scheduled future care. Lack of records is not evidence of no impairment.",{key:"medical.treated",equals:"yes"});
const meds=collection("medicines","Prescription and nonprescription medicines","SSA-3368 §7",
 [{key:"medicine",label:"Medicine"},{key:"doctor",label:"Prescriber, if known"},{key:"reason",label:"Reason, if known"}],undefined,{key:"medical.medicines",equals:"yes"});
const diagnoses=collection("conditions","Applicant-reported physical and mental conditions","SSA-3368 §3.A",
 [{key:"condition",label:"Condition, as reported"},{key:"details",label:"Additional details (not inferred)",kind:"long"}]);
const resources=collection("resources","Resources: filing-month snapshot","SSA-8000 Part 3",
 [{key:"type",label:"Resource",kind:"choice",options:["Trust","Vehicle","Real property","Business equipment","ABLE account","Financial account","Cash","Stocks/bonds/funds","Life insurance","Burial fund or space","Other"]},
 {key:"owner",label:"Owner/co-owner"},{key:"value",label:"Reported value"},{key:"owed",label:"Amount owed"},{key:"asof",label:"As-of date",kind:"date"},{key:"description",label:"Notes"}],
 "Capture values without determining exclusions or applying SSI financial eligibility rules.");
const income=collection("income","Income: received and anticipated","SSA-8000 Part 4",
 [{key:"recipient",label:"Recipient"},{key:"type",label:"Income type"},{key:"source",label:"Source"},
 {key:"amount",label:"Amount"},{key:"frequency",label:"Frequency"},{key:"when",label:"Received/expected dates"}],
 "The full SSA-8000 asks about income since the first moment of the filing month and expected in the next 14 months.");
const form=(id:FormId,title:string,edition:string,pages:number,url:string,programs:Program[],phase:FormDef["phase"],note:string,sections:Section[],referenceOnly=false):FormDef=>({id,title,edition,pages,url,programs,phase,note,sections,referenceOnly});
export const FORMS:FormDef[]=[
form("SSA-3368-BK","Disability Report — Adult","06-2024",15,"https://www.ssa.gov/forms/ssa-3368-bk.pdf",["ssdi","ssi"],"disability","First-pass capture for Sections 1–11; not yet a complete field-by-field transcription.",[
 {id:"identity",title:"§1 · About the applicant",pages:"3",questions:[...applicant,q("person.email","1.E","Email"),yn("person.othernames","1.C","Other names on medical or educational records?"),conditional("person.othernamesText","1.C","Other names","person.othernames"),yn("person.englishSpeak","1.G","Can speak and understand English?"),yn("person.englishRead","1.H","Can read and understand English?"),yn("person.englishWrite","1.I","Can write more than a name in English?")]},
 {id:"contacts",title:"§2 · Alternate contacts",pages:"3–4",questions:[yn("contacts.available","§2","Are there contacts who can help SSA reach the applicant?")],collections:[collection("contacts","People familiar with applicant","§2",[{key:"name",label:"Name"},{key:"relationship",label:"Relationship"},{key:"phone",label:"Phone"},{key:"address",label:"Address"}],"Do not assume permission to contact them.",{key:"contacts.available",equals:"yes"})]},
 {id:"impairments",title:"§3 · Medical conditions",pages:"4",questions:[q("medical.height","3.B","Height"),q("medical.weight","3.C","Weight")],collections:[diagnoses]},
 {id:"activity",title:"§4, §6 · Work activity and history",pages:"4–9",questions:[choose("work.current","4.A","Current work situation",["never","stopped","working"]),q("work.onset","4.B–F","Date conditions became severe enough to keep from working","date"),conditional("work.stop","4.C","Date last worked","work.current","stopped","date"),yn("work.changed","4.D/4.F","Did conditions require changes to work activity?"),yn("work.any","6.A","Any qualifying work in the five years before unable to work?"),q("work.explain","6.B–D","Additional job demands and effect of conditions","long")],collections:[jobs]},
 {id:"education",title:"§5 · Education and training",pages:"5–6",questions:[q("education.level","5.A","Highest grade or schooling"),q("education.last","5.A","Date completed","month"),yn("education.special","5.B","Special education?"),conditional("education.specialDetail","5.B","Special education details","education.special"),yn("education.training","5.C","Job/trade training?"),conditional("education.trainingDetail","5.C","Training details","education.training"),q("education.language","5.D","Everyday written language"),yn("education.read","5.E","Can read a simple message?"),yn("education.write","5.F","Can write a simple message?")]},
 {id:"meds",title:"§7 · Medicines",pages:"9",questions:[yn("medical.medicines","§7","Taking medicines now?")],collections:[meds]},
 {id:"treatment",title:"§8 · Treatment sources",pages:"10–12",questions:[yn("medical.treated","8.A","Seen a provider or have an appointment scheduled?")],collections:[providers]},
 {id:"other",title:"§9–11 · Other evidence and remarks",pages:"12–15",questions:[q("medical.other","§9","Other organizations holding information","long"),q("medical.support","§10","Vocational rehabilitation / other support services","long"),q("medical.remarks","§11","Remarks by item number","long")]}
]),
form("SSA-827","Authorization to Disclose Information to SSA","06-2024",2,"https://www.ssa.gov/forms/ssa-827.pdf",["ssi","ssdi"],"authorization","Only records execution status; no electronic signing, consent inference or signature synthesis.",[
 {id:"subject",title:"Subject of disclosure",pages:"1",questions:[q("person.name","Header","Name"),q("person.ssn","Header","SSN"),q("person.dob","Header","DOB","date"),q("person.mail","Address","Address"),q("person.phone","Phone","Phone")]},
 {id:"signature",title:"Read, sign and witness",pages:"1–2",questions:[
 choose("auth.signer","Signature","Person signing",["individual","parent","guardian","authorized representative"]),
 yn("auth.reviewed","Signature","Have BOTH pages been read and reviewed?"),
 choose("auth.status","Signature","Physical authorization status",["not_requested","awaiting_ink_signature","signed_on_paper","revoked","needs_review"]),
 conditional("auth.date","Signature","Date on the signed paper document","auth.status","signed_on_paper","date"),
 q("auth.witness","Witness","Witness or authorized representative details","long")
 ]}
]),
form("SSA-3369-BK","Work History Report","07-2026",14,"https://www.ssa.gov/forms/ssa-3369.pdf",["ssi","ssdi"],"disability","Shared job records capture common §2 information; not every physical-activity cell is mapped yet.",[
 {id:"name",title:"§1 · Applicant",pages:"3",questions:[q("person.name","1.A","Name"),q("person.ssn","1.B","SSN"),q("person.phone","1.C","Phone")]},
 {id:"jobs",title:"§2 · Job history and demands",pages:"3–12",questions:[yn("work.any","§2","Any qualifying work in five years before unable to work?"),q("work.onset","§2","Onset date","date"),q("work.demands","§2","Duties, physical demands, hazards and mental requirements","long")],collections:[jobs]},
 {id:"remarks",title:"§3–4 · Remarks and preparer",pages:"13–14",questions:[q("work.remarks","§3","Additional details","long"),q("work.preparer","§4","Person completing report")]}
]),
form("SSA-3373-BK","Function Report — Adult","2026 PDF (mixed page header dates)",10,"https://www.ssa.gov/forms/ssa-3373-bk.pdf",["ssi","ssdi"],"disability","A first-pass narrative guided interview. SSA's downloaded PDF contains inconsistent edition labels across pages; verify before final population.",[
 {id:"general",title:"A · General information",pages:"3",questions:[q("person.name","1","Applicant"),q("person.ssn","2","SSN"),q("person.phone","3","Phone"),
 choose("function.where","4.a","Living setting",["house","apartment","boarding house","nursing home","shelter","group home","other"]),choose("function.with","4.b","Living with",["alone","family","friends","other"])]},
 {id:"work",title:"B · Effect on ability to work",pages:"3",questions:[q("function.work","5","How do conditions limit ability to work?","long")]},
 {id:"daily",title:"C · Daily activities",pages:"4–7",questions:[q("function.day","6","Typical day from wake-up to bedtime","long"),yn("function.cares","7","Care for anyone else?"),conditional("function.caresHow","7","Who and what care?","function.cares"),yn("function.pets","8","Care for animals?"),conditional("function.petsHow","8","Details","function.pets"),q("function.before","10","Things you once did but cannot do now","long"),yn("function.sleep","11","Conditions affect sleep?"),conditional("function.sleepHow","11","How is sleep affected?","function.sleep"),q("function.personal","12","Personal care and hygiene","long"),q("function.meals","13","Preparing meals","long"),q("function.chores","14","Household chores","long"),q("function.travel","15–16","Getting around and shopping","long"),q("function.money","17","Money handling","long"),q("function.hobbies","18","Hobbies","long"),q("function.social","19","Social activities","long")]},
 {id:"abilities",title:"D · Physical, cognitive and social abilities",pages:"8–10",questions:[q("function.abilities","20","Abilities affected (actual examples)","long"),q("function.instructions","20","Following instructions","long"),q("function.stress","20","Handling stress/change","long"),q("function.aids","21","Aids, devices, and dates prescribed","long"),yn("function.medSide","22","Medication side effects?"),conditional("function.sideDetails","22","Medicine name and side effects","function.medSide")]},
 {id:"remarks",title:"E · Remarks",pages:"10",questions:[q("function.remarks","E","Additional numbered remarks","long"),q("function.preparer","E","Person completing report")]}
]),
form("SSA-8000-BK","Full SSI Application","09-2024",24,"https://www.ssa.gov/forms/ssa-8000-bk.pdf",["ssi"],"application","Starter capture of major parts only; full SSI application contains many additional numbered and conditional items.",[
 {id:"basic",title:"Part 1 · Basic facts",pages:"1–6",questions:[...applicant,q("person.birthplace","§1–8","Place of birth"),yn("person.married","§4","Married?"),conditional("person.spouse","§4","Spouse's name","person.married","yes","text"),q("person.immigration","§9–17","Citizenship, residence and immigration facts","long"),q("ssi.month","Part 1","Filing month MM/YYYY (verify; never invent)","month")]},
 {id:"living",title:"Part 2 · Living arrangements",pages:"6–10",questions:[
 choose("living.type","19","Current situation AT signature date",["household","noninstitutional care","institution","transient or homeless"]),
 q("living.since","19","Date situation began","date"),
 conditional("living.institution","20–21","Institution details","living.type","institution"),
 conditional("living.care","22–23","Non-institutional care details","living.type","noninstitutional care"),
 conditional("living.household","24–35","Household members, rent, shelter expenses","living.type","household"),
 conditional("living.homeless","19 → 36","Transient/homeless remarks and safe contact method","living.type","transient or homeless"),
 q("living.outside","36","Shelter provided or paid by someone outside household","long"),
 yn("living.same","37.a","Living situation same since first moment of filing month?"),
 yn("living.change","37.b","Expect this situation to change?")]},
 {id:"resources",title:"Part 3 · Resources",pages:"11–16",questions:[q("resources.date","Part 3","Value snapshot date: first moment of filing month","date"),yn("resources.transferred","48","Any property transfer or gift in stated lookback?"),conditional("resources.transfer","48","Transfer details including co-ownership, date and consideration","resources.transferred")],collections:[resources]},
 {id:"income",title:"Part 4 · Income",pages:"16–19",questions:[q("income.period","49","Identify months of income and future estimates","long"),q("income.other","Part 4","Bills paid by others or other contributions","long")],collections:[income]},
 {id:"other",title:"Parts 5–8 · Programs, permissions and signatures",pages:"19–22",questions:[yn("ssi.snap","57","Receiving SNAP?"),yn("ssi.health","58","Other medical coverage?"),yn("ssi.financialPermission","Part 8","Granted SSA financial-record access?"),q("ssi.remarks","Part 7","Item-numbered remarks","long"),choose("ssi.signed","62","Physical application signature",["not_requested","awaiting_ink_signature","signed_on_paper","needs_review"])]}
]),
form("SSA-16","Disability Insurance Application","09-2025",7,"https://www.ssa.gov/forms/ssa-16-bk.pdf",["ssdi"],"application","Already inventoried. Full field interview not yet implemented.",[],true),
form("SSA-8001-BK","Deferred/Abbreviated SSI Application","07-2023",12,"https://www.ssa.gov/forms/ssa-8001-bk.pdf",["ssi"],"application","Not the default full SSI application. Only use when SSA's abbreviated/deferred pathway applies.",[],true)
];
export const FORM_BY_ID=Object.fromEntries(FORMS.map(f=>[f.id,f])) as Record<FormId,FormDef>;
export function applicable(question:Pick<Question,"when">|Pick<Collection,"when">,answers:Answers):boolean{
 return !question.when||answers[question.when.key]?.value===question.when.equals;
}
export function progress(form:FormDef,answers:Answers,rows:Rows){
 const keys=new Set(form.sections.flatMap(s=>s.questions.filter(q=>applicable(q,answers)).map(q=>q.key)));
 const groups=form.sections.flatMap(s=>(s.collections??[]).filter(c=>applicable(c,answers)));
 let captured=0,verified=0;
 for(const key of keys){const r=answers[key];if(r&&(r.value.trim()||r.status==="unknown")){captured++;if(r.status==="verified")verified++;}}
 for(const group of groups){const items=rows[group.key]??[];if(items.some(item=>Object.entries(item).some(([k,v])=>!k.startsWith("_")&&!!v?.trim()))){captured++;if(items.every(item=>item._status==="verified"))verified++;}}
 return {captured,verified,total:keys.size+groups.length};
}
