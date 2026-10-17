/* Synthetic-only tests for re-indexing authenticated case originals. */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const ts=require("typescript");
const source=fs.readFileSync(path.join(__dirname,"../src/evidence-attachment.ts"),"utf8");
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const output={};
vm.runInNewContext(compiled,{exports:output,Set,Math,Number,String,Error});
const seed=[{id:"SYN-EV-0003",blobId:"a".repeat(32)}];
const original={blob_id:"b".repeat(32),sha256:"c".repeat(64),bytes:1024,extension:"pdf"};
const found=output.unregisteredEvidenceReferences(seed,[
 {blob_id:"a".repeat(32),sha256:"d".repeat(64),bytes:900,extension:"pdf"},
 original,original
],true);
assert.equal(found.length,1);
assert.equal(found[0].id,"SYN-EV-0004");
assert.equal(found[0].status,"pending");
assert.equal(found[0].reviewer,"");
assert.equal(found[0].sha256,"c".repeat(64));
assert.equal(found[0].originalFilename,"recovered-"+ "b".repeat(12) + ".pdf");
const local=output.unregisteredEvidenceReferences([],[original],false);
assert.equal(local[0].id,"EV-0001");
assert.throws(()=>output.unregisteredEvidenceReferences([],[{...original,sha256:"bad"}],true),/Invalid authenticated/);
assert.throws(()=>output.unregisteredEvidenceReferences([],[{...original,extension:"exe"}],true),/Invalid authenticated/);
assert.throws(()=>output.unregisteredEvidenceReferences([],[{...original,bytes:0}],true),/Invalid authenticated/);
console.log("Encrypted-original reconciliation and pending-review safeguards passed.");
