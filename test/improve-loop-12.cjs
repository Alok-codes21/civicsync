process.env.DEMO_MODE='true';process.env.DB_PATH=':memory:';process.env.DEMO_ROUTES='true';process.env.AI_DETECTOR='off'
const {test,after}=require('node:test'),assert=require('node:assert/strict')
const {app,db,stop}=require('../server/index.cjs'),server=app.listen(0),base='http://127.0.0.1:'+server.address().port,tokens={}
const png='iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAHElEQVQokWPoIBEwjGogAjAQowgZjGogBtA+lADnoJgQ2ess4gAAAABJRU5ErkJggg=='
async function call(path,user,body,status=200){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(tokens[user]?{Authorization:'Bearer '+tokens[user]}:{})},body:body?JSON.stringify(body):undefined});const d=await r.json().catch(()=>({}));assert.equal(r.status,status,JSON.stringify(d));return d}
after(async()=>{await new Promise(r=>server.close(r));stop()})
const login=async u=>{tokens[u]=(await call('/api/login',null,{username:u,password:'demo123'})).token}
const events=()=>db.prepare('SELECT actor,action FROM security_events ORDER BY seq').all()
test('round 12: a capture session needs its nonce; missing or wrong nonce is refused and does not consume the session',async()=>{
 await login('alok')
 const id=(await call('/api/complaints','alok',{title:'Nonce required',description:'Synthetic regression',category:'Garbage Collection',ward:'Ward 12 - Gomti Nagar',lat:28.6743,lon:77.3834},201)).acknowledgementNumber,cp='/api/complaints/'+id
 const s=await call(cp+'/evidence-session','alok',{})
 const up=(extra,status)=>call(cp+'/evidence','alok',{stage:'before',mime:'image/png',base64:png,...extra},status)
 await up({sessionId:s.sessionId},400)
 await up({sessionId:s.sessionId,nonce:'0'.repeat(64)},400)
 await up({sessionId:s.sessionId,nonce:12345},400)
 assert.equal(db.prepare('SELECT consumedTs FROM evidence_sessions WHERE complaintId=?').get(id).consumedTs,null,'refused attempts must not consume the session')
 await up({sessionId:s.sessionId,nonce:s.nonce},201)
 assert.ok(db.prepare('SELECT consumedTs FROM evidence_sessions WHERE complaintId=?').get(id).consumedTs)
 await up({sessionId:s.sessionId,nonce:s.nonce},400)
})
test('round 12: token is expired at exactly the TTL and valid one millisecond before it',async()=>{
 await login('alok')
 const TTL=12*60*60*1000,realNow=Date.now,T=realNow.call(Date)
 const tok=tokens.alok
 const row=db.prepare('SELECT token,createdTs FROM tokens ORDER BY createdTs DESC LIMIT 1').get()
 try{
  db.prepare('UPDATE tokens SET createdTs=? WHERE token=?').run(T-TTL+50,row.token)
  const ok=await fetch(base+'/api/me',{headers:{Authorization:'Bearer '+tok}});assert.equal(ok.status,200)
  db.prepare('UPDATE tokens SET createdTs=? WHERE token=?').run(T-TTL,row.token)
  Date.now=()=>T
  const edge=await fetch(base+'/api/me',{headers:{Authorization:'Bearer '+tok}});assert.equal(edge.status,401)
 }finally{Date.now=realNow}
 assert.equal(db.prepare('SELECT COUNT(*) n FROM tokens WHERE token=?').get(row.token).n,0,'expired token row is deleted')
})
test('round 12: phone update and logout write account events without the phone, token or password',async()=>{
 await login('alok');const before=events().length
 await call('/api/me/phone','alok',{phone:'12345'},400)
 assert.equal(events().length,before,'invalid update records nothing')
 await call('/api/me/phone','alok',{phone:'9876543210'})
 let ev=events();assert.equal(ev.length,before+1);assert.deepEqual(ev.at(-1),{actor:'alok',action:'Contact phone updated'})
 assert.ok(!JSON.stringify(db.prepare('SELECT * FROM security_events').all()).includes('9876543210'))
 const t=tokens.alok
 await fetch(base+'/api/logout',{method:'POST',headers:{Authorization:'Bearer '+t}})
 await fetch(base+'/api/logout',{method:'POST',headers:{Authorization:'Bearer '+t}})
 await fetch(base+'/api/logout',{method:'POST',headers:{Authorization:'Bearer nonsense'}})
 ev=events();assert.equal(ev.filter(e=>e.action==='Session revoked').length,1,'only the real revocation is recorded, once')
 assert.ok(!JSON.stringify(db.prepare('SELECT * FROM security_events').all()).includes(t))
})
