process.env.AI_DETECTOR='off'
const { test, after }=require('node:test')
const assert=require('node:assert/strict')
process.env.DEMO_MODE='true'
process.env.DB_PATH=':memory:'
process.env.DEMO_ROUTES='true'
const {app,db,stop}=require('../server/index.cjs')
const server=app.listen(0)
const base='http://127.0.0.1:'+server.address().port
const tokens={}
async function request(path,method='GET',body,user){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(tokens[user]?{Authorization:'Bearer '+tokens[user]}:{})},body:body?JSON.stringify(body):undefined});const data=await r.json();return {status:r.status,data}}
async function expect(path,method,body,user,status=200){const r=await request(path,method,body,user);assert.equal(r.status,status,JSON.stringify(r.data));return r.data}
after(async()=>{await new Promise(resolve=>server.close(resolve));stop()})
test('01 demo logins include both officers',async()=>{for(const u of ['alok','verma','sharma','supervisor'])tokens[u]=(await expect('/api/login','POST',{username:u,password:'demo123'})).token;assert.ok(tokens.sharma)})
test('02 staff list is supervisor-only and names official accounts',async()=>{await expect('/api/staff','GET',null,null,403);await expect('/api/staff','GET',null,'alok',403);await expect('/api/staff','GET',null,'verma',403);const x=await expect('/api/staff','GET',null,'supervisor');const names=x.staff.map(s=>s.username);assert.ok(names.includes('verma'));assert.ok(names.includes('sharma'));assert.ok(!names.includes('supervisor'));assert.ok(x.staff.every(s=>s.name))})
test('03 supervisor assigns a Routing Review complaint to a picked officer',async()=>{const c=await expect('/api/complaints','POST',{title:'Nali jammed',description:'Drain blocked near market',category:'Drainage & Sewage',ward:'Unknown demo ward'},'alok',201);const id=c.acknowledgementNumber;assert.equal(c.complaint.status,'Routing Review');await expect('/api/complaints/'+id+'/assign','POST',{officer:'sharma',reason:'Sharma crew covers this side'},'alok',403);await expect('/api/complaints/'+id+'/assign','POST',{officer:'ghost',reason:'Unknown officer check'},'supervisor',400);await expect('/api/complaints/'+id+'/assign','POST',{officer:'sharma',reason:'x'},'supervisor',400);const r=await expect('/api/complaints/'+id+'/assign','POST',{officer:'sharma',reason:'Sharma crew covers this side'},'supervisor');assert.equal(r.complaint.officer,'sharma');assert.equal(r.complaint.status,'Assigned');assert.equal(r.complaint.accepted,0);assert.equal(r.complaint.dept,'Nagar Nigam - Drainage');assert.equal(r.complaint.routeVerified,0);await expect('/api/complaints/'+id+'/assign','POST',{officer:'sharma',reason:'Already with this officer'},'supervisor',400)})
test('04 picked officer sees and accepts in own queue; lifecycle intact',async()=>{const id=db.prepare("SELECT id FROM complaints WHERE officer='sharma' ORDER BY submittedTs DESC LIMIT 1").get().id;const q=await expect('/api/work-queue','GET',null,'sharma');assert.ok(q.complaints.some(c=>c.id===id));await expect('/api/complaints/'+id+'/accept','POST',{},'sharma');await expect('/api/complaints/'+id+'/status','POST',{status:'In Progress',note:'Drain clearing started'},'sharma')})
