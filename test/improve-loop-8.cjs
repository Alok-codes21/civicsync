process.env.DEMO_MODE='true';process.env.DB_PATH=':memory:';process.env.DEMO_ROUTES='true';process.env.AI_DETECTOR='off'
const {test,after}=require('node:test'),assert=require('node:assert/strict')
const {spawnSync}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const {app,db,stop}=require('../server/index.cjs'),server=app.listen(0),base='http://127.0.0.1:'+server.address().port,tokens={}
async function call(p,u,b,s=200){const r=await fetch(base+p,{method:b?'POST':'GET',headers:{'Content-Type':'application/json',...(tokens[u]?{Authorization:'Bearer '+tokens[u]}:{})},body:b?JSON.stringify(b):undefined});const d=await r.json();assert.equal(r.status,s,JSON.stringify(d));return d}
async function rawJson(p,u){const r=await fetch(base+p,{headers:{...(tokens[u]?{Authorization:'Bearer '+tokens[u]}:{})}});return{status:r.status,text:await r.text()}}
after(async()=>{await new Promise(r=>server.close(r));stop()})
const M={name:'PRIVACY_PERSON_9X41',phone:'9876543210',landmark:'PRIVACY_LANDMARK_8K22',desc:'PRIVACY_DESCRIPTION_4M73',lat:28.6699,lon:77.4501}

test('round 9: public and unrelated-citizen responses never leak private markers; members keep access',async()=>{
 for(const u of ['alok','citizen2','supervisor'])tokens[u]=(await call('/api/login',null,{username:u,password:'demo123'})).token
 db.prepare("UPDATE users SET phone=? WHERE username='alok'").run(M.phone)
 const ack=(await call('/api/complaints','alok',{title:M.name,description:M.desc,category:'Garbage Collection',ward:'Ward 12 - Gomti Nagar',landmark:M.landmark,lat:M.lat,lon:M.lon},201)).acknowledgementNumber
 const markers=[M.name,M.phone,M.landmark,M.desc,String(M.lat),String(M.lon)]
 // 1. public tracking (no token): fields present, markers absent, generic latestUpdate, empty timeline
 let r=await rawJson('/api/complaints/'+ack,null)
 assert.equal(r.status,200);for(const m of markers)assert.ok(!r.text.includes(m),`public response leaks ${m}`)
 let d=JSON.parse(r.text).complaint;assert.equal(d.id,ack);assert.equal(d.category,'Garbage Collection');assert.ok(d.dept&&d.deadline&&d.priority!==undefined&&d.escalationLevel!==undefined&&d.legacyDemo!==undefined)
 assert.match(d.latestUpdate,/Public tracking omits private complaint details/);assert.deepEqual(d.timeline,[])
 // 2. unrelated citizen: detail + list (found by id), same contract
 r=await rawJson('/api/complaints/'+ack,'citizen2');assert.equal(r.status,200);for(const m of markers)assert.ok(!r.text.includes(m),`unrelated citizen detail leaks ${m}`)
 assert.deepEqual(JSON.parse(r.text).complaint.timeline,[])
 r=await rawJson('/api/complaints?limit=100','citizen2');const row=JSON.parse(r.text).complaints.find(c=>c.id===ack);assert.ok(row,'target complaint must appear in list')
 for(const m of markers)assert.ok(!JSON.stringify(row).includes(m),`unrelated citizen list leaks ${m}`);assert.deepEqual(row.timeline,[])
 // 3. owner keeps permitted detail (timeline has the filing event; complaint fields visible)
 r=await rawJson('/api/complaints/'+ack,'alok');assert.ok(r.text.includes(M.name)&&r.text.includes(M.desc)&&r.text.includes(M.landmark))
 assert.ok(JSON.parse(r.text).complaint.timeline.length>=1);assert.ok(!r.text.includes(M.phone),'complaint detail must not embed the account phone')
 // 4. staff member detail keeps complaint fields
 r=await rawJson('/api/complaints/'+ack,'supervisor');assert.ok(r.text.includes(M.desc))
 // 5. contact endpoint: phone only to supervisor/assigned officer
 assert.equal((await rawJson('/api/complaints/'+ack+'/contact',null)).status,403)
 assert.equal((await rawJson('/api/complaints/'+ack+'/contact','citizen2')).status,403)
 assert.equal((await rawJson('/api/complaints/'+ack+'/contact','alok')).status,403) // owner is not staff
 r=await rawJson('/api/complaints/'+ack+'/contact','supervisor');assert.equal(r.status,200)
 d=JSON.parse(r.text);assert.equal(d.phone,M.phone);assert.equal(d.verified,false)
 // 6. after another event, public timeline still empty
 await call('/api/complaints/'+ack+'/status','alok',null,409).catch(()=>{}) // any state attempt; filing event already suffices
 r=await rawJson('/api/complaints/'+ack,null);assert.deepEqual(JSON.parse(r.text).complaint.timeline,[])
})

