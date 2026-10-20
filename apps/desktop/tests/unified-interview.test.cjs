/* Crosswalk regression: a canonical answer is asked once across forms. */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const ts=require("typescript");
function load(file,requireOverride){
 const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,"../src",file),"utf8"),
   {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 const out={};
 vm.runInNewContext(code,{exports:out,require:requireOverride||require});
 return out;
}
const forms=load("forms.ts");
const unified=load("unified-interview.ts",id=>{assert.equal(id,"./forms");return forms;});
const selected=forms.FORMS.filter(f=>f.id!=="SSA-8001-BK");
const index=unified.buildUnifiedInterview(selected);
assert.ok(index.questionCount>40);
assert.ok(index.repeatedQuestionOccurrences>0,"Multiple SSA forms must share canonical fields");
assert.ok(index.domains.length>=7);
const names=index.domains.flatMap(d=>d.questions.filter(q=>q.key==="person.name"));
assert.equal(names.length,1,"Ask applicant name once");
assert.ok(names[0].references.some(ref=>ref.includes("SSA-16")));
assert.ok(names[0].references.some(ref=>ref.includes("SSA-3368")));
const counts=unified.unifiedProgress(index,{}, {});
assert.equal(counts.answered,0);
const response=unified.unifiedProgress(index,{
 "person.name":{value:"Fictional Person",status:"reported",source:"interview"}
},{});
assert.equal(response.answered,1);
assert.ok(response.remaining<counts.remaining);
assert.equal(unified.buildUnifiedInterview([forms.FORM_BY_ID["SSA-8001-BK"]]).questionCount,0,
 "Reference-only forms cannot claim complete interview mapping");
console.log("Canonical interview crosswalk tests passed.");
