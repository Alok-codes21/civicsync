const BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
let token = sessionStorage.getItem('civicsync.token') || '';
export function setToken(value) { token = value || ''; if(token) sessionStorage.setItem('civicsync.token',token); else sessionStorage.removeItem('civicsync.token'); }
export async function api(path, { method='GET', body, headers={}, signal }={}) {
 const requestToken=token;
 const response=await fetch(`${BASE}/api${path}`, {method,signal,headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:`Bearer ${token}`} : {}),...headers},...(body?{body:JSON.stringify(body)}:{})});
 const data=await response.json().catch(()=>({error:'Server returned an unreadable response'}));
 if(!response.ok){if(response.status===401&&requestToken===token&&path!=='/login'&&path!=='/signup'){setToken('');window.dispatchEvent(new Event('civicsync:session-expired'));}const e=new Error(data.error||`Request failed (${response.status})`);e.status=response.status;throw e;}return data;
}
export function adapt(c) {return {...c,title:c.title||c.category,desc:c.description||c.latestUpdate,createdAt:c.submittedAt,events:(c.timeline||[]).map(e=>({title:e.label,createdAt:e.ts})),photos:[],remaining:c.overdue?'Overdue':c.deadline?`Due ${c.deadline}`:'Deadline unavailable',level:`L${c.escalationLevel||0}`,address:c.landmark||'',location:{latitude:c.lat,longitude:c.lon}};}
export async function uploadEvidence(id,file,stage='before',session=null){
 if(!['image/png','image/jpeg'].includes(file.type))throw new Error('Choose a PNG or JPEG image.');
 if(file.size>4*1024*1024)throw new Error('Each photo must be 4 MB or smaller.');
 const base64=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.onerror=()=>reject(new Error('Photo could not be read'));r.readAsDataURL(file);});
 return api(`/complaints/${encodeURIComponent(id)}/evidence`,{method:'POST',body:{base64,mime:file.type,stage,captureMethod:session?'live_camera':'web_upload',deviceIntegrity:'unavailable',provenanceStatus:'unsupported',...(session?{sessionId:session.sessionId,nonce:session.nonce,capturedTs:Date.now()}:{})}});
}
