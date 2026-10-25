// Recovery is limited to this browser tab and the authenticated actor.
const key=(actor,kind)=>`civicsync.${kind}.${actor}`;
export function readLocal(actor,kind){try{return JSON.parse(sessionStorage.getItem(key(actor,kind))||'null');}catch{return null;}}
export function writeLocal(actor,kind,value){if(value===null)sessionStorage.removeItem(key(actor,kind));else sessionStorage.setItem(key(actor,kind),JSON.stringify(value));}
export function createPayload(f){return {title:f.title,description:f.desc,category:f.category,ward:f.ward||f.location.address,landmark:f.location.address,...(f.location.latitude!=null?{lat:f.location.latitude,lon:f.location.longitude,accuracy:f.location.accuracy}:{})};}
export function prepareIntake(actor,f){const pending=readLocal(actor,'pending');if(pending)return pending;const next={key:f.intakeKey,payload:createPayload(f),savedAt:Date.now()};writeLocal(actor,'pending',next);return next;}
export function saveTextDraft(actor,f){writeLocal(actor,'draft',{title:f.title,desc:f.desc,category:f.category,ward:f.ward,location:{address:f.location.address,latitude:null,longitude:null,accuracy:null},ok:false,photos:[],intakeKey:f.intakeKey});}
