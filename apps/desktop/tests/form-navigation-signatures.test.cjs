const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const ts=require("typescript");
function load(name,deps={}){
 const raw=fs.readFileSync(path.join(__dirname,"../src",name+".ts"),"utf8");
 const compiled=ts.transpileModule(raw,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 const exports={};
 vm.runInNewContext(compiled,{exports,require(id){if(id in deps)return deps[id];throw Error(id)},Map,Set});
 return exports;
}
const forms=load("forms");
const nav=load("form-navigation",{"./forms":forms});
const signatures=load("signature-policy");
const base=nav.formCoverage(["ssi","ssdi"],false,{},{});
assert.ok(base.length>=4);
const work=base.find(f=>f.id==="SSA-3368-BK");
assert.ok(work);
assert.ok(work.total>20);
assert.equal(work.collected,0);
const identity=work.sections.find(s=>s.id==="identity");
assert.ok(identity);
const name=identity.missing.find(t=>t.fieldId==="person.name");
assert.equal(name.formId,"SSA-3368-BK");
assert.equal(name.sectionId,"identity");
assert.equal(name.kind,"question");
const withName=nav.formCoverage(["ssi","ssdi"],false,{
 "person.name":{value:"Fictional Applicant",status:"reported",source:"training"}
},{});
assert.equal(withName.find(f=>f.id==="SSA-3368-BK").collected,1);
const unknown=nav.formCoverage(["ssi","ssdi"],false,{
 "person.name":{value:"",status:"unknown",source:""}
},{});
assert.equal(unknown.find(f=>f.id==="SSA-3368-BK").collected,1);
const clarify=nav.formCoverage(["ssi","ssdi"],false,{
 "person.name":{value:"Fictional Applicant",status:"clarify",source:""}
},{});
assert.ok(clarify.find(f=>f.id==="SSA-3368-BK").sections
 .find(s=>s.id==="identity").missing.some(t=>t.fieldId==="person.name"&&t.status==="clarify"));
const withJobs=nav.formCoverage(["ssi","ssdi"],false,{"work.any":{value:"yes",status:"reported",source:""}},
 {jobs:[{title:"Fictional retail clerk"}]});
const working=withJobs.find(f=>f.id==="SSA-3368-BK");
assert.ok(working.sections.some(s=>s.collected>=1));
assert.equal(signatures.signingGuidance("SSA-827").canCaptureInternal,true);
assert.match(signatures.signingGuidance("SSA-827").notice,/NOT a signed SSA-827/);
assert.match(signatures.signingGuidance("SSA-16").notice,/CPAS/);
const receipt={
 id:"SIG-test",formId:"SSA-16",caseReference:"SYN-EXAMPLE",
 signerName:"Fictional Signer",signerRole:"claimant",method:"typed",
 typedName:"Fictional Signer",disclosure:signatures.SIGNER_STATEMENT,
 intentAccepted:true,signedAt:"2026-10-16T17:00:00Z",
 documentSha256:"a".repeat(64),status:"internal_intent_capture_only"
};
assert.equal(signatures.validReceipt(receipt),true);
assert.equal(signatures.signatureIsCurrent(receipt,"SSA-16","SYN-EXAMPLE","a".repeat(64)),true);
assert.equal(signatures.signatureIsCurrent(receipt,"SSA-16","SYN-EXAMPLE","b".repeat(64)),false);
assert.equal(signatures.validReceipt({...receipt,disclosure:"No informed intent"}),false);
console.log("Progress navigation and document-bound internal signature policies passed.");
