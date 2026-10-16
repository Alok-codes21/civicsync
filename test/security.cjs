process.env.AI_DETECTOR='off' // tests are deterministic whether or not weights are installed
const {test,after}=require('node:test'),assert=require('node:assert/strict'),crypto=require('crypto'),sharp=require('sharp')
process.env.DEMO_MODE='true';process.env.DB_PATH=':memory:';delete process.env.DEMO_ROUTES
const {app,db,stop,retention,_loginFailures}=require('../server/index.cjs')
const server=app.listen(0),base='http://127.0.0.1:'+server.address().port,tokens={}
async function request(path,method='GET',body,user){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(tokens[user]?{Authorization:'Bearer '+tokens[user]}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()}}
async function login(user,password='demo123'){return request('/api/login','POST',{username:user,password})}
const body={title:'Water logging',description:'Near the main gate',category:'Roads & Potholes',ward:'Arthala',lat:28.67,lon:77.38}
let png
after(async()=>{await new Promise(r=>server.close(r));stop()})

test('setup: logins, a complaint and a valid png',async()=>{
  for(const u of ['alok','citizen2','supervisor'])tokens[u]=(await login(u)).data.token
  const r=await request('/api/complaints','POST',body,'alok');assert.equal(r.status,201);id=r.data.acknowledgementNumber
  const r2=await request('/api/complaints','POST',{...body,title:'Second'},'citizen2');assert.equal(r2.status,201);id2=r2.data.acknowledgementNumber
  let raw=Buffer.alloc(16*16*3);for(let i=0;i<raw.length;i++)raw[i]=(i*13)%256
  png=(await sharp(raw,{raw:{width:16,height:16,channels:3}}).png().toBuffer()).toString('base64')
})
let id,id2
test('login validates types and lengths before hashing; oversized password rejected fast',async()=>{
  for(const b of [{username:'alok'},{password:'demo123'},{username:1,password:'demo123'},{username:'alok',password:42},{username:'alok',password:['x']},{username:'a'.repeat(65),password:'demo123'},{username:'alok',password:'x'.repeat(129)},{username:'alok',password:'x'.repeat(200000)}]){
    const started=Date.now(),r=await request('/api/login','POST',b)
    assert.equal(r.status,400,JSON.stringify(b).slice(0,60));assert.ok(Date.now()-started<2000,'rejection must happen before scrypt')
  }
  assert.equal((await login('alok')).status,200) // normal login still works
})
test('bearer tokens stored hashed; raw token absent from database; logout revokes',async()=>{
  const r=await login('alok');assert.equal(r.status,200)
  const raw=r.data.token,hashed=crypto.createHash('sha256').update(raw).digest('hex')
  const row=db.prepare('SELECT token FROM tokens WHERE token=?').get(hashed)
  assert.ok(row,'hashed token row exists');assert.notEqual(row.token,raw)
  assert.equal(db.prepare('SELECT COUNT(*) n FROM tokens WHERE token=?').get(raw).n,0)
  const me=await fetch(base+'/api/me',{headers:{Authorization:'Bearer '+raw}});assert.equal(me.status,200)
  const out=await fetch(base+'/api/logout',{method:'POST',headers:{Authorization:'Bearer '+raw}});assert.equal(out.status,200)
  assert.equal(db.prepare('SELECT COUNT(*) n FROM tokens WHERE token=?').get(hashed).n,0)
  const me2=await fetch(base+'/api/me',{headers:{Authorization:'Bearer '+raw}});assert.equal(me2.status,401)
})
test('login failure map stays bounded under many distinct usernames',async()=>{
  // unknown users now run a dummy scrypt too (timing equalisation); stub scrypt here so 1100 attempts stay fast. The map-bound logic is what this test checks.
  const nodeCrypto=require('node:crypto'),realScrypt=nodeCrypto.scrypt;nodeCrypto.scrypt=(pw,salt,len,cb)=>setImmediate(()=>cb(null,Buffer.alloc(len)))
  try{for(let i=0;i<1100;i++){const r=await login('nosuch'+i,'wrongpass');assert.equal(r.status,401)}}finally{nodeCrypto.scrypt=realScrypt}
  assert.ok(_loginFailures.size<=1000,'map size '+_loginFailures.size)
  assert.equal((await login('alok')).status,200)
})
test('upload rejects bad stage, mime, base64, size and signature before any processing',async()=>{
  const ev=(extra,user='alok')=>request('/api/complaints/'+id+'/evidence','POST',extra,user)
  assert.equal((await ev({stage:'mid',mime:'image/png',base64:png})).status,400)
  assert.equal((await ev({stage:'after',mime:'image/png',base64:png})).status,403) // citizen cannot submit repair evidence
  assert.equal((await ev({stage:'before',mime:'image/gif',base64:png})).status,400)
  assert.equal((await ev({stage:'before',mime:'image/png',base64:png.slice(0,-4)+'####'})).status,400)
  assert.equal((await ev({stage:'before',mime:'image/jpeg',base64:png})).status,400) // signature mismatch
  assert.equal((await ev({stage:'before',mime:'image/png',base64:Buffer.from([137,80,78,71,13,10,26,10]).toString('base64')})).status,400) // signature-only, decode fails
  const big=Buffer.alloc(4*1024*1024+16);Buffer.from([137,80,78,71,13,10,26,10]).copy(big)
  assert.equal((await ev({stage:'before',mime:'image/png',base64:big.toString('base64')})).status,400) // decoded byte size
  const huge='A'.repeat(5600001)
  const r=await ev({stage:'before',mime:'image/png',base64:huge});assert.equal(r.status,400) // encoded length
})
test('per-user upload rate limit after 20 validated uploads in the window',async()=>{
  const ev=()=>request('/api/complaints/'+id2+'/evidence','POST',{stage:'before',mime:'image/png',base64:png},'citizen2')
  let last
  for(let i=0;i<20;i++){last=await ev();assert.equal(last.status,201,'upload '+i+': '+JSON.stringify(last.data))}
  const r=await ev();assert.equal(r.status,429);assert.match(r.data.error,/Too many uploads/)
})
test('stored evidence is re-encoded with metadata stripped',async()=>{
  const withExif=await sharp(Buffer.from(png,'base64')).withExif({IFD0:{Copyright:'secret-owner-tag',ImageDescription:'private note'}}).jpeg({quality:95}).toBuffer()
  const r=await request('/api/complaints/'+id+'/evidence','POST',{stage:'before',mime:'image/jpeg',base64:withExif.toString('base64')},'alok')
  assert.equal(r.status,201,JSON.stringify(r.data))
  const served=await fetch(base+'/api/evidence/'+r.data.evidenceId,{headers:{Authorization:'Bearer '+tokens.alok}})
  assert.equal(served.status,200)
  const stored=Buffer.from(await served.arrayBuffer())
  const meta=await sharp(stored).metadata()
  assert.equal(meta.format,'jpeg');assert.equal(meta.exif,undefined)
  assert.ok(!stored.includes('secret-owner-tag'),'EXIF content must not survive into the stored copy')
  assert.ok(stored.length<withExif.length+1000,'stored copy is the re-encoded image')
})
test('retention redacts author, ward and latestUpdate; keeps accountability fields; idempotent',async()=>{
  db.prepare("UPDATE complaints SET status='Resolved',resolvedTs=?,latestUpdate=? WHERE id=?").run(Date.now()-91*86400000,'Resolved with contractor contact 98xxxxxx',id)
  const r=retention()
  assert.ok(r.complaintsRedacted>=1)
  const c=db.prepare('SELECT * FROM complaints WHERE id=?').get(id)
  assert.equal(c.author,'retention-redacted');assert.equal(c.ward,'[retention redacted]');assert.equal(c.latestUpdate,'[retention redacted]')
  assert.equal(c.lat,null);assert.equal(c.title,'[retention redacted]');assert.equal(c.description,'[retention redacted]')
  assert.equal(c.status,'Resolved');assert.ok(c.deadlineTs) // accountability fields retained
  const again=retention();assert.equal(again.complaintsRedacted,0);assert.equal(again.evidenceRemoved,0)
  assert.deepEqual(retention().fieldsRedacted,['title','description','landmark','coordinates','ward','latestUpdate'])
})
test('severity review never extends a deadline: High shortens, Low keeps, original SLA immutable',async()=>{
  const c0=db.prepare('SELECT * FROM complaints WHERE id=?').get(id2)
  const hi=await request('/api/complaints/'+id2+'/priority','POST',{priority:'High',reason:'Unsafe edge collapse'},'supervisor')
  assert.equal(hi.status,200)
  const c1=db.prepare('SELECT * FROM complaints WHERE id=?').get(id2)
  assert.ok(c1.deadlineTs<c0.deadlineTs,'raising severity pulls the deadline in')
  assert.equal(c1.originalDeadlineTs,c0.originalDeadlineTs,'original SLA untouched')
  const lo=await request('/api/complaints/'+id2+'/priority','POST',{priority:'Low',reason:'Reassessed as minor'},'supervisor')
  assert.equal(lo.status,200)
  const c2=db.prepare('SELECT * FROM complaints WHERE id=?').get(id2)
  assert.equal(c2.deadlineTs,c1.deadlineTs,'lowering severity never extends the deadline; extensions only')
})
