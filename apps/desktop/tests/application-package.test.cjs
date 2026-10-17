/* Synthetic-only, network-free application package crosswalk and source-link tests */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const ts=require("typescript");
function transpile(rel,dep={}){
 const source=fs.readFileSync(path.join(__dirname,"../src",rel),"utf8");
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 const exports={};
 vm.runInNewContext(compiled,{exports,require:(name)=>{if(!(name in dep))throw Error("Unexpected dependency "+name);return dep[name]},Date,Map,Set,Error,Object}, {filename:rel});
 return exports;
}
const forms=transpile("forms.ts");
const pkg=transpile("application-package.ts",{"./forms":forms});
const observed={value:"Jane Doe",status:"reported",source:"SYN-EV-0001"};
const input={
 caseReference:"SYN-JANE-001",programs:["ssi","ssdi"],includeDeferred:false,
 answers:{
  "person.name":observed,
  "living.type":{value:"transient or homeless",status:"reported",source:"Fictional applicant interview"},
  "living.homeless":{value:"Sleeping outside; not assigned a house address",status:"reported",source:"SYN-EV-DOES-NOT-EXIST"},
  "living.household":{value:"A stale nonapplicable household answer",status:"reported",source:""},
  "work.any":{value:"no",status:"reported",source:""},
  "ssdi.vision":{value:"",status:"unknown",source:""},
 },
 rows:{conditions:[{condition:"Fictional back pain",details:"Reported only",_status:"reported",_source:"SYN-EV-0001"}]},
 evidence:[{id:"SYN-EV-0001",title:"Synthetic interview note",kind:"applicant_statement",location:"Page 1",
  note:"Reported by claimant, not a medical finding",status:"human_verified",reviewer:"SYN-REVIEWER"}],
 submissions:{records:[],events:[]}
};
const result=pkg.buildDraftPackage(input,"2026-10-16T13:00:00.000Z");
assert.equal(result.synthetic_only,true);
assert.equal(result.summary.ready_for_ssa_submission,false);
assert.equal(result.summary.external_receipts_reported_verified,0);
assert.equal(result.case_reference,"SYN-JANE-001");
assert.equal(result.forms.some(f=>f.form_id==="SSA-8001-BK"),false);
const ssi=result.forms.find(f=>f.form_id==="SSA-8000-BK");
const living=ssi.sections.find(s=>s.id==="living").questions;
assert.ok(living.some(q=>q.key==="living.homeless"));
assert.ok(!living.some(q=>q.key==="living.household"));
assert.ok(!JSON.stringify(result).includes("A stale nonapplicable household answer"));
const named=result.forms.find(f=>f.form_id==="SSA-16").sections[0].questions.find(q=>q.key==="person.name");
assert.equal(named.answer,"Jane Doe");
assert.equal(named.linked_evidence_id,"SYN-EV-0001");
assert.equal(named.review,"reported");
assert.ok(result.source_reference_warnings.some(s=>s.includes("SYN-EV-DOES-NOT-EXIST")));
assert.ok(result.forms.some(f=>f.form_id==="SSA-16"));
assert.ok(result.forms.some(f=>f.form_id==="SSA-827"));
const ssdi=result.forms.find(f=>f.form_id==="SSA-16");
assert.equal(ssdi.sections.flatMap(s=>s.questions).find(q=>q.key==="ssdi.vision").review,"unknown");
assert.ok(result.summary.unresolved_questions>0);
assert.throws(()=>pkg.buildDraftPackage({...input,caseReference:"LIVE-CASE-1"}),/fictional case/);
assert.throws(()=>pkg.buildDraftPackage({...input,evidence:[{...input.evidence[0],reviewer:""}]}),/reviewer code/);
assert.throws(()=>pkg.buildDraftPackage({...input,evidence:[input.evidence[0],input.evidence[0]]}),/Duplicate evidence/);
assert.throws(()=>pkg.buildDraftPackage({...input,evidence:[{...input.evidence[0],location:""}]}),/page\/location/);
const unreviewed=pkg.buildDraftPackage({...input,evidence:[{...input.evidence[0],status:"pending",reviewer:""}]});
assert.ok(unreviewed.source_reference_warnings.some(w=>w.includes("not verified evidence")));
assert.ok(pkg.buildDraftPackage({...input,includeDeferred:true}).forms.some(f=>f.form_id==="SSA-8001-BK"));
const activity={
 records:[{id:"SYN-PKT-1",caseReference:"SYN-JANE-001",purpose:"disability_evidence",destination:"dds",channel:"ere_portal",
    description:"Fictional evidence",documentRefs:["SSA-827"],createdBy:"SYN-STAFF",notes:"",
    submitted:{submittedOn:"2026-10-16",reportedBy:"SYN-STAFF",evidenceNote:"Fictional upload"}}],
 events:[{type:"packet_prepared",caseReference:"SYN-JANE-001",packetId:"SYN-PKT-1",actor:"SYN-STAFF"}]
};
const withLog=pkg.buildDraftPackage({...input,submissions:activity});
assert.equal(withLog.summary.manual_submissions,1);
assert.equal(withLog.summary.external_receipts_reported_verified,0);
assert.ok(!withLog.submission_log.records[0].receipt);
const humanDocumentReview={
 outcome:"NeedsMoreEvidence",
 reviewerId:"SYN-REVIEWER",
 rationale:"Fictional source needs confirmation against the original scan.",
 recordedAt:"2026-10-16T21:00:00.000Z",
 documentSha256:"a".repeat(64)
};
const withDocumentReview=pkg.buildDraftPackage({...input,
 evidence:[{...input.evidence[0],blobId:"b".repeat(32),sha256:"a".repeat(64),bytes:256,originalFilename:"fictional-test.pdf",documentReview:humanDocumentReview}]
});
assert.equal(withDocumentReview.evidence_register[0].documentReview.outcome,"NeedsMoreEvidence");
assert.equal(withDocumentReview.evidence_register[0].documentReview.documentSha256,"a".repeat(64));
assert.equal(withDocumentReview.summary.ready_for_ssa_submission,false);
assert.throws(()=>pkg.buildDraftPackage({...input,
 evidence:[{...input.evidence[0],blobId:"b".repeat(32),sha256:"c".repeat(64),
 bytes:256,documentReview:humanDocumentReview}]}),/another source/);

console.log("Synthetic draft package and evidence crosswalk tests passed.");
