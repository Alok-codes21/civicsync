process.env.DEMO_MODE='true';process.env.DB_PATH=':memory:';process.env.DEMO_ROUTES='true';process.env.AI_DETECTOR='off'
const {test,after}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http')
const {spawnSync}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const {app,db,stop}=require('../server/index.cjs'),server=app.listen(0),port=server.address().port,base='http://127.0.0.1:'+port,tokens={}
async function raw(path,user,{method='GET',body,headers={}}={}){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(tokens[user]?{Authorization:'Bearer '+tokens[user]}:{}),...headers},body});return r}
async function call(path,user,body,status=200){const r=await raw(path,user,{method:body?'POST':'GET',body:body?JSON.stringify(body):undefined});const d=await r.json();assert.equal(r.status,status,JSON.stringify(d));return d}
const file=async title=>(await call('/api/complaints','alok',{title,description:'Synthetic regression',category:'Garbage Collection',ward:'Ward 12 - Gomti Nagar',lat:28.6743,lon:77.3834},201)).acknowledgementNumber
const getNoAL=p=>new Promise((res,rej)=>{const q=http.request({port,host:'127.0.0.1',path:p},r=>{let b='';r.on('data',c=>b+=c);r.on('end',()=>res({status:r.statusCode,body:b}))});q.on('error',rej);q.end()})
after(async()=>{await new Promise(r=>server.close(r));stop()})

test('round 6: jurisdictions status reports real provenance sources',async()=>{
 const j=await call('/api/jurisdictions',null)
 assert.equal(j.status,'partial_2022_sbm_unverified');assert.equal(j.wardCount,94);assert.equal(j.expectedWards,100)
 assert.deepEqual(j.missingWards,[79,81,87,98,99,100]);assert.equal(j.verifiedAsOf,'2026-10-13')
 assert.ok(j.sources&&typeof j.sources==='object','sources must be populated, not undefined')
 assert.equal(j.sources.dataset,'ghaziabad-wards-2022-sbm.geojson')
 assert.match(j.sources.source,/Swachh Bharat Mission/);assert.ok(Array.isArray(j.sources.redistributors)&&j.sources.redistributors.length>=2)
 assert.equal(j.sources.recordsDated,'2021-12-30 to 2022-03-13');assert.ok(j.sources.rejectedSources>=1)
 // provenance manifest and GeoJSON metadata agree on counts
 const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'..','data','ghaziabad','provenance.json'),'utf8')),wards=JSON.parse(fs.readFileSync(path.join(__dirname,'..','data','ghaziabad','ghaziabad-wards-2022-sbm.geojson'),'utf8'))
 assert.equal(manifest.loadedDataset.wardCount,wards.metadata.wardCount);assert.equal(manifest.loadedDataset.expectedWards,wards.metadata.expectedWards)
})

test('round 6: repeated lang query parameter falls back to English, never a 500',async()=>{
 tokens.alok=(await call('/api/login',null,{username:'alok',password:'demo123'})).token
 const r=await getNoAL('/api/complaints?lang=hi&lang=en&mine=true');assert.equal(r.status,401) // not logged in via this client, but no crash
 assert.doesNotThrow(()=>JSON.parse(r.body));assert.equal(JSON.parse(r.body).language,'en')
 const ok=await getNoAL('/api/health?lang=hi&lang=en');assert.equal(ok.status,200)
 // normal Hindi behaviour unchanged
 const hi=await raw('/api/login',null,{method:'POST',body:JSON.stringify({username:'alok',password:'wrong'}),headers:{'Accept-Language':'hi'}})
 const hd=await hi.json();assert.equal(hd.language,'hi');assert.equal(hd.error,'उपयोगकर्ता नाम या पासवर्ड गलत है');assert.equal(hd.translationFallback,false)
})

