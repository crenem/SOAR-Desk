import type {EvidenceReference} from "./application-package";
/** Metadata returned by the native, authenticated encrypted-blob writer.
 * The original document bytes never transit through the React case state. */
export type AttachedSource={
 blob_id:string;
 original_name:string;
 bytes:number;
 sha256:string;
 encrypted_path:string;
};

/** Source inventory comes from the currently unlocked native case, after
 * authenticated decryption. Recovery never auto-verifies an evidentiary claim. */
export type EncryptedOriginalInventory={
 blob_id:string;sha256:string;bytes:number;extension:string;
};
export function unregisteredEvidenceReferences(
  current:EvidenceReference[],inventory:EncryptedOriginalInventory[],syntheticOnly:boolean
):EvidenceReference[]{
 const known=new Set(current.map(item=>item.blobId).filter(Boolean));
 const prefix=syntheticOnly?"SYN-EV-":"EV-";
 let next=Math.max(0,...current.map(item=>{
   const match=item.id.slice(prefix.length);
   return item.id.startsWith(prefix)&&/^\d+$/.test(match)?Number(match):0;
 }))+1;
 const additional:EvidenceReference[]=[];
 for(const item of inventory){
   if(!/^[0-9a-f]{32}$/i.test(item.blob_id)||
      !/^[0-9a-f]{64}$/i.test(item.sha256)||
      !Number.isSafeInteger(item.bytes)||item.bytes<=0||item.bytes>20*1024*1024||
      !["pdf","png","jpg","jpeg","tif","tiff","txt"].includes(item.extension)){
     throw Error("Invalid authenticated evidence inventory entry.");
   }
   if(known.has(item.blob_id))continue;
   known.add(item.blob_id);
   additional.push({
     id:prefix+String(next++).padStart(4,"0"),
     title:"Recovered encrypted original (filename unknown)",
     kind:"other",status:"pending",location:"",
     note:"Recovered from the authenticated encrypted case directory. Original filename and clinical relevance must be checked manually.",
     reviewer:"",blobId:item.blob_id,sha256:item.sha256,bytes:item.bytes,
     originalFilename:"recovered-"+item.blob_id.slice(0,12)+"."+item.extension
   });
 }
 return additional;
}
