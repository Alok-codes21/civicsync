process.env.DEMO_MODE='true';process.env.DB_PATH=':memory:';process.env.DEMO_ROUTES='true';process.env.AI_DETECTOR='off'
const {test,after}=require('node:test'),assert=require('node:assert/strict')
const {spawnSync}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const {app,stop}=require('../server/index.cjs'),server=app.listen(0),base='http://127.0.0.1:'+server.address().port
after(async()=>{await new Promise(r=>server.close(r));stop()})
const PROV=path.join(__dirname,'..','scripts','provision-user.cjs')
const prov=(args,input,dbp)=>spawnSync(process.execPath,[PROV,...args],{input,env:{...process.env,DB_PATH:dbp,AI_DETECTOR:'off'},encoding:'utf8',timeout:30000})

test('round 8: provision-user rejects bad input without creating an account',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'civicsync-prov-')),dbp=path.join(dir,'prov.db'),D=require('better-sqlite3')
 let r=prov([],'',dbp);assert.notEqual(r.status,0);assert.match(r.stderr,/Usage/)
 r=prov(['newuser1','New User','citizen'],'',dbp);assert.notEqual(r.status,0);assert.match(r.stderr,/12\+ character password/)
 r=prov(['newuser1','New User','citizen'],'only eleven',dbp);assert.notEqual(r.status,0) // 11 chars
 r=prov(['newuser1','New User','citizen'],'x'.repeat(513),dbp);assert.notEqual(r.status,0);assert.match(r.stderr,/too long/)
 r=prov(['newuser1','New User','admin'],'valid password 123',dbp);assert.notEqual(r.status,0);assert.match(r.stderr,/Usage/)
 r=prov(['newuser1','  bad\x01name  ','citizen'],'valid password 123',dbp);assert.notEqual(r.status,0);assert.match(r.stderr,/Display name/)
 assert.ok(!fs.existsSync(dbp),'validation failures must not even create the database file')
 fs.rmSync(dir,{recursive:true,force:true})
})
test('round 8: provision-user happy paths, newline handling, duplicate safety, db closed',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'civicsync-prov2-')),dbp=path.join(dir,'prov.db'),D=require('better-sqlite3')
 let r=prov(['newuser1','New User','citizen'],'valid password 123',dbp);assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/Local account created: newuser1 citizen/)
 r=prov(['newuser2','New User','reviewer'],'valid password 123\n',dbp);assert.equal(r.status,0,r.stderr)
 r=prov(['newuser3','New User','supervisor'],'valid password 123\r\n',dbp);assert.equal(r.status,0,r.stderr)
 r=prov(['newuser4','New User','intake'],'x'.repeat(512),dbp);assert.equal(r.status,0,r.stderr) // exactly 512 chars is accepted
 const d=new D(dbp,{readonly:true})
 const u1=d.prepare("SELECT passhash,name FROM users WHERE username='newuser1'").get()
 assert.match(u1.passhash,/^scrypt:[0-9a-f]{32}:[0-9a-f]{128}$/);assert.equal(u1.name,'New User')
 d.close()
 // duplicate username: nonzero, original hash untouched, and the db is usable again (the database stays open and usable after a duplicate-account failure)
 r=prov(['newuser1','Other Name','official'],'different password 456',dbp);assert.notEqual(r.status,0);assert.match(r.stderr,/not overwritten/)
 const d2=new D(dbp,{readonly:true})
 assert.equal(d2.prepare("SELECT name FROM users WHERE username='newuser1'").get().name,'New User')
 assert.equal(d2.prepare("SELECT count(*) n FROM users WHERE username LIKE 'newuser%'").get().n,4)
 d2.close();fs.rmSync(dir,{recursive:true,force:true})
})
test('round 8: i18n translation and fallback coverage table',async()=>{
 const login=async(lang)=>{const r=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json',...(lang?{'Accept-Language':lang}:{})},body:JSON.stringify({username:'alok',password:'wrong'})});return{s:r.status,d:await r.json()}}
 let x=await login('hi');assert.equal(x.s,401);assert.deepEqual({e:x.d.error,l:x.d.language,f:x.d.translationFallback},{e:'उपयोगकर्ता नाम या पासवर्ड गलत है',l:'hi',f:false})
 x=await login('hi-IN');assert.equal(x.d.error,'उपयोगकर्ता नाम या पासवर्ड गलत है');assert.equal(x.d.language,'hi')
 x=await login('fr');assert.equal(x.s,401);assert.deepEqual({e:x.d.error,l:x.d.language},{e:'Invalid username or password',l:'en'})
 // known message, another endpoint
 let r=await fetch(base+'/api/complaints?mine=true',{headers:{'Accept-Language':'hi'}});let d=await r.json()
 assert.equal(r.status,401);assert.deepEqual({e:d.error,f:d.translationFallback},{e:'लॉगिन आवश्यक है',f:false})
 r=await fetch(base+'/api/complaints/SHG-2099-9999',{headers:{'Accept-Language':'hi'}});d=await r.json()
 assert.equal(r.status,404);assert.deepEqual({e:d.error,f:d.translationFallback},{e:'शिकायत नहीं मिली',f:false})
 // unknown message: English preserved, fallback flagged, status unchanged
 const tok=(await (await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'alok',password:'demo123'})})).json()).token
 r=await fetch(base+'/api/jurisdictions/officer-hints?ward=1',{headers:{'Accept-Language':'hi',Authorization:'Bearer '+tok}});d=await r.json()
 assert.equal(r.status,403);assert.deepEqual({e:d.error,l:d.language,f:d.translationFallback},{e:'Reviewer or supervisor required',l:'hi',f:true})
 // machine fields survive translation: acknowledgementNumber responses keep their ack number
 const f=await fetch(base+'/api/complaints',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+tok,'Accept-Language':'hi'},body:JSON.stringify({title:'i18n table',description:'synthetic',category:'Garbage Collection',ward:'Ward 12 - Gomti Nagar'})})
 d=await f.json();assert.equal(f.status,201);assert.match(d.acknowledgementNumber,/^SHG-\d{4}-[0-9A-F]+$/);assert.equal(d.language,'hi');assert.equal(d.message,'शिकायत दर्ज हुई; मानव समीक्षा आवश्यक है')
})
