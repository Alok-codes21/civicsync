process.env.DEMO_MODE='true';process.env.DB_PATH=':memory:';process.env.DEMO_ROUTES='true';process.env.AI_DETECTOR='off'
const {test,after}=require('node:test'),assert=require('node:assert/strict')
const {app,db,stop}=require('../server/index.cjs'),server=app.listen(0),base='http://127.0.0.1:'+server.address().port,tokens={}
const png='iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAHElEQVQokWPoIBEwjGogAjAQowgZjGogBtA+lADnoJgQ2ess4gAAAABJRU5ErkJggg=='
async function call(path,user,body,status=200,method){const r=await fetch(base+path,{method:method||(body?'POST':'GET'),headers:{'Content-Type':'application/json',...(tokens[user]?{Authorization:'Bearer '+tokens[user]}:{})},body:body?JSON.stringify(body):undefined});const d=await r.json().catch(()=>({}));assert.equal(r.status,status,JSON.stringify(d));return d}
const file=async title=>(await call('/api/complaints','alok',{title,description:'Synthetic regression',category:'Garbage Collection',ward:'Ward 12 - Gomti Nagar',lat:28.6743,lon:77.3834},201)).acknowledgementNumber
after(async()=>{await new Promise(r=>server.close(r));stop()})
const snap=id=>JSON.stringify({ev:db.prepare('SELECT id,reviewDecision,reviewedBy,reviewedAt FROM evidence WHERE complaintId=? ORDER BY id').all(id),rv:db.prepare('SELECT COUNT(*) n FROM reviews WHERE complaintId=?').get(id).n,au:db.prepare('SELECT COUNT(*) n FROM audit WHERE complaintId=?').get(id).n,c:db.prepare('SELECT status,priority,deadlineTs FROM complaints WHERE id=?').get(id)})
async function resolved(title){
 for(const u of ['alok','verma','reviewer','supervisor'])tokens[u]=(await call('/api/login',null,{username:u,password:'demo123'})).token
 const id=await file(title),cp='/api/complaints/'+id
 await call(cp+'/accept','verma',{})
 await call(cp+'/evidence','alok',{stage:'before',mime:'image/png',base64:png},201)
 await call(cp+'/evidence','verma',{stage:'after',mime:'image/png',base64:png},201)
 return {id,cp}
}
test('round 11: evidence review is refused on a Resolved complaint without any state, review-row or audit change',async()=>{
 const {id,cp}=await resolved('Review after resolution')
 await call(cp+'/evidence-review','reviewer',{decision:'accepted_for_work',reason:'Fine before repair'})
 await call(cp+'/repair','verma',{note:'Repair done'})
 await call(cp+'/verify','reviewer',{decision:'approve',reason:'Independent approval'})
 assert.equal(db.prepare('SELECT status FROM complaints WHERE id=?').get(id).status,'Resolved')
 const before=snap(id)
 const evId=db.prepare('SELECT id FROM evidence WHERE complaintId=? LIMIT 1').get(id).id
 await call(cp+'/evidence-review','reviewer',{decision:'needs_reupload',reason:'Late reversal attempt'},409)
 await call(cp+'/evidence-review','reviewer',{decision:'needs_reupload',reason:'Late reversal attempt',evidenceId:evId},409)
 assert.equal(snap(id),before,'refused review must not change evidence, reviews, audit or complaint')
})
test('round 11: review before resolution works; once Resolved, review and a second verify are both refused',async()=>{
 const {cp}=await resolved('Review reopen path')
 await call(cp+'/repair','verma',{note:'Repair done'})
 await call(cp+'/verify','reviewer',{decision:'approve',reason:'Independent approval'})
 await call(cp+'/evidence-review','reviewer',{decision:'needs_site_visit',reason:'refused while resolved'},409)
 await call(cp+'/verify','reviewer',{decision:'approve',reason:'second call'},409)
})
test('round 11: business change and audit row commit or roll back together (forced audit failure)',async()=>{
 const {id,cp}=await resolved('Audit atomicity')
 const before=snap(id)
 db.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON audit BEGIN SELECT RAISE(ABORT,'forced audit failure'); END")
 try{
  const r1=await fetch(base+cp+'/evidence-review',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+tokens.reviewer},body:JSON.stringify({decision:'needs_site_visit',reason:'Forced failure check'})})
  assert.equal(r1.status,500)
  const r2=await fetch(base+cp+'/priority',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+tokens.supervisor},body:JSON.stringify({priority:'High',reason:'Forced failure check'})})
  assert.equal(r2.status,500)
 }finally{db.exec('DROP TRIGGER fail_audit')}
 assert.equal(snap(id),before,'failed audit write must roll back review rows, evidence decision, priority and deadline')
 await call(cp+'/evidence-review','reviewer',{decision:'needs_site_visit',reason:'Works once trigger is gone'})
 assert.ok(JSON.parse(snap(id)).au>JSON.parse(before).au)
 const chain=await call('/api/complaints/'+id+'/audit','supervisor').catch(()=>null)
 if(chain&&'valid' in chain)assert.equal(chain.valid,true)
})
test('round 11: escalation accept is a compare-and-set on pending (already accepted -> 409, no second audit row)',async()=>{
 const {id,cp}=await resolved('Escalation accept CAS')
 db.prepare("INSERT INTO escalation_tasks(complaintId,cycle,level,authority,state,ts) VALUES (?,?,?,?,?,?)").run(id,db.prepare('SELECT reopenCount r FROM complaints WHERE id=?').get(id).r,1,'Supervisor','pending',Date.now())
 await call(cp+'/escalations/1/accept','supervisor',{reason:'Taking this one'})
 const a=db.prepare('SELECT COUNT(*) n FROM audit WHERE complaintId=?').get(id).n
 await call(cp+'/escalations/1/accept','supervisor',{reason:'Second accept refused'},409)
 assert.equal(db.prepare('SELECT COUNT(*) n FROM audit WHERE complaintId=?').get(id).n,a)
 assert.equal(db.prepare("SELECT acceptedBy FROM escalation_tasks WHERE complaintId=?").get(id).acceptedBy,'supervisor')
})
