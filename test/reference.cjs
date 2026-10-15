const {test,after}=require('node:test')
const assert=require('node:assert/strict')
process.env.DEMO_MODE='true'
process.env.DB_PATH=':memory:'
delete process.env.DEMO_ROUTES
const ref=require('../server/reference.cjs')
const {app,db,sweep,stop}=require('../server/index.cjs')
const server=app.listen(0),base='http://127.0.0.1:'+server.address().port
const DAY=86400000
async function req(path,body,token){
 const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined})
 return {status:r.status,body:await r.json()}
}
const login=async u=>(await req('/api/login',{username:u,password:'demo123'})).body.token
const file=async(category,token,ward='Ghaziabad Ward 50')=>(await req('/api/complaints',{title:'Test issue',description:'Needs a fix',category,ward},token)).body.complaint
after(async()=>{await new Promise(r=>server.close(r));stop()})

test('seed integrity: string ward ids 1-100, sources, verification date, no invented/contact data',()=>{
 const s=ref.seed,ids=Object.keys(s.wardLocalities.wards)
 assert.equal(ids.length,100);for(const id of ids){assert.equal(typeof id,'string');assert.ok(Number(id)>=1&&Number(id)<=100)}
 assert.match(s.verifiedAt,/^\d{4}-\d{2}-\d{2}$/)
 for(const u of Object.values(s.sources))assert.match(u,/^https:\/\/ghaziabadnagarnigam\.in\//)
 assert.ok(s.charter.rows.every(r=>Number.isInteger(r.slaDays)&&r.slaDays>0&&r.department&&r.subCategory))
 assert.doesNotMatch(JSON.stringify(require('../data/ghaziabad/officer-hints.json')),/\b[6-9]\d{9}\b|@/)
})
test('locality match: unique, ambiguous and unknown never auto-resolve',()=>{
 const u=ref.matchLocality('Krishna Nagar Bagu B Block');assert.equal(u.result,'unique');assert.deepEqual(u.wards,['1'])
 const a=ref.matchLocality('Ghukna');assert.equal(a.result,'ambiguous');assert.ok(a.wards.length>1)
 assert.equal(ref.matchLocality('Atlantis Colony').result,'none');assert.equal(ref.matchLocality('').result,'none')
})
test('stale reference data detected with controlled clock',()=>{
 const v=Date.parse(ref.seed.verifiedAt+'T00:00:00Z')
 assert.equal(ref.staleness(v+10*DAY).stale,false)
 assert.equal(ref.staleness(v+(ref.seed.staleAfterDays+1)*DAY).stale,true)
})
test('reference endpoints are public, flag human review, never assign',async()=>{
 const l=await req('/api/reference/locality?q=Ghukna');assert.equal(l.status,200)
 assert.equal(l.body.result,'ambiguous');assert.equal(l.body.requiresHumanReview,true);assert.equal(l.body.automaticAssignment,false)
 const c=await req('/api/reference/charter');assert.equal(c.status,200);assert.equal(c.body.rows.length,ref.seed.charter.rows.length);assert.ok(c.body.disclaimer.includes('not an official export'))
})
test('charter SLA caps deadline only for unambiguous categories',async()=>{
 const t=await login('alok')
 const g=await file('Garbage Collection',t),r=await file('Roads & Potholes',t)
 const row=id=>db.prepare('SELECT submittedTs,deadlineTs FROM complaints WHERE id=?').get(id)
 assert.equal(Math.round((row(g.id).deadlineTs-row(g.id).submittedTs)/DAY),1)
 assert.ok((row(r.id).deadlineTs-row(r.id).submittedTs)/DAY>1,'ambiguous category keeps priority days')
 assert.equal(ref.charterSlaDays('Roads & Potholes'),null)
})
test('overdue with controlled time: escalates by level, no duplicate tasks on re-sweep',async()=>{
 const t=await login('alok'),c=await file('Garbage Collection',t)
 const count=()=>db.prepare('SELECT count(*) n FROM escalation_tasks WHERE complaintId=?').get(c.id).n
 const late=c.id&&db.prepare('SELECT deadlineTs FROM complaints WHERE id=?').get(c.id).deadlineTs
 sweep(late+1000);assert.equal(count(),1)
 assert.equal(db.prepare('SELECT status FROM complaints WHERE id=?').get(c.id).status,'Overdue')
 sweep(late+1000);sweep(late+1500);assert.equal(count(),1)
 sweep(late+3*DAY);assert.equal(count(),2)
 sweep(late+8*DAY);assert.equal(count(),3);sweep(late+9*DAY);assert.equal(count(),3)
})
test('permissions: citizen cannot read officer hints or queue; filing needs login',async()=>{
 const t=await login('alok')
 assert.equal((await req('/api/jurisdictions/officer-hints?ward=38',null,t)).status,403)
 assert.equal((await req('/api/jurisdictions/officer-hints?ward=38')).status,403)
 assert.equal((await req('/api/escalations',null,t)).status,403)
 assert.equal((await req('/api/complaints',{title:'x',description:'y',category:'Garbage Collection',ward:'1'})).status,401)
 assert.equal((await req('/api/jurisdictions/officer-hints?ward=38',null,await login('supervisor'))).status,200)
})
