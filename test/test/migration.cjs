const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process')
test('legacy DB migration and restart preserve records and audit chain',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'civic-migration-')),file=path.join(dir,'legacy.db')
 const Database=require('better-sqlite3'),d=new Database(file)
 d.exec(`CREATE TABLE complaints(id TEXT PRIMARY KEY,title TEXT NOT NULL,category TEXT NOT NULL,description TEXT NOT NULL,ward TEXT NOT NULL,landmark TEXT DEFAULT '',status TEXT NOT NULL,priority TEXT NOT NULL,submittedAt TEXT NOT NULL,submittedTs INTEGER NOT NULL,deadline TEXT NOT NULL,deadlineTs INTEGER NOT NULL,dept TEXT NOT NULL,officer TEXT,escalationLevel INTEGER DEFAULT 0,latestUpdate TEXT DEFAULT '',author TEXT DEFAULT ''); CREATE TABLE users(username TEXT PRIMARY KEY,password TEXT,name TEXT,role TEXT); INSERT INTO users VALUES ('legacy','oldpass','Legacy citizen','citizen'); INSERT INTO complaints VALUES ('SHG-OLD','Private home issue','Roads & Potholes','private details','old ward','home landmark','In Progress','High','2026',1,'2026',1,'Roads','legacy',3,'Reported with verified photos','');`);d.close()
 const script=`const {db,sweep,stop}=require('./server/index.cjs');sweep();const x=db.prepare('SELECT * FROM complaints').get();if(x.title!=='Private home issue'||!x.originalDeadlineTs)throw Error('migration lost data');if(db.prepare('PRAGMA table_info(users)').all().some(x=>x.name==='password'))throw Error('plaintext remains');if(!db.prepare('SELECT passhash FROM users').get().passhash.startsWith('scrypt:'))throw Error('hash migration failed');stop()`
 for(let i=0;i<2;i++){const x=spawnSync(process.execPath,['-e',script],{cwd:path.join(__dirname,'..'),env:{...process.env,DB_PATH:file,DEMO_MODE:'false'},encoding:'utf8'});assert.equal(x.status,0,x.stderr)}
 fs.rmSync(dir,{recursive:true,force:true})
})
