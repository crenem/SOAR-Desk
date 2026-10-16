/**
 * SSA submission integration boundary — synthetic-only, local-first pilot.
 *
 * No network transport is implemented here. Submission state is a human-authored
 * case log, NOT a statement from SSA or an SSA-generated claim identifier.
 */
export type Purpose = "initial_application" | "disability_evidence" | "other_documents" | "appeal";
export type Channel = "ssa_online" | "ssa_field_office" | "postal_mail" | "fax" | "ere_portal" | "ars_portal" | "other";
export type SubmissionState = "prepared" | "reported_submitted" | "receipt_verified";
export type Destination = "ssa" | "dds" | "other";

export type Packet = {
  id: string; caseReference: string; purpose: Purpose; destination: Destination;
  channel: Channel; description: string; documentRefs: string[];
  createdBy: string; notes: string;
};
export type ManualSubmission = { submittedOn: string; reportedBy: string; attested: boolean; evidenceNote: string };
export type OfficialReceipt = { receiptOn: string; reference: string; verifiedBy: string; evidenceSource: string };
export type SubmissionRecord = Packet & { submitted?: Omit<ManualSubmission,"attested">; receipt?: OfficialReceipt };
export type SubmissionEvent =
  | { type: "packet_prepared"; caseReference: string; packetId: string; actor: string }
  | { type: "manual_submission_reported"; caseReference: string; packetId: string; actor: string; on: string }
  | { type: "external_receipt_verified"; caseReference: string; packetId: string; actor: string; on: string; reference: string };
export type SubmissionLog = { records: SubmissionRecord[]; events: SubmissionEvent[] };

export type SubmissionAdapter = {
  id: string;
  label: string;
  availability: "active_manual" | "not_connected";
  capabilities: readonly Purpose[];
  // A future authorized transport must implement its own authenticated network
  // boundary, explicit consents, SSA contract and audit. No send() API is exposed
  // in this local-only build, intentionally.
};
export const ADAPTERS: readonly SubmissionAdapter[] = [
  { id:"manual", label:"Human-reported filing and receipt log", availability:"active_manual",
    capabilities:["initial_application","disability_evidence","other_documents","appeal"] },
  { id:"erews", label:"Electronic Records Express Web Services (subject to SSA agreement)", availability:"not_connected",
    capabilities:["disability_evidence","other_documents"] },
  { id:"ars", label:"Appointed Representative Services (authorized representative access)", availability:"not_connected",
    capabilities:["disability_evidence","other_documents","appeal"] },
] as const;
export const CHANNELS: Record<Channel,string> = {
  ssa_online:"SSA online application (manual)",
  ssa_field_office:"SSA field office — in person",
  postal_mail:"Postal mail",
  fax:"Fax — only if SSA directed",
  ere_portal:"Electronic Records Express portal (manual)",
  ars_portal:"Appointed Representative Services portal (manual)",
  other:"Other documented method"
};
export const PURPOSES: Record<Purpose,string> = {
  initial_application:"Initial SSI/SSDI claim",
  disability_evidence:"Disability / medical evidence",
  other_documents:"Other supporting documents",
  appeal:"Appeal materials"
};
export const DESTINATIONS:Record<Destination,string> = {ssa:"Social Security Administration",dds:"Disability Determination Services",other:"Other authorized recipient"};
export const OFFICIAL_RESOURCES=[
  {name:"SSA Electronic Records Express",url:"https://www.ssa.gov/ere/"},
  {name:"SSA Appointed Representative Services",url:"https://www.ssa.gov/ar/"},
  {name:"SSA disability applications",url:"https://www.ssa.gov/benefits/disability/"},
  {name:"SSA open data (aggregate only)",url:"https://www.ssa.gov/data/"},
] as const;

