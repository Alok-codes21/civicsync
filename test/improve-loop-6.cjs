process.env.DEMO_MODE='true';process.env.DB_PATH=':memory:';process.env.AI_DETECTOR='off'
const {test}=require('node:test'),assert=require('node:assert/strict')
const {spawnSync}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const SRV=path.join(__dirname,'..','server','index.cjs'),IDX=JSON.stringify(SRV)
const env=x=>({...process.env,AI_DETECTOR:'off',...x})

test('round 7: invalid explicit PORT fails at startup with a clear diagnostic',()=>{
 for(const bad of ['abc','70000','12x','-5','0','3.5']){
  const r=spawnSync(process.execPath,[SRV],{env:env({PORT:bad,DB_PATH:':memory:'}),encoding:'utf8',timeout:30000})
  assert.notEqual(r.status,0,`PORT=${bad} must fail`);assert.match(r.stderr,/PORT must be an integer between 1 and 65535/,`PORT=${bad}: ${r.stderr.slice(0,200)}`)
 }
})
test('round 7: valid explicit PORT starts and listens',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'civicsync-port-'))
 const r=spawnSync(process.execPath,[SRV],{env:env({PORT:'8412',DB_PATH:path.join(dir,'ok.db')}),encoding:'utf8',timeout:8000,killSignal:'SIGTERM'})
 assert.match(r.stdout,/CivicSync backend on http:\/\/127\.0\.0\.1:8412/,r.stderr.slice(0,300)) // timeout-killed after successful listen
 fs.rmSync(dir,{recursive:true,force:true})
})
test('round 7: unopenable DB_PATH fails with a clear diagnostic, not a raw stack',()=>{
 const r=spawnSync(process.execPath,[SRV],{env:env({DB_PATH:'/tmp/civicsync-no-such-dir-xyz/db.sqlite'}),encoding:'utf8',timeout:30000})
 assert.notEqual(r.status,0);assert.match(r.stderr,/Startup error: cannot open database at DB_PATH=\/tmp\/civicsync-no-such-dir-xyz\/db\.sqlite/)
 assert.doesNotMatch(r.stderr.split('\n')[0],/^\s*at\s/)
})
test('round 7: file database reports effective WAL journal mode and foreign_keys on',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'civicsync-pragma-')),dbp=path.join(dir,'p.db')
 const probe=`const{db,stop}=require(${IDX});console.log(JSON.stringify({j:db.pragma('journal_mode',{simple:true}),fk:db.pragma('foreign_keys',{simple:true})}));stop();process.exit(0)`
 let r=spawnSync(process.execPath,['-e',probe],{env:env({DB_PATH:dbp}),encoding:'utf8',timeout:30000})
 assert.equal(r.status,0,r.stderr);assert.deepEqual(JSON.parse(r.stdout.trim().split('\n').pop()),{j:'wal',fk:1})
 r=spawnSync(process.execPath,['-e',probe],{env:env({DB_PATH:dbp}),encoding:'utf8',timeout:30000}) // reopened connection: settings still fine
 assert.equal(r.status,0,r.stderr);assert.deepEqual(JSON.parse(r.stdout.trim().split('\n').pop()),{j:'wal',fk:1})
 fs.rmSync(dir,{recursive:true,force:true})
})
test('round 7: restart against an existing current database is non-destructive and idempotent',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'civicsync-restart-')),dbp=path.join(dir,'keep.db')
 const setup=`const{db,stop}=require(${IDX});db.prepare("INSERT INTO users(username,passhash,name,role) VALUES(?,?,?,?)").run('keepuser','scrypt:aa:bb','Keep User','citizen');db.prepare("INSERT INTO complaints(id,title,category,description,ward,status,priority,submittedAt,submittedTs,deadline,deadlineTs,dept) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run('SHG-TEST-1','Keep me','Garbage Collection','d','Ward 1','Assigned','Low','x',1,'y',2,'Sanitation');stop();process.exit(0)`
 const probe=`const{db,stop}=require(${IDX});const u=db.prepare("SELECT passhash FROM users WHERE username='keepuser'").get();const c=db.prepare("SELECT title FROM complaints WHERE id='SHG-TEST-1'").get();const seeded=db.prepare("SELECT count(*) n FROM users WHERE username IN ('alok','supervisor','reviewer','verma')").get().n;console.log(JSON.stringify({keepHash:u&&u.passhash,keepTitle:c&&c.title,seeded}));stop();process.exit(0)`
 let r=spawnSync(process.execPath,['-e',setup],{env:env({DB_PATH:dbp}),encoding:'utf8',timeout:30000});assert.equal(r.status,0,r.stderr)
 for(let i=0;i<2;i++){ // two restarts: data preserved, startup idempotent
  r=spawnSync(process.execPath,['-e',probe],{env:env({DB_PATH:dbp}),encoding:'utf8',timeout:30000})
  assert.equal(r.status,0,r.stderr)
  assert.deepEqual(JSON.parse(r.stdout.trim().split('\n').pop()),{keepHash:'scrypt:aa:bb',keepTitle:'Keep me',seeded:4})
 }
 fs.rmSync(dir,{recursive:true,force:true})
})
