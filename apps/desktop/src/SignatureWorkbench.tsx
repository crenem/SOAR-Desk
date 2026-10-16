import {useEffect,useMemo,useRef,useState} from "react";
import type {Answers,FormId,Rows} from "./forms";
import {signingGuidance,SIGNER_STATEMENT,signatureIsCurrent,
  type SignatureMethod,type SignatureReceipt,type SignerRole,type Stroke} from "./signature-policy";

type Props={
 formId:FormId;caseReference:string;answers:Answers;rows:Rows;
 receipts:SignatureReceipt[];onChange:(next:SignatureReceipt[])=>void;
};
const hex=(bytes:ArrayBuffer)=>Array.from(new Uint8Array(bytes)).map(v=>v.toString(16).padStart(2,"0")).join("");
async function digestForm(formId:FormId,caseReference:string,answers:Answers,rows:Rows):Promise<string>{
 // Bind the receipt to the exact snapshot reviewed by the signer, not just a
 // mutable name. This is a document fingerprint, NOT signer authentication.
 const value=JSON.stringify({schema:1,caseReference,formId,answers,rows});
 return hex(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)));
}
function draw(ctx:CanvasRenderingContext2D,strokes:Stroke[],width:number,height:number){
 ctx.clearRect(0,0,width,height);ctx.strokeStyle="#102e46";ctx.lineWidth=2.4;ctx.lineCap="round";ctx.lineJoin="round";
 for(const line of strokes){
  if(line.points.length<2)continue;
  ctx.beginPath();line.points.forEach((p,i)=>{
   if(i===0)ctx.moveTo(p.x*width,p.y*height);else ctx.lineTo(p.x*width,p.y*height);
  });ctx.stroke();
 }
}
export default function SignatureWorkbench({formId,caseReference,answers,rows,receipts,onChange}:Props){
 const policy=signingGuidance(formId);
 const [method,setMethod]=useState<SignatureMethod>("drawn");
 const [name,setName]=useState("");
 const [role,setRole]=useState<SignerRole>("claimant");
 const [typed,setTyped]=useState("");
 const [reviewed,setReviewed]=useState(false);
 const [accepted,setAccepted]=useState(false);
 const [strokes,setStrokes]=useState<Stroke[]>([]);
 const [hash,setHash]=useState("");
 const [error,setError]=useState("");
 const canvas=useRef<HTMLCanvasElement|null>(null);
 const pointer=useRef<number|null>(null);
 const digestInputs=useMemo(()=>JSON.stringify({formId,caseReference,answers,rows}),[formId,caseReference,answers,rows]);
 useEffect(()=>{
  let live=true;
  void digestForm(formId,caseReference,answers,rows)
    .then(v=>{if(live)setHash(v)})
    .catch(()=>{if(live)setError("Cannot compute a document-bound fingerprint in this environment.")});
  return ()=>{live=false;};
 },[digestInputs]);
 useEffect(()=>{
  const cvs=canvas.current;if(!cvs)return;
  const rect=cvs.getBoundingClientRect();
  const width=Math.max(1,Math.round(rect.width||640));
  const height=170;
  const dpr=window.devicePixelRatio||1;
  cvs.width=width*dpr;cvs.height=height*dpr;
  const ctx=cvs.getContext("2d");if(!ctx)return;
  ctx.setTransform(dpr,0,0,dpr,0,0);
  draw(ctx,strokes,width,height);
 },[strokes,method]);
 const selected=receipts.filter(r=>r.formId===formId);
 const active=selected.filter(r=>signatureIsCurrent(r,formId,caseReference,hash));
 const stale=selected.length-active.length;
 function normalizedPoint(e:React.PointerEvent<HTMLCanvasElement>){
  const r=e.currentTarget.getBoundingClientRect();
  return {x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),
    y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))};
 }
 function start(e:React.PointerEvent<HTMLCanvasElement>){
  if(e.button!==0&&e.pointerType==="mouse")return;
  e.currentTarget.setPointerCapture(e.pointerId);
  pointer.current=e.pointerId;
  setStrokes(old=>[...old,{points:[normalizedPoint(e)]}]);
 }
 function move(e:React.PointerEvent<HTMLCanvasElement>){
  if(pointer.current!==e.pointerId)return;
  const point=normalizedPoint(e);
  setStrokes(old=>old.map((v,i)=>i===old.length-1?{points:[...v.points,point]}:v));
 }
 function stop(e:React.PointerEvent<HTMLCanvasElement>){
  if(pointer.current!==e.pointerId)return;
  pointer.current=null;
  if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
 }
 function capture(){
  setError("");
  if(!hash||!reviewed||!accepted||name.trim().length<2){
   setError("Enter the signer's name, complete review, and affirm intention before capture.");return;
  }
  if(method==="typed"&&typed.trim()!==name.trim()){
   setError("The typed signature must match the signer's identified name.");return;
  }
  if(method==="drawn"&&!strokes.some(s=>s.points.length>=2)){
   setError("Draw a signature or mark in the signature area first.");return;
  }
  const receipt:SignatureReceipt={
   id:"SIG-"+crypto.randomUUID(),formId,caseReference,
   signerName:name.trim(),signerRole:role,method,
   ...(method==="drawn"?{strokes}:{typedName:typed.trim()}),
   disclosure:SIGNER_STATEMENT,intentAccepted:true,signedAt:new Date().toISOString(),
   documentSha256:hash,status:"internal_intent_capture_only"
  };
  onChange([...receipts,receipt]);
  setReviewed(false);setAccepted(false);setStrokes([]);setTyped("");
 }
 return <section className="panel signature-workbench">
  <div className="eyebrow">CLIENT ACKNOWLEDGMENT · DEVELOPMENT WORKFLOW</div>
  <h2>Signature capture and review</h2>
  <p className="signature-warning"><strong>{policy.title}.</strong> {policy.notice}</p>
  <p className="hint">{policy.externalRoute} This tool does not place captured marks onto official SSA forms or transmit a signature to SSA.</p>
  <div className="fieldgrid">
   <label>Form to acknowledge<input value={formId} disabled/></label>
   <label>Identified signer<input value={name} onChange={e=>setName(e.target.value)} placeholder="The person physically signing"/></label>
  </div>
  <label>Authority or relationship<select value={role} onChange={e=>setRole(e.target.value as SignerRole)}>
    <option value="claimant">Claimant / proper applicant</option>
    <option value="authorized_guardian">Legally authorized guardian</option>
    <option value="other_authorized_applicant">Other authorized proper applicant (verify authority)</option>
  </select></label>
  <div className="intake-tabs" role="group" aria-label="Signature capture method">
   <button type="button" className={method==="drawn"?"active":""} onClick={()=>setMethod("drawn")}>Draw a mark</button>
   <button type="button" className={method==="typed"?"active":""} onClick={()=>setMethod("typed")}>Type a name</button>
  </div>
  {method==="drawn"?<div className="signature-pad">
    <canvas ref={canvas} aria-label="Signature drawing area" role="img"
      onPointerDown={start} onPointerMove={move} onPointerUp={stop}
      onPointerCancel={stop} onLostPointerCapture={()=>{pointer.current=null;}}/>
    <button type="button" className="secondary" onClick={()=>setStrokes([])}>Clear drawing</button>
    <p className="hint">Use a mouse, touch, or stylus. A drawn mark is only an internal record until accepted by the relevant filing process.</p>
  </div>:
  <label>Typed name as signature<input value={typed} onChange={e=>setTyped(e.target.value)} placeholder="Type the full signer name"/></label>}
  <p className="signature-statement">{SIGNER_STATEMENT}</p>
  <label className="checkline"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>The signer was given the opportunity to review this form's information.</label>
  <label className="checkline"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/>The identified signer deliberately adopts this mark/name as their own acknowledgment.</label>
  <button className="primary" type="button" onClick={capture}>Capture internal acknowledgment</button>
  {error&&<p role="alert" className="error">{error}</p>}
  <div className="signature-receipts">
   <h3>Recorded acknowledgments for {formId}</h3>
   <p className="hint">Each record is bound to a SHA-256 fingerprint of the reviewed case snapshot. Editing case details makes prior receipts stale; there is no automatic signature reuse.</p>
   {active.length===0?<p className="muted">No current acknowledgment captured.</p>:active.map(r=>
    <div key={r.id} className="signature-receipt">
      <strong>{r.signerName}</strong> · {r.method} · {new Date(r.signedAt).toLocaleString()}
      <small>Internal acknowledgment only · Fingerprint {r.documentSha256.slice(0,14)}…</small>
    </div>)}
   {stale>0&&<p className="field-warning">{stale} acknowledgment(s) need renewed review because case content or selected form has changed.</p>}
  </div>
 </section>;
}
