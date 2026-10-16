process.env.DEMO_MODE='true';process.env.DB_PATH=':memory:';process.env.DEMO_ROUTES='true';process.env.AI_DETECTOR='off'
const {test,after}=require('node:test'),assert=require('node:assert/strict')
const {app,db,stop}=require('../server/index.cjs'),server=app.listen(0),base='http://127.0.0.1:'+server.address().port,tokens={}
const png='iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAHElEQVQokWPoIBEwjGogAjAQowgZjGogBtA+lADnoJgQ2ess4gAAAABJRU5ErkJggg=='
async function call(path,user,body,status=200,method){const r=await fetch(base+path,{method:method||(body?'POST':'GET'),headers:{'Content-Type':'application/json',...(tokens[user]?{Authorization:'Bearer '+tokens[user]}:{})},body:body?JSON.stringify(body):undefined});const d=await r.json();assert.equal(r.status,status,JSON.stringify(d));return d}
const file=async(title,ward='Ward 12 - Gomti Nagar',category='Garbage Collection',user='alok')=>(await call('/api/complaints',user,{title,description:'Synthetic regression',category,ward,lat:28.6743,lon:77.3834},201)).acknowledgementNumber
const login=async()=>{for(const u of ['alok','citizen2','verma','reviewer','supervisor'])tokens[u]=(await call('/api/login',null,{username:u,password:'demo123'})).token}
after(async()=>{await new Promise(r=>server.close(r));stop()})
test('round 2: latest evidence review decision wins; complaint-wide review applies to existing evidence only',async()=>{
 await login()
 const id=await file('Decision semantics'),cp='/api/complaints/'+id
 await call(cp+'/accept','verma',{})
 await call(cp+'/evidence','alok',{stage:'before',mime:'image/png',base64:png},201)
 await call(cp+'/evidence','verma',{stage:'after',mime:'image/png',base64:png},201)
 const ev=db.prepare('SELECT id,stage FROM evidence WHERE complaintId=?').all(id),after_=ev.find(e=>e.stage==='after').id
 await call(cp+'/evidence-review','reviewer',{decision:'needs_site_visit',reason:'Complaint-wide flag'})
 await call(cp+'/repair','verma',{note:'blocked by complaint-wide review'},409)
 await call(cp+'/evidence-review','reviewer',{decision:'accepted_for_work',reason:'Looks fine now'})
 await call(cp+'/evidence-review','reviewer',{decision:'needs_reupload',reason:'After photo unusable',evidenceId:after_})
 await call(cp+'/repair','verma',{note:'after image flagged'},409)
 await call(cp+'/evidence-review','reviewer',{decision:'accepted_for_work',reason:'Re-checked',evidenceId:after_})
 await call(cp+'/repair','verma',{note:'latest decision wins'})
})
test('round 2: link validates the target cluster too',async()=>{
 const a=await file('T-A'),b=await file('T-B'),c=await file('T-C','Ward 12 - Gomti Nagar','Roads & Potholes')
 const iss=id=>db.prepare('SELECT issueId FROM complaints WHERE id=?').get(id).issueId
 db.prepare('UPDATE complaints SET issueId=? WHERE id=?').run(iss(b),c)
 const before=db.prepare('SELECT id,issueId FROM complaints ORDER BY id').all()
 await call('/api/complaints/'+a+'/link','reviewer',{target:b,reason:'Target cluster is mixed'},409)
 assert.deepEqual(db.prepare('SELECT id,issueId FROM complaints ORDER BY id').all(),before)
})
test('round 2: list filters and pagination run in SQL with the same results',async()=>{
 await file('List 1','Ward 12 - Gomti Nagar','Roads & Potholes','citizen2')
 const all=await call('/api/complaints?limit=100','alok'),mine=await call('/api/complaints?mine=true&limit=100','citizen2')
 assert.ok(mine.total>=1&&mine.complaints.every(c=>c.id)&&mine.total<all.total)
 const page=await call('/api/complaints?limit=2&offset=1','alok');assert.equal(page.total,all.total);assert.deepEqual(page.complaints.map(c=>c.id),all.complaints.slice(1,3).map(c=>c.id))
 const roads=await call('/api/complaints?q=roads&limit=100','alok');assert.ok(roads.total>=1&&roads.complaints.every(c=>c.category==='Roads & Potholes'))
 assert.equal((await call('/api/complaints?q=%25','alok')).total,0)
 assert.equal((await call('/api/complaints?status=Nonexistent','alok')).total,0)
 await call('/api/complaints?mine=true',null,null,401)
 await call('/api/complaints?limit=10&limit=20','alok',null,400)
})
test('round 2: malformed numeric route ids return 400, well-formed missing ids return 404',async()=>{
 for(const id of ['abc','0','-1','1.5','99999999999'])await call('/api/transfers/'+id+'/accept','reviewer',{},400)
 await call('/api/transfers/999/accept','reviewer',{},404)
 for(const id of ['abc','0','-1','1.5'])await call('/api/extensions/'+id+'/review','supervisor',{decision:'deny',reason:'x'.repeat(20)},400)
 await call('/api/extensions/999/review','supervisor',{decision:'deny',reason:'x'.repeat(20)},404)
 const id=await file('Level ids')
 for(const l of ['abc','0','-2','1.5'])await call('/api/complaints/'+id+'/escalations/'+l+'/accept','supervisor',{reason:'x'.repeat(20)},400)
})
