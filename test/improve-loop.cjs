process.env.DEMO_MODE='true';process.env.DB_PATH=':memory:';process.env.DEMO_ROUTES='true';process.env.AI_DETECTOR='off'
const {test,after}=require('node:test'),assert=require('node:assert/strict')
const {app,db,stop}=require('../server/index.cjs'),server=app.listen(0),base='http://127.0.0.1:'+server.address().port,tokens={}
const png='iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAHElEQVQokWPoIBEwjGogAjAQowgZjGogBtA+lADnoJgQ2ess4gAAAABJRU5ErkJggg=='
async function call(path,user,body,status=200){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(tokens[user]?{Authorization:'Bearer '+tokens[user]}:{})},body:body?JSON.stringify(body):undefined});const d=await r.json();assert.equal(r.status,status,JSON.stringify(d));return d}
const file=async(title,ward='Ward 12 - Gomti Nagar',category='Garbage Collection')=>(await call('/api/complaints','alok',{title,description:'Synthetic regression',category,ward,lat:28.6743,lon:77.3834},201)).acknowledgementNumber
after(async()=>{await new Promise(r=>server.close(r));stop()})
test('round 1: reviewer-invalidated evidence cannot back a repair; resolved complaints cannot change owner or priority',async()=>{
 for(const u of ['alok','verma','reviewer','supervisor'])tokens[u]=(await call('/api/login',null,{username:u,password:'demo123'})).token
 const id=await file('Review invalidates evidence'),cp='/api/complaints/'+id
 await call(cp+'/accept','verma',{})
 const b=await call(cp+'/evidence','alok',{stage:'before',mime:'image/png',base64:png},201)
 await call(cp+'/evidence','verma',{stage:'after',mime:'image/png',base64:png},201)
 const bid=b.evidence?.id||db.prepare("SELECT id FROM evidence WHERE complaintId=? AND stage='before'").get(id).id
 await call(cp+'/evidence-review','reviewer',{decision:'needs_reupload',reason:'Photo unclear',evidenceId:bid})
 await call(cp+'/repair','verma',{note:'Should be refused'},409)
 await call(cp+'/evidence','alok',{stage:'before',mime:'image/png',base64:png},201)
 await call(cp+'/repair','verma',{note:'Fresh before image now'})
 await call(cp+'/verify','reviewer',{decision:'approve',reason:'Independent approval'})
 const tid=Number(db.prepare('INSERT INTO transfers(complaintId,requester,target,reason) VALUES (?,?,?,?)').run(id,'verma','reviewer','test').lastInsertRowid)
 tokens.reviewer&&await call('/api/transfers/'+tid+'/accept','reviewer',{},409)
 assert.equal(db.prepare('SELECT state FROM transfers WHERE id=?').get(tid).state,'pending')
 await call(cp+'/priority','supervisor',{priority:'High',reason:'Must be refused when resolved'},409)
})
test('round 1: transfer accept is claimed once',async()=>{
 const id=await file('Transfer once')
 await call('/api/complaints/'+id+'/accept','verma',{})
 const tid=Number(db.prepare('INSERT INTO transfers(complaintId,requester,target,reason) VALUES (?,?,?,?)').run(id,'verma','reviewer','test').lastInsertRowid)
 await call('/api/transfers/'+tid+'/accept','reviewer',{})
 await call('/api/transfers/'+tid+'/accept','reviewer',{},409)
})
test('round 1: malformed pagination and coordinates return 400, valid ones still work',async()=>{
 for(const q of ['limit=abc','limit=0','limit=101','limit=2.5','offset=-1','offset=x','limit='])await call('/api/complaints?'+q,'alok',null,400)
 await call('/api/complaints?limit=5&offset=0','alok',null,200)
 for(const q of ['lat=&lon=77.4','lat=28.67','lat=abc&lon=77.4','lat=NaN&lon=77.4'])await call('/api/jurisdictions/lookup?'+q,null,null,400)
})
test('round 1: link refuses a source cluster that mixes categories or wards',async()=>{
 const a=await file('Link A'),b=await file('Link B'),c=await file('Link C','Ward 12 - Gomti Nagar','Roads & Potholes')
 const iss=id=>db.prepare('SELECT issueId FROM complaints WHERE id=?').get(id).issueId
 db.prepare('UPDATE complaints SET issueId=? WHERE id=?').run(iss(a),c)
 const before=db.prepare('SELECT id,issueId FROM complaints ORDER BY id').all()
 await call('/api/complaints/'+a+'/link','reviewer',{target:b,reason:'Mixed cluster must be refused'},409)
 assert.deepEqual(db.prepare('SELECT id,issueId FROM complaints ORDER BY id').all(),before)
})
