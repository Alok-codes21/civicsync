process.env.DEMO_MODE='true';process.env.DB_PATH=':memory:';process.env.DEMO_ROUTES='true';process.env.AI_DETECTOR='off'
const {test,after}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto')
const {app,db,_loginFailures,stop}=require('../server/index.cjs'),server=app.listen(0),base='http://127.0.0.1:'+server.address().port,tokens={}
const png='iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAHElEQVQokWPoIBEwjGogAjAQowgZjGogBtA+lADnoJgQ2ess4gAAAABJRU5ErkJggg=='
async function raw(p,user,body){const r=await fetch(base+p,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(tokens[user]?{Authorization:'Bearer '+tokens[user]}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json().catch(()=>({}))}}
async function call(p,user,body,status=200){const r=await raw(p,user,body);assert.equal(r.status,status,JSON.stringify(r.body));return r.body}
after(async()=>{await new Promise(r=>server.close(r));stop()})
test('round 15: unknown-user and wrong-password logins do the same scrypt work and return the same 401',async()=>{
 const real=crypto.scrypt;let calls=0;crypto.scrypt=(...a)=>{calls++;return real(...a)}
 try{
  const a=await raw('/api/login',null,{username:'no-such-user-x',password:'whatever-1'});const c1=calls
  const b=await raw('/api/login',null,{username:'alok',password:'wrong-password'});const c2=calls-c1
  assert.equal(a.status,401);assert.deepEqual(a,b);assert.equal(c1,1,'unknown user still runs one scrypt');assert.equal(c2,1)
  const ok=await raw('/api/login',null,{username:'alok',password:'demo123'});assert.equal(ok.status,200);assert.ok(ok.body.token);tokens.alok=ok.body.token
 }finally{crypto.scrypt=real}
 _loginFailures.clear?.()
})
test('round 15: impact records are accepted while active and refused (no row, no audit) once Resolved',async()=>{
 for(const u of ['verma','reviewer'])tokens[u]=(await call('/api/login',null,{username:u,password:'demo123'})).token
 const id=(await call('/api/complaints','alok',{title:'Impact lifecycle',description:'Synthetic regression',category:'Garbage Collection',ward:'Ward 12 - Gomti Nagar',lat:28.6743,lon:77.3834},201)).acknowledgementNumber,cp='/api/complaints/'+id
 await call(cp+'/accept','verma',{})
 const imp={metric:'road_closure_hours',value:2,unit:'hours',note:'Lane closed for repair'}
 await call(cp+'/impact','verma',imp)
 await call(cp+'/evidence','alok',{stage:'before',mime:'image/png',base64:png},201)
 await call(cp+'/evidence','verma',{stage:'after',mime:'image/png',base64:png},201)
 await call(cp+'/repair','verma',{note:'Repair done'})
 await call(cp+'/verify','reviewer',{decision:'approve',reason:'Independent approval'})
 const rows=()=>db.prepare('SELECT COUNT(*) n FROM impact WHERE complaintId=?').get(id).n,au=()=>db.prepare('SELECT COUNT(*) n FROM audit WHERE complaintId=?').get(id).n
 const r0=rows(),a0=au()
 await call(cp+'/impact','verma',imp,409)
 assert.equal(rows(),r0);assert.equal(au(),a0)
})
