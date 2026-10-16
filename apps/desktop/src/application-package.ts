/**
 * Synthetic-only draft export. No official SSA form is generated or filed.
 * Deliberately pure and network-free; review reports are not benefit decisions.
 */
import {FORMS,applicable,progress,type Answers,type FormId,type Program,type Rows} from "./forms";
import type {SubmissionLog} from "./ssa-submissions";
import type {SignatureReceipt} from "./signature-policy";

export type EvidenceStatus="pending"|"human_verified"|"rejected";
export type EvidenceReference={
  id:string;
  title:string;
  kind:"medical"|"employment"|"applicant_statement"|"other";
  location:string;
  note:string;
  status:EvidenceStatus;
  reviewer:string;
};
export type SyntheticRecoveryEvent={
  event:string;actor:string;reason:string;old_vault_retirement:string;
};
export type PackageInput={
  caseReference:string;
  /** Legacy synthetic v1 or restricted encrypted local v2 case. Defaults to synthetic. */
  syntheticOnly?:boolean;
  programs:Program[];
  includeDeferred:boolean;
  answers:Answers;
  rows:Rows;
  evidence:EvidenceReference[];
  submissions:SubmissionLog;
  recoveryEvents?:SyntheticRecoveryEvent[];
  signatures?:SignatureReceipt[];
};
export type QuestionSnapshot={
  key:string;ref:string;label:string;
  answer:string|null;review:"not_asked"|"reported"|"verified"|"unknown"|"clarify";
  source:string|null;linked_evidence_id:string|null;
};
export type CollectionSnapshot={
  key:string;ref:string;title:string;
  entries:{data:Record<string,string>;review:string;source:string|null;linked_evidence_id:string|null}[];
};
export type FormSnapshot={
  form_id:FormId;title:string;edition:string;official_url:string;reference_only:boolean;
  completion_claim:"NOT_ASSESSED";mapping:"PARTIAL";
  mapped_questions:number;captured_questions:number;verified_questions:number;
  sections:{id:string;title:string;page_references:string;
    questions:QuestionSnapshot[];collections:CollectionSnapshot[]}[];
};
export type DraftPackage={
  file_kind:"soar-desk-synthetic-application-draft"|"soar-desk-local-application-draft";
  schema_version:1|2;
  synthetic_only:boolean;
  disclaimer:string;
  case_reference:string;
  programs:Program[];
  generated_at:string;
  forms:FormSnapshot[];
  evidence_register:EvidenceReference[];
  source_reference_warnings:string[];
  submission_log:SubmissionLog;
  summary:{
    mapped_questions:number;captured_questions:number;verified_questions:number;
    unresolved_questions:number;unverified_evidence:number;manual_submissions:number;
    external_receipts_reported_verified:number;
    ready_for_ssa_submission:false;
  };
};
const DISCLAIMER="TRAINING DATA ONLY. Partial form mapping; not an SSA application, signature, claim receipt or authorization. No documents attached. All acknowledgments are staff-entered and unverified by SOAR Desk.";
const validId=/^SYN-[A-Za-z0-9][A-Za-z0-9_-]{0,76}$/;
const localId=/^CASE-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const evidenceId=/^SYN-EV-[A-Za-z0-9][A-Za-z0-9_-]{0,60}$/;
const localEvidenceId=/^EV-[A-Za-z0-9][A-Za-z0-9_-]{0,60}$/;
export function checkEvidence(evidence:EvidenceReference[],syntheticOnly=true):void{
  const ids=new Set<string>();
  for(const item of evidence){
    if(!(syntheticOnly?evidenceId:localEvidenceId).test(item.id))throw Error("Evidence ID has the wrong case mode prefix or invalid characters.");
    if(ids.has(item.id))throw Error("Duplicate evidence ID: "+item.id);
    ids.add(item.id);
    if(!item.title.trim())throw Error("Evidence "+item.id+" needs a descriptive title.");
    if(item.status==="human_verified"&&!item.reviewer.trim())throw Error("A human reviewer code is needed for verified evidence "+item.id);
    if(item.status==="human_verified"&&(!item.location.trim()||!item.note.trim()))
      throw Error("A verified source needs a page/location and a supporting note: "+item.id);
    if(item.status!=="human_verified"&&item.reviewer.trim())throw Error("Reviewer attribution requires human-verified status for "+item.id);
  }
}
export function buildDraftPackage(input:PackageInput,now:string=new Date().toISOString()):DraftPackage{
  const training=input.syntheticOnly!==false;
  if(!(training?validId:localId).test(input.caseReference))throw Error("Use a fictional case SYN- ID or an opaque CASE- identifier for a restricted local case.");
  if(input.programs.length===0)throw Error("Choose at least one intended benefits program.");
  if(!/^\d{4}-\d{2}-\d{2}T/.test(now)||!Number.isFinite(Date.parse(now)))throw Error("Invalid generation timestamp.");
  checkEvidence(input.evidence,training);
  const selected=FORMS.filter(form=>form.programs.some(p=>input.programs.includes(p))
    &&(form.id!=="SSA-8001-BK"||input.includeDeferred));
  const refs=new Map(input.evidence.map(e=>[e.id,e]));
  const sourceWarnings=new Set<string>();
  const linked=(source:string)=>{
    const id=source.trim();
    if(!id)return null;
    const match=refs.get(id);
    if(match){
      if(match.status!=="human_verified")
        sourceWarnings.add("Source "+id+" is "+match.status.replace("_"," ")+"; it is not verified evidence.");
      return id;
    }
    // Descriptive interview/provenance text is supported, not evidence-ID based.
    if(id.startsWith("SYN-EV-")||id.startsWith("EV-"))sourceWarnings.add("Unmatched evidence reference: "+id);
    return null;
  };
  let questions=0,captured=0,verified=0;
  const forms=selected.map((form):FormSnapshot=>{
    const p=progress(form,input.answers,input.rows);
    return {
      form_id:form.id,title:form.title,edition:form.edition,
      official_url:form.url,reference_only:!!form.referenceOnly,
      completion_claim:"NOT_ASSESSED",mapping:"PARTIAL",
      mapped_questions:p.total,captured_questions:p.captured,verified_questions:p.verified,
      sections:form.sections.map(section=>({
        id:section.id,title:section.title,page_references:section.pages,
        questions:section.questions.filter(q=>applicable(q,input.answers)).map(q=>{
          const r=input.answers[q.key];
          const value=r?.value.trim()||null;
          let review:QuestionSnapshot["review"]="not_asked";
          if(r&&(value||r.status==="unknown")) review=r.status;
          questions++;
          if(review!=="not_asked"){captured++;if(review==="verified")verified++;}
          return {
            key:q.key,ref:q.ref,label:q.label,answer:value,review,
            source:r?.source.trim()||null,
            linked_evidence_id:r?.source?linked(r.source):null
          };
        }),
        collections:(section.collections??[]).filter(c=>applicable(c,input.answers)).map(c=>({
          key:c.key,ref:c.ref,title:c.title,
          entries:(input.rows[c.key]??[]).filter(row=>Object.entries(row).some(([key,val])=>!key.startsWith("_")&&!!val?.trim())).map(row=>{
            const fields:Object=Object.fromEntries(Object.entries(row).filter(([key])=>!key.startsWith("_")));
            return {
              data:fields as Record<string,string>,review:row._status??"reported",source:row._source?.trim()||null,
              linked_evidence_id:row._source?linked(row._source):null
            };
          })
        }))
      }))
    };
  });
  const caseSubmissions:SubmissionLog={
    records:input.submissions.records.filter(r=>r.caseReference===input.caseReference),
    events:input.submissions.events.filter(e=>e.caseReference===input.caseReference)
  };
  return {
    file_kind:training?"soar-desk-synthetic-application-draft":"soar-desk-local-application-draft",
    schema_version:training?1:2,
    synthetic_only:training,
    disclaimer:training?DISCLAIMER:"UNSIGNED WORKING DRAFT ONLY. Only selected fields from the official source were mapped. Applicant must review and finish all questions, sign using an accepted SSA method, and submit separately. Contains unencrypted PII if exported as PDF.",
    case_reference:input.caseReference,programs:[...input.programs],generated_at:now,
    forms,evidence_register:input.evidence.map(e=>({...e})),
    source_reference_warnings:[...sourceWarnings].sort(),submission_log:caseSubmissions,
    summary:{
      mapped_questions:questions,captured_questions:captured,verified_questions:verified,
      unresolved_questions:questions-captured,
      unverified_evidence:input.evidence.filter(e=>e.status!=="human_verified").length,
      manual_submissions:caseSubmissions.records.filter(r=>r.submitted).length,
      external_receipts_reported_verified:caseSubmissions.records.filter(r=>r.receipt).length,
      ready_for_ssa_submission:false
    }
  };
}
