process.env.DEMO_MODE='true';process.env.DB_PATH=':memory:';process.env.DEMO_ROUTES='true';process.env.AI_DETECTOR='off'
const {test,after}=require('node:test'),assert=require('node:assert/strict')
const {app,db,stop}=require('../server/index.cjs'),server=app.listen(0),base='http://127.0.0.1:'+server.address().port,tokens={}
const png='iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAHElEQVQokWPoIBEwjGogAjAQowgZjGogBtA+lADnoJgQ2ess4gAAAABJRU5ErkJggg=='
async function call(path,user,body,status=200){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(tokens[user]?{Authorization:'Bearer '+tokens[user]}:{})},body:body?JSON.stringify(body):undefined});const d=await r.json();assert.equal(r.status,status,JSON.stringify(d));return d}
let id;const cp=()=>'/api/complaints/'+id
const ev=(stage,user)=>call(cp()+'/evidence',user,{stage,mime:'image/png',base64:png},201)
const repair=(status=200)=>call(cp()+'/repair','verma',{note:'Repair cycle regression'},status)
const verify=decision=>call(cp()+'/verify','reviewer',{decision,reason:'Independent cycle review'})
after(async()=>{await new Promise(r=>server.close(r));stop()})
test('repair dispute requires fresh before and worker-after evidence even in same millisecond',async()=>{
 for(const u of ['alok','verma','reviewer','supervisor'])tokens[u]=(await call('/api/login',null,{username:u,password:'demo123'})).token
 id=(await call('/api/complaints','alok',{title:'Cycle check',description:'Synthetic regression',category:'Garbage Collection',ward:'Ward 12 - Gomti Nagar'},201)).acknowledgementNumber
 await call(cp()+'/accept','verma',{});await ev('before','alok');await ev('after','verma');await repair()
 const realNow=Date.now;Date.now=()=>1791989000000
 try{await verify('dispute');const count=db.prepare('SELECT count(*) n FROM evidence WHERE complaintId=?').get(id).n;await repair(409);assert.equal(db.prepare('SELECT status FROM complaints WHERE id=?').get(id).status,'In Progress');await ev('after','verma');await repair(409);await ev('before','alok');await repair();assert.equal(db.prepare('SELECT count(*) n FROM evidence WHERE complaintId=?').get(id).n,count+2)}finally{Date.now=realNow}
})
test('Resolved route returns 409 without state or audit mutation; owner reopen requires fresh pair',async()=>{
 await verify('approve');const before=db.prepare('SELECT * FROM complaints WHERE id=?').get(id),auditBefore=db.prepare('SELECT count(*) n FROM audit').get().n
 await call(cp()+'/route','supervisor',{reason:'Must not bypass reopen'},409);assert.deepEqual(db.prepare('SELECT * FROM complaints WHERE id=?').get(id),before);assert.equal(db.prepare('SELECT count(*) n FROM audit').get().n,auditBefore)
 await call(cp()+'/status','alok',{status:'Reopened',note:'Issue has recurred again'});await repair(409);await ev('before','alok');await repair(409);await ev('after','verma');await repair();await verify('approve');assert.equal(db.prepare('SELECT reopenCount,status FROM complaints WHERE id=?').get(id).reopenCount,1)
})