test('round 6: audit verifier detects deliberate tampering',async()=>{
 tokens.supervisor=(await call('/api/login',null,{username:'supervisor',password:'demo123'})).token
 await file('Audit tamper target');await file('Audit tamper target 2')
 let a=await call('/api/audit','supervisor');assert.equal(a.valid,true)
 const trig="CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT,'append only'); END;"
 const orig=db.prepare('SELECT afterJson FROM audit ORDER BY seq LIMIT 1').get().afterJson
 try{
  db.prepare('DROP TRIGGER audit_no_update').run()
  db.prepare("UPDATE audit SET afterJson='{\"tampered\":true}' WHERE seq=(SELECT min(seq) FROM audit)").run()
  a=await call('/api/audit','supervisor');assert.equal(a.valid,false,'changed payload must invalidate the chain')
  db.prepare('UPDATE audit SET afterJson=? WHERE seq=(SELECT min(seq) FROM audit)').run(orig)
  a=await call('/api/audit','supervisor');assert.equal(a.valid,true,'restored payload verifies again')
  db.prepare("UPDATE audit SET prevHash='broken' WHERE seq=(SELECT max(seq) FROM audit)").run()
  a=await call('/api/audit','supervisor');assert.equal(a.valid,false,'broken prevHash link must invalidate the chain')
 }finally{db.prepare(trig).run()}
})

test('round 6: legacy plaintext-password migration is atomic',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'civicsync-mig-')),dbp=path.join(dir,'legacy.db'),D=require('better-sqlite3')
 const mk=trigger=>{const d=new D(dbp);d.exec('CREATE TABLE users(username TEXT PRIMARY KEY, password TEXT NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL)')
  d.prepare('INSERT INTO users VALUES(?,?,?,?)').run('legacy1','pw-one','Legacy One','citizen');d.prepare('INSERT INTO users VALUES(?,?,?,?)').run('legacy2','pw-two','Legacy Two','citizen')
  if(trigger)d.exec('CREATE TRIGGER block_user_update BEFORE UPDATE ON users BEGIN SELECT RAISE(ABORT,\'forced migration failure\'); END;');d.close()}
 const env={...process.env,DB_PATH:dbp,AI_DETECTOR:'off'}
 const probe='const{db}=require('+JSON.stringify(path.join(__dirname,'..','server','index.cjs'))+');const c=db.prepare("PRAGMA table_info(users)").all().map(x=>x.name);const u=db.prepare("SELECT passhash FROM users WHERE username=\'legacy1\'").get();console.log(JSON.stringify({migrated:c.includes("passhash")&&!c.includes("password"),hash:u&&u.passhash.startsWith("scrypt:")}));process.exit(0)'
 // success case: all rows re-hashed, old column gone, restart-safe
 mk(false);let r=spawnSync(process.execPath,['-e',probe],{env,encoding:'utf8',timeout:60000})
 assert.equal(r.status,0,r.stderr);assert.deepEqual(JSON.parse(r.stdout.trim().split('\n').pop()),{migrated:true,hash:true})
 r=spawnSync(process.execPath,['-e',probe],{env,encoding:'utf8',timeout:60000});assert.equal(r.status,0,r.stderr) // second start: no re-migration
 // failure case: an UPDATE failure mid-migration rolls the whole transaction back
 fs.rmSync(dbp);mk(true)
 r=spawnSync(process.execPath,['-e',probe],{env,encoding:'utf8',timeout:60000});assert.notEqual(r.status,0,'migration must fail loudly')
 const d=new D(dbp,{readonly:true});const cols=d.prepare('PRAGMA table_info(users)').all().map(x=>x.name)
 assert.ok(cols.includes('password')&&!cols.includes('passhash'),'rollback keeps the legacy schema, no half migration')
 assert.equal(d.prepare('SELECT password FROM users WHERE username=?').get('legacy1').password,'pw-one');d.close()
 fs.rmSync(dir,{recursive:true,force:true})
})

test('round 6: demo exits cleanly on success and on forced failure',()=>{
 for(const [env,want,wantOut] of [[{},0,/Audit chain valid: true/],[{DEMO_FORCE_FAIL:'1'},1,/DEMO FAILED: forced failure/]]){
  const r=spawnSync(process.execPath,[path.join(__dirname,'..','scripts','demo.cjs')],{env:{...process.env,...env},encoding:'utf8',timeout:120000})
  assert.ok(!r.error||!r.error.code||r.error.code!=='ETIMEDOUT','demo must not hang on cleanup')
  assert.equal(r.status,want,(r.stderr||'').slice(0,400));assert.match(r.stdout+r.stderr,wantOut)
 }
})
