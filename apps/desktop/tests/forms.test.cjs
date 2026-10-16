/* Synthetic-only regression checks for the SSA form interview registry. */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const ts=require("typescript");
const source=fs.readFileSync(path.join(__dirname,"../src/forms.ts"),"utf8");
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const out={};
vm.runInNewContext(js,{exports:out,require}, {filename:"forms.compiled.cjs"});
const {FORMS,FORM_BY_ID,applicable,progress}=out;

assert.equal(FORMS.length,7);
for(const id of ["SSA-8000-BK","SSA-3368-BK","SSA-827","SSA-3369-BK","SSA-3373-BK"]){
 const f=FORM_BY_ID[id];assert.ok(f&&!f.referenceOnly, id+" needs a real interview");
 assert.ok(f.url.startsWith("https://www.ssa.gov/forms/"));
 assert.ok(f.sections.length>=2);
}
assert.equal(FORM_BY_ID["SSA-8001-BK"].referenceOnly,true);
assert.equal(FORM_BY_ID["SSA-16"].referenceOnly,true);

const extra=FORM_BY_ID["SSA-8000-BK"].sections.find(s=>s.id==="living").questions;
const household=extra.find(q=>q.key==="living.household");
const homeless=extra.find(q=>q.key==="living.homeless");
assert.equal(applicable(household,{}),false);
assert.equal(applicable(homeless,{"living.type":{value:"transient or homeless",status:"reported",source:"synthetic interview"}}),true);
assert.equal(applicable(household,{"living.type":{value:"transient or homeless",status:"reported",source:"synthetic interview"}}),false);
assert.equal(applicable(household,{"living.type":{value:"household",status:"reported",source:""}}),true);

const disability=FORM_BY_ID["SSA-3368-BK"];
const empty=progress(disability,{},{});
assert.equal(empty.captured,0);
const submitted={"person.name":{value:"Jane Doe",status:"verified",source:"synthetic interview"}};
const one=progress(disability,submitted,{});
assert.equal(one.captured,1);
assert.equal(one.verified,1);
// A direct "no" must be preserved, and a missing entry is not the same as "no".
const workNo=progress(disability,{"work.any":{value:"no",status:"reported",source:""}},{});
assert.equal(workNo.captured,1);
const withUnknown=progress(disability,{"work.any":{value:"",status:"unknown",source:""}},{});
assert.equal(withUnknown.captured,1);
assert.ok(empty.total>=one.total);
// Shared keys deliberately use the same canonical key across several forms.
const shared=FORM_BY_ID["SSA-3369-BK"].sections.flatMap(s=>s.questions).find(q=>q.key==="person.name");
assert.ok(shared);
// Never model SSA-only receipt fields as questions or allow progress to certify submission.
assert.equal(disability.sections.some(s=>s.questions.some(q=>/receipt|ssa.only/i.test(q.key))),false);
console.log("SSA intake form registry tests passed.");
