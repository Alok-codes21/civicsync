process.env.DEMO_MODE='true';process.env.DB_PATH=':memory:';process.env.DEMO_ROUTES='true';process.env.AI_DETECTOR='off'
const {test,after}=require('node:test'),assert=require('node:assert/strict')
const {app,db,stop,_runMaintenance}=require('../server/index.cjs'),server=app.listen(0),base='http://127.0.0.1:'+server.address().port,tokens={}
const {spawnSync}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const png='iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAHElEQVQokWPoIBEwjGogAjAQowgZjGogBtA+lADnoJgQ2ess4gAAAABJRU5ErkJggg=='
async function call(path,user,body,status=200){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(tokens[user]?{Authorization:'Bearer '+tokens[user]}:{})},body:body?JSON.stringify(body):undefined});const d=await r.json();assert.equal(r.status,status,JSON.stringify(d));return d}
const file=async(title,user='alok')=>(await call('/api/complaints',user,{title,description:'Synthetic regression',category:'Garbage Collection',ward:'Ward 12 - Gomti Nagar',lat:28.6743,lon:77.3834},201)).acknowledgementNumber
after(async()=>{await new Promise(r=>server.close(r));stop()})
test('round 3: escalation level outside 1-3 is 400, valid missing task is 404',async()=>{
 for(const u of ['alok','verma','reviewer','supervisor'])tokens[u]=(await call('/api/login',null,{username:u,password:'demo123'})).token
 const id=await file('Levels')
 for(const l of ['4','999','0','abc','1.5'])await call('/api/complaints/'+id+'/escalations/'+l+'/accept','supervisor',{reason:'Level domain check'},400)
 await call('/api/complaints/'+id+'/escalations/1/accept','supervisor',{reason:'Level domain check'},404)
})
test('round 3: extension approval on a complaint resolved meanwhile is refused without mutation',async()=>{
 const id=await file('Extension after resolve'),cp='/api/complaints/'+id
 await call(cp+'/accept','verma',{})
 await call(cp+'/extensions','verma',{deadlineTs:Date.now()+20*86400000,reason:'Need more time for the repair'})
 await call(cp+'/evidence','alok',{stage:'before',mime:'image/png',base64:png},201)
 await call(cp+'/evidence','verma',{stage:'after',mime:'image/png',base64:png},201)
 await call(cp+'/repair','verma',{note:'Repaired early'});await call(cp+'/verify','reviewer',{decision:'approve',reason:'Independent approval'})
 const xid=db.prepare("SELECT id FROM extensions WHERE complaintId=? AND state='pending'").get(id).id,before=db.prepare('SELECT * FROM complaints WHERE id=?').get(id),n=db.prepare('SELECT count(*) n FROM audit').get().n
 await call('/api/extensions/'+xid+'/review','supervisor',{decision:'approve',reason:'Should be refused now'},409)
 assert.deepEqual(db.prepare('SELECT * FROM complaints WHERE id=?').get(id),before);assert.equal(db.prepare('SELECT count(*) n FROM audit').get().n,n)
 assert.equal(db.prepare('SELECT state FROM extensions WHERE id=?').get(xid).state,'pending')
})
test('round 3: list order is deterministic for tied timestamps',async()=>{
 const a=await file('Tie A'),b=await file('Tie B');db.prepare('UPDATE complaints SET submittedTs=1 WHERE id IN (?,?)').run(a,b)
 const ids=(await call('/api/complaints?limit=100','alok')).complaints.map(c=>c.id),tied=ids.filter(i=>i===a||i===b)
 assert.deepEqual(tied,[a,b].sort().reverse())
 for(const q of ['%','_','\\'])assert.equal((await call('/api/complaints?q='+encodeURIComponent(q),'alok')).total,0)
})
test('round 3: a failing maintenance step is logged and does not stop later steps',()=>{
 const logs=[],realPrepare=db.prepare.bind(db);let hit=0
 db.prepare=(sql)=>{if(String(sql).startsWith('DELETE FROM tokens')){hit++;throw new Error('simulated db error')}return realPrepare(sql)}
 try{_runMaintenance(m=>logs.push(m))}finally{db.prepare=realPrepare}
 assert.equal(hit,1);assert.equal(logs.length,1);assert.match(logs[0],/token cleanup/)
 const logs2=[];_runMaintenance(m=>logs2.push(m));assert.deepEqual(logs2,[])
})
test('round 3: provisioning script rejects bad display names and creates nothing',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'prov-')),dbp=path.join(dir,'t.db'),run=(user,name)=>spawnSync(process.execPath,['scripts/provision-user.cjs',user,name,'official'],{input:'a-long-test-password-1\n',env:{...process.env,DB_PATH:dbp,DEMO_MODE:'false'},encoding:'utf8'})
 for(const [u,n] of [['prov1',''],['prov2','   '],['prov3','x'.repeat(101)],['prov4','bad\u0007name']])assert.notEqual(run(u,n).status,0,u)
 const ok=run('prov5','  Valid Name  ');assert.equal(ok.status,0,ok.stderr)
 const Database=require('better-sqlite3'),d=new Database(dbp,{readonly:true});
 assert.deepEqual(d.prepare("SELECT username,name FROM users WHERE username LIKE 'prov%'").all(),[{username:'prov5',name:'Valid Name'}]);d.close();fs.rmSync(dir,{recursive:true,force:true})
})
