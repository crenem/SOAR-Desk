/* Protect the synthetic-vs-restricted local privacy gate shared by OCR, Laya, Qwen and attachments. */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const ts=require("typescript");
const vm=require("node:vm");
const root=path.join(__dirname,"../src");
const source=fs.readFileSync(path.join(root,"document-intake-policy.ts"),"utf8");
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const moduleExports={};
vm.runInNewContext(compiled,{exports:moduleExports});
assert.equal(JSON.stringify(moduleExports.analysisMode(true)),JSON.stringify({synthetic_confirmed:true,local_risk_acknowledged:false}));
assert.equal(JSON.stringify(moduleExports.analysisMode(false)),JSON.stringify({synthetic_confirmed:false,local_risk_acknowledged:true}));
const ui=fs.readFileSync(path.join(root,"Documents.tsx"),"utf8");
for(const command of ["extract_synthetic_document","classify_synthetic_text","extract_qwen_candidates","attach_evidence_document"]){
 const invocation=ui.split('"' + command + '"')[1];
 assert.ok(invocation,command+" invocation missing");
 assert.match(invocation.slice(0,240),/analysisMode\(syntheticOnly\)/,command+" bypasses privacy-mode gate");
}
assert.doesNotMatch(ui,/synthetic_confirmed:\s*true/,"Hard-coded synthetic mode must not be used in document intake");
console.log("Document intake privacy-mode regression checks passed.");