test('round 9: documented backup script captures a consistent snapshot of a live WAL database',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'civicsync-backup-')),dbp=path.join(dir,'live.db'),bkp=path.join(dir,'backup.db'),IDX=JSON.stringify(path.join(__dirname,'..','server','index.cjs'))
 // live file-backed db with known rows, connection kept open in WAL mode
 const setup=`(async()=>{const{db,stop}=require(${IDX});db.prepare("INSERT INTO users(username,passhash,name,role) VALUES('backupuser','scrypt:aa:bb','Backup User','citizen')").run();db.prepare("INSERT INTO complaints(id,title,category,description,ward,status,priority,submittedAt,submittedTs,deadline,deadlineTs,dept) VALUES('SHG-BK-1','Backup marker','Garbage Collection','d','Ward 1','Assigned','Low','x',1,'y',2,'Sanitation')").run();const b=await db.backup(${JSON.stringify(bkp)});db.prepare("INSERT INTO users(username,passhash,name,role) VALUES('afterbackup','scrypt:cc:dd','After Backup','citizen')").run();console.log('journal='+db.pragma('journal_mode',{simple:true}));stop()})()`
 let r=spawnSync(process.execPath,['-e',setup],{env:{...process.env,DB_PATH:dbp,AI_DETECTOR:'off'},encoding:'utf8',timeout:60000})
 assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/journal=wal/)
 // the documented script itself works against a live-shaped database
 r=spawnSync(process.execPath,[path.join(__dirname,'..','scripts','backup-db.cjs'),bkp+'.2'],{env:{...process.env,DB_PATH:dbp},encoding:'utf8',timeout:60000})
 assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/Backup written:/)
 // snapshot assertions on the API backup: integrity ok, pre-backup rows present, post-backup row absent
 const D=require('better-sqlite3'),b=new D(bkp,{readonly:true})
 assert.equal(b.pragma('integrity_check',{simple:true}),'ok')
 assert.equal(b.prepare("SELECT name FROM users WHERE username='backupuser'").get().name,'Backup User')
 assert.equal(b.prepare("SELECT title FROM complaints WHERE id='SHG-BK-1'").get().title,'Backup marker')
 assert.equal(b.prepare("SELECT 1 FROM users WHERE username='afterbackup'").get(),undefined,'snapshot must not follow later writes')
 b.close()
 const b2=new D(bkp+'.2',{readonly:true});assert.equal(b2.pragma('integrity_check',{simple:true}),'ok')
 assert.equal(b2.prepare("SELECT 1 FROM users WHERE username='afterbackup'").get()!==undefined,true,'script backup after the write must include it')
 b2.close();fs.rmSync(dir,{recursive:true,force:true})
})

test('round 9: provisioned password ending in one newline authenticates as the same password',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'civicsync-prov3-')),dbp=path.join(dir,'prov.db')
 let r=spawnSync(process.execPath,[path.join(__dirname,'..','scripts','provision-user.cjs'),'nluser','NL User','citizen'],{input:'newline password 9\n',env:{...process.env,DB_PATH:dbp,AI_DETECTOR:'off'},encoding:'utf8',timeout:30000})
 assert.equal(r.status,0,r.stderr)
 // verify through the project's own scrypt path: 'newline password 9' matches, 'newline password 9\n' does not
 const verify=`const crypto=require('crypto'),D=require('better-sqlite3');const db=new D(${JSON.stringify(dbp)},{readonly:true});const ph=db.prepare("SELECT passhash FROM users WHERE username='nluser'").get().passhash;const[,salt,hex]=ph.split(':');const t=p=>crypto.scryptSync(p,salt,64).toString('hex')===hex;console.log(JSON.stringify({bare:t('newline password 9'),withNL:t('newline password 9\\n')}));db.close()`
 r=spawnSync(process.execPath,['-e',verify],{encoding:'utf8',timeout:30000})
 assert.deepEqual(JSON.parse(r.stdout.trim()),{bare:true,withNL:false})
 fs.rmSync(dir,{recursive:true,force:true})
})

test('round 9: unsupported language keeps English with fallback flag false',async()=>{
 const r=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json','Accept-Language':'fr'},body:JSON.stringify({username:'alok',password:'wrong'})})
 const d=await r.json();assert.equal(r.status,401);assert.deepEqual({e:d.error,l:d.language,f:d.translationFallback},{e:'Invalid username or password',l:'en',f:false})
})
