const {test,after}=require('node:test')
const assert=require('node:assert/strict')
process.env.DEMO_MODE='true';process.env.DB_PATH=':memory:';process.env.DEMO_GHAZIABAD_ROUTES='true';delete process.env.DEMO_ROUTES
const ref=require('../server/reference.cjs')
const hints=require('../data/ghaziabad/officer-hints.json')
const {app,db,stop}=require('../server/index.cjs')
const server=app.listen(0),base='http://127.0.0.1:'+server.address().port
async function req(path,body,token){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json()}}
const login=async u=>(await req('/api/login',{username:u,password:'demo123'})).body.token
const file=async(category,ward)=>(await req('/api/complaints',{title:'T',description:'D',category,ward},await login('alok'))).body.complaint
after(async()=>{await new Promise(r=>server.close(r));stop()})

test('demo routes only for single-zone wards x single-department categories, all demo-labelled',()=>{
 const rows=db.prepare('SELECT * FROM routes').all()
 const single=Object.entries(hints.zoneCandidates).filter(([,z])=>z.length===1).map(([w])=>w)
 assert.equal(rows.length,single.length*5);assert.ok(single.length>0&&single.length<100)
 for(const r of rows){assert.match(r.dept,/^DEMO - .* \(not real Ghaziabad staff\)$/);assert.equal(r.officer,'verma');assert.equal(r.supervisor,'supervisor');assert.equal(r.verified,0)}
 assert.deepEqual([...new Set(rows.map(r=>r.category))].sort(),['Garbage Collection','Parks & Public Spaces','Roads & Potholes','Streetlights & Electricity','Water Supply & Leakage'])
 assert.equal(rows.some(r=>r.category==='Drainage & Sewage'||r.category==='Other Civic Issues'),false)
})
test('multi-zone ward (38) and ambiguous categories still go to Routing Review',async()=>{
 assert.ok(hints.zoneCandidates['38'].length>1)
 for(const [cat,ward] of [['Garbage Collection','Ghaziabad Ward 38'],['Drainage & Sewage','Ghaziabad Ward 50'],['Other Civic Issues','Ghaziabad Ward 50'],['Garbage Collection','Ghukna']]){
  const c=await file(cat,ward);assert.equal(c.status,'Routing Review',cat+ward);assert.equal(c.officer,null)
 }
})
test('seeded route assigns the demo account, flagged unverified, never shown as real staff',async()=>{
 const c=await file('Garbage Collection','Ghaziabad Ward 50')
 assert.equal(c.status,'Assigned');assert.equal(c.officer,'verma');assert.equal(c.routeVerified,0);assert.match(c.dept,/DEMO/);assert.ok(c.reasons.includes('JURISDICTION_UNVERIFIED'))
 const u=db.prepare("SELECT name,role FROM users WHERE username='verma'").get();assert.equal(u.name,'Demo officer')
})
test('flag is off by default: no routes without DEMO_GHAZIABAD_ROUTES',()=>{
 const {spawnSync}=require('child_process')
 const r=spawnSync(process.execPath,['-e',"process.env.DEMO_MODE='true';process.env.DB_PATH=':memory:';delete process.env.DEMO_GHAZIABAD_ROUTES;const {db,stop}=require('./server/index.cjs');process.stdout.write(String(db.prepare('SELECT count(*) n FROM routes').get().n));stop()"],{cwd:require('path').join(__dirname,'..'),encoding:'utf8'})
 assert.equal(r.stdout.trim(),'0')
})
