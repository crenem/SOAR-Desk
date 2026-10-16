/** Input display/validation only. Do NOT derive disability or identity from patterns. */
export type FormatKind="ssn"|"phone"|"height"|"weight"|"date"|"month"|"text";
export function kindFor(key:string,declared:string="text"):FormatKind{
 if(key==="person.ssn"||/\.ssn$/i.test(key))return "ssn";
 if(key==="person.phone"||key==="phone"||key==="contacts.phone"||key==="providers.phone")return "phone";
 if(key==="medical.height")return "height";
 if(key==="medical.weight")return "weight";
 return declared==="date"?"date":declared==="month"?"month":"text";
}
const digits=(v:string)=>v.replace(/\D/g,"");
export function inputMask(kind:FormatKind,value:string):string{
 if(kind==="ssn"){
   const d=digits(value).slice(0,9);
   return d.length>5?`${d.slice(0,3)}-${d.slice(3,5)}-${d.slice(5)}`
    :d.length>3?`${d.slice(0,3)}-${d.slice(3)}`:d;
 }
 if(kind==="phone"){
   // A phone field may legitimately contain "no telephone" or an
   // international number. Do not coerce that into a fake US number.
   if(/[A-Za-z]/.test(value)&&!/\b(?:ext|extension|x)\b/i.test(value))return value;
   if(value.trim().startsWith("+")||digits(value).length>11)return value;
   const d=digits(value);
   const ten=d.length===11&&d[0]==="1"?d.slice(1):d;
   if(ten.length>10)return value;
   if(ten.length>6)return `(${ten.slice(0,3)}) ${ten.slice(3,6)}-${ten.slice(6)}`;
   if(ten.length>3)return `(${ten.slice(0,3)}) ${ten.slice(3)}`;
   return ten.length===3?`(${ten})`:ten;
 }
 return value;
}
export function normalizeOnBlur(kind:FormatKind,value:string):string{
 const v=value.trim();
 if(!v)return "";
 if(kind==="ssn"||kind==="phone")return inputMask(kind,v);
 if(kind==="height"){
   let feet:number|undefined,inches:number|undefined;
   const ft=v.match(/^(\d{1,2})\s*(?:ft|feet|['′])\s*(\d{1,2})?\s*(?:(?:in|inches|["″]))?$/i);
   const pair=v.match(/^(\d{1,2})\s+(\d{1,2})$/);
   const total=v.match(/^(\d{2,3})\s*(?:in|inches|["″])$/i);
   if(ft){feet=Number(ft[1]);inches=Number(ft[2]||"0");}
   else if(pair){feet=Number(pair[1]);inches=Number(pair[2]);}
   else if(total){const i=Number(total[1]);feet=Math.floor(i/12);inches=i%12;}
   if(feet!==undefined&&inches!==undefined&&feet>=1&&feet<=8&&inches>=0&&inches<12)
     return `${feet} ft ${inches} in`;
   if(/^\d{2,3}(?:\.\d+)?\s*cm$/i.test(v))return v.replace(/\s*cm$/i," cm");
 }
 if(kind==="weight"){
   const m=v.match(/^(\d{1,4}(?:\.\d{1,2})?)\s*(lb|lbs|pounds?|kg|kilograms?)?$/i);
   if(m){const qty=Number(m[1]);if(qty>0&&qty<1500)
     return `${qty} ${/^(?:kg|kilograms?)$/i.test(m[2]||"")?"kg":"lb"}`;}
 }
 if(kind==="date"){
   const d=digits(v);
   if(d.length===8&&/^\d{8}$/.test(v))return `${d.slice(0,2)}/${d.slice(2,4)}/${d.slice(4)}`;
 }
 if(kind==="month"){
   const d=digits(v);
   if(d.length===6&&/^\d{6}$/.test(v))return `${d.slice(0,2)}/${d.slice(2)}`;
 }
 return value;
}
function validCalendar(v:string,monthOnly=false):boolean{
 const match=v.match(monthOnly?/^(\d{1,2})\/(\d{4})$/:/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
 if(!match)return false;
 const m=Number(match[1]),d=monthOnly?1:Number(match[2]),y=Number(monthOnly?match[2]:match[3]);
 if(y<1800||y>2200||m<1||m>12)return false;
 const date=new Date(Date.UTC(y,m-1,d));
 return date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d;
}
export function validateDisplay(kind:FormatKind,value:string):string|null{
 const v=value.trim();
 if(!v)return null;
 if(kind==="ssn"&&digits(v).length!==9)return "SSN should contain exactly nine digits, or mark the answer unknown.";
 if(kind==="phone"&&/^\(?\d/.test(v)){
   const length=digits(v).length;
   if(length!==10&&!(length===11&&digits(v)[0]==="1"))return "US phone format uses ten digits; leave an international number with its country code.";
 }
 if(kind==="date"&&!validCalendar(v))return "Enter a real date as MM/DD/YYYY.";
 if(kind==="month"&&!validCalendar(v,true))return "Enter month and year as MM/YYYY.";
 if(kind==="height"&&!/^(?:[1-8] ft (?:\d|1[01]) in|\d{2,3}(?:\.\d+)? cm)$/.test(normalizeOnBlur(kind,v)))
   return "Height: use 5 ft 11 in, 71 in, or 180 cm.";
 if(kind==="weight"&&!/^\d{1,4}(?:\.\d{1,2})? (?:lb|kg)$/.test(normalizeOnBlur(kind,v)))
   return "Weight: enter a number with lb or kg (for example 180 lb).";
 return null;
}