function nonEmpty(value:string, label:string):string{
  if(!value || !value.trim())throw new Error(label+" is required.");
  if(value.length>600)throw new Error(label+" is too long.");
  return value.trim();
}
function isoDate(value:string,label:string):string{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Error(label+" must be YYYY-MM-DD.");
  const d=new Date(value+"T00:00:00Z");
  if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==value)throw new Error(label+" is not a valid calendar date.");
  return value;
}
export function validateRouting(packet:Pick<Packet,"purpose"|"channel"|"destination">):void{
  if(packet.purpose==="initial_application" && (packet.channel==="ere_portal" || packet.channel==="ars_portal")){
    throw new Error("ERE and ARS evidence-upload portals must not be recorded as filing an initial SSI/SSDI application.");
  }
  if(packet.channel==="ere_portal"&&packet.destination==="other")throw new Error("ERE evidence uploads require an SSA/DDS destination.");
  if(packet.channel==="ars_portal"&&packet.destination!=="ssa")throw new Error("ARS is recorded as an SSA representative portal.");
}
export function stateOf(record:SubmissionRecord):SubmissionState{
  if(record.receipt)return "receipt_verified";
  if(record.submitted)return "reported_submitted";
  return "prepared";
}
export function preparePacket(log:SubmissionLog,packet:Packet):SubmissionLog{
  nonEmpty(packet.caseReference,"Synthetic case reference");
  if(!packet.caseReference.startsWith("SYN-"))throw new Error("Only explicitly synthetic case references are allowed in this development preview.");
  nonEmpty(packet.id,"Local packet identifier");
  nonEmpty(packet.description,"Packet description");
  nonEmpty(packet.createdBy,"Preparer code");
  if(!packet.documentRefs.length || packet.documentRefs.some(ref=>!ref.trim()))throw new Error("List at least one document/form reference.");
  if(log.records.some(r=>r.id===packet.id))throw new Error("Local packet identifier already exists.");
  validateRouting(packet);
  const clean={...packet,description:packet.description.trim(),createdBy:packet.createdBy.trim(),
    documentRefs:packet.documentRefs.map(v=>nonEmpty(v,"Document reference"))};
  return {records:[...log.records,clean],events:[...log.events,{type:"packet_prepared",caseReference:packet.caseReference,packetId:packet.id,actor:packet.createdBy}]};
}
export function reportManualSubmission(log:SubmissionLog,packetId:string,claim:ManualSubmission):SubmissionLog{
  const rec=log.records.find(r=>r.id===packetId);
  if(!rec)throw new Error("Packet not found.");
  if(rec.submitted)throw new Error("A submission has already been recorded for this packet.");
  if(!claim.attested)throw new Error("A human must explicitly confirm the external submission actually occurred.");
  const submittedOn=isoDate(claim.submittedOn,"Submission date");
  const reportedBy=nonEmpty(claim.reportedBy,"Person recording the submission");
  nonEmpty(claim.evidenceNote,"How submission was performed/observed");
  if(rec.purpose==="initial_application" && (rec.channel==="ere_portal"||rec.channel==="ars_portal")){
    throw new Error("An evidence portal cannot be used to record initial application filing.");
  }
  return {
    records:log.records.map(r=>r.id===packetId?{...r,submitted:{submittedOn,reportedBy,evidenceNote:claim.evidenceNote.trim()}}:r),
    events:[...log.events,{type:"manual_submission_reported",caseReference:rec.caseReference,packetId,actor:reportedBy,on:submittedOn}]
  };
}
export function verifyExternalReceipt(log:SubmissionLog,packetId:string,receipt:OfficialReceipt):SubmissionLog{
  const rec=log.records.find(r=>r.id===packetId);
  if(!rec)throw new Error("Packet not found.");
  if(!rec.submitted)throw new Error("Record an actual submission before verifying an external receipt.");
  if(rec.receipt)throw new Error("Receipt is already recorded; do not silently overwrite verified acknowledgments.");
  const receiptOn=isoDate(receipt.receiptOn,"Acknowledgment date");
  const reference=nonEmpty(receipt.reference,"External SSA/DDS acknowledgment identifier");
  const verifiedBy=nonEmpty(receipt.verifiedBy,"Reviewer code");
  const evidenceSource=nonEmpty(receipt.evidenceSource,"Where the acknowledgment was checked");
  if(receiptOn<rec.submitted.submittedOn)throw new Error("Acknowledgment date cannot precede the reported submission date.");
  return {
    records:log.records.map(r=>r.id===packetId?{...r,receipt:{receiptOn,reference,verifiedBy,evidenceSource}}:r),
    events:[...log.events,{type:"external_receipt_verified",caseReference:rec.caseReference,packetId,actor:verifiedBy,on:receiptOn,reference}]
  };
}
export const EMPTY_LOG:SubmissionLog={records:[],events:[]};
// Preparation/receipt functions don't make any network calls, generate
// official acknowledgment numbers or set claim eligibility/status.
