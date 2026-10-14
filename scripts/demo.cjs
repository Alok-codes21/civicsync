/* Repeatable judge demo: `npm run demo`. Runs the real Express app in-process on an
   in-memory database (nothing written to disk, no network, no real data).
   Scenario A: file -> routing review -> supervisor route -> accept -> repair -> independent verify -> Resolved.
   Scenario B: file -> deadline missed (clock moved in demo only) -> escalation L1-L3 -> repair -> dispute -> In Progress
               -> repair again -> approve -> owner reopens after Resolved.
   Sample accounts and routes are demo-only identities; no municipal integration is claimed. */
process.env.DEMO_MODE='true';process.env.DB_PATH=':memory:';process.env.AI_DETECTOR='off';process.env.DEMO_GHAZIABAD_ROUTES='true';delete process.env.DEMO_ROUTES
const sharp=require('sharp')
const {app,db,sweep,stop}=require('../server/index.cjs')
const server=app.listen(0),base='http://127.0.0.1:'+server.address().port
const DAY=86400000,tok={}
async function call(path,body,user,method){const r=await fetch(base+path,{method:method||(body?'POST':'GET'),headers:{'Content-Type':'application/json',...(tok[user]?{Authorization:'Bearer '+tok[user]}:{})},body:body?JSON.stringify(body):undefined});const data=await r.json();if(r.status>=400)throw new Error(`${path} -> ${r.status} ${data.error||''}`);return data}
const say=(s)=>console.log(s)
const status=id=>db.prepare('SELECT status,escalationLevel,reopenCount FROM complaints WHERE id=?').get(id)
async function png(seed){const raw=Buffer.alloc(32*32*3);for(let i=0;i<raw.length;i++)raw[i]=(i*seed+(i>>3)*7)%256;return (await sharp(raw,{raw:{width:32,height:32,channels:3}}).png().toBuffer()).toString('base64')}
async function evidence(id,stage,user,seed){return call(`/api/complaints/${id}/evidence`,{stage,mime:'image/png',base64:await png(seed),lat:28.6743,lon:77.3834,accuracy:20,capturedTs:Date.now()},user)}
async function file(category,title){const r=await call('/api/complaints',{title,description:'Demo complaint (synthetic)',category,ward:'Ghaziabad Ward 38'},'alok');return r.acknowledgementNumber}
async function main(){
  for(const u of ['alok','verma','reviewer','supervisor'])tok[u]=(await call('/api/login',{username:u,password:'demo123'})).token
  say('Charter SLA reference (public pages, copied, not live): '+(await call('/api/reference/charter')).categorySla['Garbage Collection'].basis)
  const loc=await call('/api/reference/locality?q=Ghukna');say(`Locality "Ghukna" -> ${loc.result} (wards ${loc.wards.join(',')}); human review required, no auto-assign`)
  const d0=await call('/api/complaints',{title:'Demo: seeded route',description:'Synthetic',category:'Garbage Collection',ward:'Ghaziabad Ward 50'},'alok');say(`Seeded DEMO route (ward 50 has one zone): ${d0.complaint.status}, dept "${d0.complaint.dept}", officer ${d0.complaint.officer} (demo account, unverified)`)
  say('\n== Scenario A: success path ==')
  let a=await file('Garbage Collection','Garbage pile near market');say(`A1 filed ${a}: ${status(a).status} (no route configured, so no guessing)`)
  const sg=(await call(`/api/complaints/${a}`,null,'supervisor')).complaint.routingSuggestion;say(`A1b supervisor sees suggestion only: ward ${sg.wardId}, ${sg.department}/${sg.charterRole}, ${sg.staffHints.length} staff name hints, status ${sg.status}, nothing assigned`)
  await call('/api/routes',{ward:'Ghaziabad Ward 38',category:'Garbage Collection',dept:'Sanitation (demo route)',officer:'verma',supervisor:'supervisor',reason:'Demo routing config'},'supervisor')
  await call(`/api/complaints/${a}/route`,{reason:'Supervisor confirmed demo route'},'supervisor');say(`A2 supervisor routed: ${status(a).status}`)
  await call(`/api/complaints/${a}/accept`,{},'verma');say('A3 officer accepted')
  await evidence(a,'before','alok',3);await evidence(a,'after','verma',5)
  await call(`/api/complaints/${a}/repair`,{note:'Garbage cleared and bin placed'},'verma');say(`A4 repair submitted: ${status(a).status}`)
  try{await call(`/api/complaints/${a}/verify`,{decision:'approve',reason:'self approval attempt'},'verma')}catch(e){say('A5 repairer self-approval blocked: '+e.message)}
  await call(`/api/complaints/${a}/verify`,{decision:'approve',reason:'Citizen confirms area is clean'},'alok');say(`A6 owner approved: ${status(a).status}`)
  say('\n== Scenario B: overdue, escalation, dispute, reopen ==')
  const b=await file('Garbage Collection','Overflowing dhalao');await call(`/api/complaints/${b}/route`,{reason:'Supervisor confirmed demo route'},'supervisor');await call(`/api/complaints/${b}/accept`,{},'verma')
  const due=db.prepare('SELECT deadlineTs FROM complaints WHERE id=?').get(b).deadlineTs
  sweep(due+1000);say(`B1 1 day SLA missed (demo clock): ${status(b).status}, level ${status(b).escalationLevel}`)
  sweep(due+3*DAY);say(`B2 +3 days: ${status(b).status}, level ${status(b).escalationLevel}`)
  sweep(due+8*DAY);sweep(due+9*DAY);say(`B3 +8 days, swept twice: level ${status(b).escalationLevel}, tasks ${db.prepare('SELECT count(*) n FROM escalation_tasks WHERE complaintId=?').get(b).n} (no duplicates)`)
  await evidence(b,'before','alok',7);await evidence(b,'after','verma',11)
  await call(`/api/complaints/${b}/repair`,{note:'Cleared'},'verma');say(`B4 repair submitted: ${status(b).status}`)
  await call(`/api/complaints/${b}/verify`,{decision:'dispute',reason:'Still overflowing'},'alok');say(`B5 owner disputes pending repair: ${status(b).status} (rule: In Progress, not Reopened)`)
  await evidence(b,'after','verma',13);await call(`/api/complaints/${b}/repair`,{note:'Cleared again'},'verma')
  await call(`/api/complaints/${b}/verify`,{decision:'approve',reason:'Now fixed'},'reviewer');say(`B6 independent reviewer approved: ${status(b).status}`)
  await call(`/api/complaints/${b}/status`,{status:'Reopened',note:'Problem is back after rain'},'alok');say(`B7 owner reopens after Resolved: ${status(b).status}, reopenCount ${status(b).reopenCount}`)
  const audit=await call('/api/audit',null,'supervisor');say(`\nAudit chain valid: ${audit.valid} (${audit.events.length} events, local hash chain, not externally anchored)`)
}
main().then(()=>{stop();server.close()},e=>{console.error('DEMO FAILED:',e.message);stop();server.close();process.exitCode=1})
