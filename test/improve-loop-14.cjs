process.env.DEMO_MODE='true';process.env.DB_PATH=':memory:';process.env.DEMO_ROUTES='true';process.env.AI_DETECTOR='off'
const {test,after}=require('node:test'),assert=require('node:assert/strict')
const {app,db,retention,stop}=require('../server/index.cjs'),server=app.listen(0),base='http://127.0.0.1:'+server.address().port,tokens={}
const png='iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAHElEQVQokWPoIBEwjGogAjAQowgZjGogBtA+lADnoJgQ2ess4gAAAABJRU5ErkJggg=='
async function call(p,user,body,status=200){const r=await fetch(base+p,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(tokens[user]?{Authorization:'Bearer '+tokens[user]}:{})},body:body?JSON.stringify(body):undefined});const d=await r.json().catch(()=>({}));assert.equal(r.status,status,JSON.stringify(d));return d}
after(async()=>{await new Promise(r=>server.close(r));stop()})
const login=async()=>{for(const u of ['alok','verma','reviewer','supervisor'])tokens[u]=(await call('/api/login',null,{username:u,password:'demo123'})).token}
const state=id=>JSON.stringify(db.prepare('SELECT status,officer,dept,accepted,repairActor,latestUpdate FROM complaints WHERE id=?').get(id))
const audits=id=>db.prepare('SELECT COUNT(*) n FROM audit WHERE complaintId=?').get(id).n
test('round 14: re-routing is refused while a repair verification is pending (no state or audit change); allowed again after dispute',async()=>{
 await login()
 const id=(await call('/api/complaints','alok',{title:'Route vs verification',description:'Synthetic regression',category:'Garbage Collection',ward:'Ward 12 - Gomti Nagar',lat:28.6743,lon:77.3834},201)).acknowledgementNumber,cp='/api/complaints/'+id
 await call(cp+'/accept','verma',{})
 await call(cp+'/evidence','alok',{stage:'before',mime:'image/png',base64:png},201)
 await call(cp+'/evidence','verma',{stage:'after',mime:'image/png',base64:png},201)
 await call(cp+'/repair','verma',{note:'Repair submitted'})
 assert.equal(db.prepare('SELECT status FROM complaints WHERE id=?').get(id).status,'Verification Pending')
 const s=state(id),a=audits(id)
 await call(cp+'/route','supervisor',{reason:'Try to bypass pending verification'},409)
 assert.equal(state(id),s);assert.equal(audits(id),a)
 await call(cp+'/verify','alok',{decision:'dispute',reason:'Not fixed yet'})
 const r=await fetch(base+cp+'/route',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+tokens.supervisor},body:JSON.stringify({reason:'Reroute after dispute'})})
 assert.notEqual(r.status,409,'after the dispute the route guard no longer applies (any other outcome is a routing-config matter)')
})
test('round 14: retention deletes the complaint-scoped capture sessions with the evidence',async()=>{
 const id=(await call('/api/complaints','alok',{title:'Retention sessions',description:'Synthetic regression',category:'Garbage Collection',ward:'Ward 12 - Gomti Nagar',lat:28.6743,lon:77.3834},201)).acknowledgementNumber
 await call('/api/complaints/'+id+'/evidence-session','alok',{})
 assert.equal(db.prepare('SELECT COUNT(*) n FROM evidence_sessions WHERE complaintId=?').get(id).n,1)
 db.prepare("UPDATE complaints SET status='Resolved',resolvedTs=? WHERE id=?").run(Date.now()-91*86400000,id)
 retention()
 assert.equal(db.prepare('SELECT COUNT(*) n FROM evidence_sessions WHERE complaintId=?').get(id).n,0,'unexpired session of a redacted complaint is gone')
 retention()
 assert.equal(db.prepare('SELECT description FROM complaints WHERE id=?').get(id).description,'[retention redacted]')
})
