process.env.DEMO_MODE='true';process.env.DB_PATH=':memory:';process.env.DEMO_ROUTES='true';process.env.AI_DETECTOR='off'
const {test,after}=require('node:test'),assert=require('node:assert/strict'),cp_=require('node:child_process'),os=require('node:os'),path=require('node:path'),fs=require('node:fs')
const {app,db,sweep,stop}=require('../server/index.cjs'),server=app.listen(0),base='http://127.0.0.1:'+server.address().port,tokens={}
async function call(p,user,body,status=200){const r=await fetch(base+p,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(tokens[user]?{Authorization:'Bearer '+tokens[user]}:{})},body:body?JSON.stringify(body):undefined});const d=await r.json().catch(()=>({}));assert.equal(r.status,status,JSON.stringify(d));return d}
after(async()=>{await new Promise(r=>server.close(r));stop()})
const login=async()=>{for(const u of ['alok','verma','reviewer','supervisor','citizen2'])tokens[u]=(await call('/api/login',null,{username:u,password:'demo123'})).token}
const file=async(title,lat,lon,user='alok')=>(await call('/api/complaints',user,{title,description:'Synthetic regression',category:'Garbage Collection',ward:'Ward 12 - Gomti Nagar',lat,lon},201)).acknowledgementNumber
test('round 13: approved extension supersedes pending escalation; overdue again reactivates it with an audit row',async()=>{
 await login()
 const id=await file('Extension vs escalation',28.6743,77.3834),cp='/api/complaints/'+id,DAY=86400000
 db.prepare('UPDATE complaints SET deadlineTs=? WHERE id=?').run(Date.now()-DAY,id)
 sweep();const t0=db.prepare('SELECT * FROM escalation_tasks WHERE complaintId=?').all(id);assert.equal(t0.length,1);assert.equal(t0[0].state,'pending')
 await call(cp+'/accept','verma',{})
 await call(cp+'/extensions','verma',{reason:'Need materials for the repair',deadlineTs:Date.now()+3*DAY})
 const xid=db.prepare('SELECT id FROM extensions WHERE complaintId=?').get(id)?.id
 assert.ok(xid,'extension request exists')
 await call('/api/extensions/'+xid+'/review','supervisor',{decision:'approve',reason:'Reasonable delay'})
 assert.equal(db.prepare('SELECT state FROM escalation_tasks WHERE complaintId=?').get(id).state,'superseded')
 await call(cp+'/escalations/1/accept','supervisor',{reason:'Try to accept stale task'},409)
 const audits=db.prepare("SELECT COUNT(*) n FROM audit WHERE complaintId=? AND action='Escalation L1'").get(id).n
 db.prepare('UPDATE complaints SET deadlineTs=? WHERE id=?').run(Date.now()-DAY,id)
 sweep()
 assert.equal(db.prepare('SELECT state FROM escalation_tasks WHERE complaintId=?').get(id).state,'pending','second overdue episode reactivates the task')
 assert.equal(db.prepare("SELECT COUNT(*) n FROM audit WHERE complaintId=? AND action='Escalation L1'").get(id).n,audits+1)
 await call(cp+'/escalations/1/accept','supervisor',{reason:'Accepting live escalation'})
})
test('round 13: link refuses a cluster whose far members are not within 100m of the target cluster; audit lists moved ids',async()=>{
 const A=await file('Link A',28.6743,77.3834),B=await file('Link B',28.6758,77.3834,'citizen2'),C=await file('Link C',28.6743,77.3840),E=await file('Link E',28.67435,77.3841)
 const iss=x=>db.prepare('SELECT issueId FROM complaints WHERE id=?').get(x).issueId
 const one=db.prepare('SELECT issueId FROM complaints WHERE id=?').get(A).issueId
 db.prepare('UPDATE complaints SET issueId=? WHERE id=?').run(one,B)
 const ids=[A,B,C,E].map(iss),before=ids.slice()
 await call('/api/complaints/'+A+'/link','reviewer',{target:C,reason:'Chain would pull in far complaint B'},409)
 assert.deepEqual([A,B,C,E].map(iss),before,'refused link changes nothing')
 await call('/api/complaints/'+E+'/link','reviewer',{target:C,reason:'Single nearby complaint'})
 assert.equal(iss(E),iss(C))
 const a=JSON.parse(db.prepare("SELECT afterJson FROM audit WHERE complaintId=? AND action='Issue cluster linked'").get(E).afterJson)
 assert.deepEqual(a.movedComplaintIds,[E])
})
test('round 13: DEMO_MODE refuses to start on a non-loopback HOST unless explicitly allowed; loopback and demo-off are fine',()=>{
 const entry=path.join(__dirname,'..','server','index.cjs'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'cs-'))
 const run=(env)=>cp_.spawnSync(process.execPath,[entry],{env:{PATH:process.env.PATH,DB_PATH:path.join(tmp,'t.db'),AI_DETECTOR:'off',PORT:String(40000+Math.floor(Math.random()*20000)),...env},timeout:4000,encoding:'utf8'})
 const bad=run({DEMO_MODE:'true',HOST:'0.0.0.0'});assert.equal(bad.status,1);assert.match(bad.stderr,/non-loopback HOST/)
 assert.ok(!fs.existsSync(path.join(tmp,'t.db'))||(()=>{const d=new (require('better-sqlite3'))(path.join(tmp,'t.db'),{readonly:true});try{return !d.prepare("SELECT 1 FROM sqlite_master WHERE name='users'").get()||d.prepare("SELECT COUNT(*) n FROM users WHERE username='alok'").get().n===0}finally{d.close()}})(),'refusal must not seed demo accounts')
 const ok1=run({DEMO_MODE:'true',HOST:'127.0.0.1'});assert.notEqual(ok1.status,1,'loopback demo starts (killed by timeout)')
 const ok2=run({HOST:'0.0.0.0'});assert.notEqual(ok2.status,1,'demo off + network HOST starts')
 const ok3=run({DEMO_MODE:'true',HOST:'0.0.0.0',ALLOW_DEMO_ON_NETWORK:'true'});assert.notEqual(ok3.status,1,'explicit opt-in starts')
 fs.rmSync(tmp,{recursive:true,force:true})
})
