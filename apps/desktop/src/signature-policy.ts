/** Electronic intent-capture records and per-form acceptance boundary.
 * Not a digital certificate, SSA click-to-sign, CPAS approval or attestation. */
import type {FormId} from "./forms";

export type SignerRole = "claimant"|"authorized_guardian"|"other_authorized_applicant";
export type SignatureMethod = "drawn"|"typed";
export type Stroke = {points:{x:number;y:number}[]};
export type SignatureReceipt={
 id:string;
 formId:FormId;
 caseReference:string;
 signerName:string;
 signerRole:SignerRole;
 method:SignatureMethod;
 typedName?:string;
 strokes?:Stroke[];
 disclosure:string;
 intentAccepted:true;
 signedAt:string;
 documentSha256:string;
 // SOAR Desk never asserts that it is an SSA signing system.
 status:"internal_intent_capture_only";
};
export type SigningGuidance={
 title:string;notice:string;externalRoute:string;canCaptureInternal:boolean;
};
export const SIGNER_STATEMENT =
 "I have reviewed the information presented for the selected form, and I intend to sign or acknowledge that specific record. I understand this SOAR Desk capture does not itself submit or electronically sign a form with the Social Security Administration.";
export function signingGuidance(formId:FormId):SigningGuidance{
 if(formId==="SSA-827")return {
  title:"SSA-827 requires an SSA-recognized signing procedure",
  notice:"SSA accepts pen-and-ink or its own internet click-and-sign / eligible SSA or DDS attestation procedures. This local capture is NOT a signed SSA-827 and must not be pasted onto the federal authorization.",
  externalRoute:"Use SSA's permitted electronic process when eligible, or obtain a dated pen-and-ink signature.",
  canCaptureInternal:true
 };
 if(formId==="SSA-16"||formId==="SSA-8000-BK"||formId==="SSA-8001-BK")return {
  title:"Benefit application signature method depends on filing channel",
  notice:"SSA may accept wet signatures, attestation, click-and-sign, Upload Documents e-signature, or qualifying CPAS. SOAR Desk is not an SSA e-sign platform and has not established CPAS acceptance.",
  externalRoute:"Apply the signature using the SSA-approved filing channel or collect a dated wet signature as applicable.",
  canCaptureInternal:true
 };
 return {
  title:"No general SSA acceptance of local signatures established for this form",
  notice:"A drawn or typed mark in SOAR Desk is a record of the person's intent only. Review the current form-specific SSA policy before submission.",
  externalRoute:"Use the form-specific SSA accepted signature method. Keep this unsigned training draft separate.",
  canCaptureInternal:true
 };
}
export function signatureIsCurrent(
 receipt:SignatureReceipt,formId:FormId,caseReference:string,digest:string
):boolean{
 return receipt.formId===formId&&receipt.caseReference===caseReference
     &&receipt.documentSha256===digest;
}
export function validReceipt(receipt:SignatureReceipt):boolean{
 return receipt.id.startsWith("SIG-")&&receipt.signerName.trim().length>1
   &&receipt.documentSha256.length===64
   &&receipt.disclosure===SIGNER_STATEMENT
   &&receipt.intentAccepted===true&&receipt.status==="internal_intent_capture_only"
   &&(receipt.method==="typed"?receipt.typedName?.trim()===receipt.signerName.trim():
       !!receipt.strokes?.some(s=>s.points.length>=2));
}
