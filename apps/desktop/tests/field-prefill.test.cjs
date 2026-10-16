/* Synthetic-only format and provenance-linked prefill regression tests. */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const ts=require("typescript");
function mod(name,dependencies={}){
 const file=fs.readFileSync(path.join(__dirname,"../src",name+".ts"),"utf8");
 const compiled=ts.transpileModule(file,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 const exports={};
 vm.runInNewContext(compiled,{exports,require:id=>{
  if(id in dependencies)return dependencies[id];
  throw Error("Unexpected import "+id);
 },Date,Map,Set}, {filename:name});
 return exports;
}
const format=mod("field-format");
const metadata=mod("metadata");
const prefill=mod("document-prefill",{"./field-format":format});
assert.equal(format.inputMask("ssn","123456789"),"123-45-6789");
assert.equal(format.inputMask("phone","3185551234"),"(318) 555-1234");
assert.equal(format.inputMask("phone","No reliable telephone"),"No reliable telephone");
assert.equal(format.normalizeOnBlur("height","5' 11\""),"5 ft 11 in");
assert.equal(format.normalizeOnBlur("height","71 in"),"5 ft 11 in");
assert.equal(format.normalizeOnBlur("weight","180lbs"),"180 lb");
assert.equal(format.normalizeOnBlur("weight","82 kg"),"82 kg");
assert.equal(format.normalizeOnBlur("date","01022024"),"01/02/2024");
assert.match(format.validateDisplay("ssn","12345"),/nine digits/);
assert.match(format.validateDisplay("date","02/30/2024"),/real date/);
assert.equal(format.validateDisplay("date","02/29/2024"),null);
const source=[
 {page:1,text:[
 "Patient name: Jane Example",
 "DOB: 01/02/1980",
 "SSN: 123-45-6789",
 "Phone: (318) 555-1234",
 "Height: 5' 11\"",
 "Weight: 180 lbs"
 ].join("\n")}
];
const parsed=metadata.extractMetadata(source);
assert.equal(parsed.filter(v=>v.category==="Patient").length,6);
const sha="d".repeat(64);
const none=prefill.reviewedSuggestions(parsed,sha,"SYN-EXAMPLE");
assert.equal(none.length,0);
const reviewed=parsed.map(v=>({...v,status:"HumanVerified"}));
const ready=prefill.reviewedSuggestions(reviewed,sha,"SYN-EXAMPLE");
assert.equal(ready.length,6);
assert.equal(ready.find(v=>v.key==="medical.height").value,"5 ft 11 in");
assert.equal(ready.find(v=>v.key==="person.ssn").value,"123-45-6789");
assert.equal(ready.find(v=>v.key==="person.phone").value,"(318) 555-1234");
assert.ok(ready.every(v=>v.source.includes(sha)&&v.source.includes("page 1")));
assert.equal(prefill.reviewedSuggestions(reviewed,sha,"REAL-CASE").length,0);
const conflicts=[...reviewed,{...reviewed[0],id:"M-999",value:"Different Person"}];
assert.ok(!prefill.reviewedSuggestions(conflicts,sha,"SYN-EXAMPLE").some(v=>v.key==="person.name"));
const rejected=reviewed.map(v=>v.field==="Social Security number"?{...v,status:"Rejected"}:v);
assert.ok(!prefill.reviewedSuggestions(rejected,sha,"SYN-EXAMPLE").some(v=>v.key==="person.ssn"));
console.log("Formatting and human-reviewed document prefill checks passed.");
