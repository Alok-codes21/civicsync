const {test,after}=require('node:test')
const assert=require('node:assert/strict')
process.env.DEMO_MODE='true';process.env.DB_PATH=':memory:';delete process.env.DEMO_ROUTES
const phone=require('../server/phone.cjs')
const {app,db,stop}=require('../server/index.cjs')
const server=app.listen(0),base='http://127.0.0.1:'+server.address().port
async function req(path,body,token){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json(),text:null}}
const login=async u=>(await req('/api/login',{username:u,password:'demo123'})).body.token
const base0={title:'Test',description:'Needs fix',category:'Garbage Collection',ward:'Ghaziabad Ward 50'}
after(async()=>{await new Promise(r=>server.close(r));stop()})

test('format check only: Indian mobile, +91 optional, junk rejected',()=>{
 assert.equal(phone.normalize('98765 43210'),'+919876543210');assert.equal(phone.normalize('+91-9876543210'),'+919876543210')
 for(const bad of ['12345','5876543210','+1 5555550100','abcdefghij',null,12345,'98765432101'])assert.equal(phone.normalize(bad),null)
})
test('filing saves the number, rejects bad format, and phone is optional',async()=>{
 const t=await login('alok')
 assert.equal((await req('/api/complaints',{...base0,phone:'123'},t)).status,400)
 assert.equal((await req('/api/complaints',base0,t)).status,201)
 const r=await req('/api/complaints',{...base0,phone:'9876543210'},t);assert.equal(r.status,201)
 assert.equal(db.prepare("SELECT phone FROM users WHERE username='alok'").get().phone,'+919876543210')
 globalThis.cid=r.body.acknowledgementNumber
})
test('number never appears in public/owner/detail responses, audit or timeline',async()=>{
 const t=await login('alok'),needle='9876543210'
 for(const [path,tok] of [['/api/complaints/'+cid,null],['/api/complaints/'+cid,t],['/api/complaints',null],['/api/complaints?mine=true',t],['/api/audit',await login('supervisor')],['/api/me',t]]){
  const r=await req(path,null,tok);assert.equal(JSON.stringify(r.body).includes(needle),false,path)
 }
 assert.equal(JSON.stringify(db.prepare('SELECT beforeJson,afterJson FROM audit').all()).includes(needle),false)
})
test('contact endpoint: only supervisor or assigned officer; every read audited',async()=>{
 const sup=await login('supervisor'),ver=await login('verma'),own=await login('alok'),rev=await login('reviewer')
 assert.equal((await req(`/api/complaints/${cid}/contact`)).status,403)
 assert.equal((await req(`/api/complaints/${cid}/contact`,null,own)).status,403)
 assert.equal((await req(`/api/complaints/${cid}/contact`,null,rev)).status,403)
 assert.equal((await req(`/api/complaints/${cid}/contact`,null,ver)).status,403,'officer not assigned to this complaint')
 const ok=await req(`/api/complaints/${cid}/contact`,null,sup);assert.equal(ok.status,200)
 assert.equal(ok.body.phone,'+919876543210');assert.equal(ok.body.verified,false)
 assert.equal(db.prepare("SELECT count(*) n FROM audit WHERE complaintId=? AND action='Citizen contact viewed'").get(cid).n,1)
})
test('assigned officer can read; citizen can update own number; staff cannot use it',async()=>{
 const sup=await login('supervisor'),ver=await login('verma'),own=await login('alok')
 await req('/api/routes',{ward:'Ghaziabad Ward 50',category:'Garbage Collection',dept:'Demo',officer:'verma',supervisor:'supervisor',reason:'Demo route config'},sup)
 const c=(await req('/api/complaints',{...base0,phone:'9123456789'},own)).body.acknowledgementNumber
 assert.equal(db.prepare('SELECT officer FROM complaints WHERE id=?').get(c).officer,'verma')
 assert.equal((await req(`/api/complaints/${c}/contact`,null,ver)).body.phone,'+919123456789')
 assert.equal((await req('/api/me/phone',{phone:'bad'},own)).status,400)
 assert.equal((await req('/api/me/phone',{phone:'9000000001'},ver)).status,403)
 assert.equal((await req('/api/me/phone',{phone:'9000000001'})).status,401)
 const s=await req('/api/me/phone',{phone:'9000000001'},own);assert.equal(s.body.verified,false)
})
test('no OTP/SMS surface remains and capabilities say so',async()=>{
 for(const p of ['/api/phone/otp/request','/api/phone/otp/verify'])assert.equal((await req(p,{phone:'9876543210'},await login('alok'))).status,404)
 assert.equal((await req('/api/capabilities')).body.identity.phoneNumber,'saved_unverified_no_otp_no_sms')
 assert.equal(require('fs').existsSync(require('path').join(__dirname,'..','server','twilio-sender.cjs')),false)
})
