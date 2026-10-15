const {test,after}=require('node:test')
const assert=require('node:assert/strict')
process.env.DEMO_MODE='true';process.env.DB_PATH=':memory:';delete process.env.DEMO_ROUTES
const ref=require('../server/reference.cjs')
const {app,db,stop}=require('../server/index.cjs')
const server=app.listen(0),base='http://127.0.0.1:'+server.address().port
async function req(path,body,token){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json()}}
const login=async u=>(await req('/api/login',{username:u,password:'demo123'})).body.token
after(async()=>{await new Promise(r=>server.close(r));stop()})

test('unique ward + single-department category gives an unverified suggestion with staff names only',()=>{
 const s=ref.suggestRoute({ward:'Ghaziabad Ward 38',category:'Garbage Collection'})
 assert.equal(s.status,'suggested_unverified');assert.equal(s.wardId,'38');assert.equal(s.department,'HEALTH');assert.equal(s.charterRole,'SAFAI NAYAK')
 assert.equal(s.automaticAssignment,false);assert.equal(s.verified,false);assert.equal(s.requiresHumanReview,true)
 assert.ok(s.staffHints.length>0);for(const h of s.staffHints)assert.deepEqual(Object.keys(h).sort(),['designation','name'])
 assert.equal(typeof s.wardId,'string')
})
test('ambiguous locality, conflicting hints, unknown ward and ambiguous category stay unresolved',()=>{
 assert.equal(ref.suggestRoute({ward:'Ghukna',category:'Garbage Collection'}).status,'ambiguous')
 assert.equal(ref.suggestRoute({ward:'Ghukna',category:'Garbage Collection'}).wardId,null)
 assert.equal(ref.suggestRoute({ward:'Ward 1',landmark:'Adarsh Vihar Colony',category:'Garbage Collection'}).status,'ambiguous','locality in 4 wards')
 assert.equal(ref.suggestRoute({ward:'Ward 5',landmark:'Krishna Nagar Bagu B Block',category:'Garbage Collection'}).status,'ambiguous','text ward 5 conflicts with locality ward 1')
 assert.equal(ref.suggestRoute({ward:'Somewhere',category:'Garbage Collection'}).status,'no_match')
 assert.equal(ref.suggestRoute({ward:'Ward 150',category:'Garbage Collection'}).status,'no_match')
 const d=ref.suggestRoute({ward:'Ward 38',category:'Drainage & Sewage'});assert.equal(d.department,null);assert.deepEqual(d.departmentCandidates,['SEWER','HEALTH'])
 assert.equal(ref.suggestRoute({ward:'Ward 38',category:'Other Civic Issues'}).department,null)
})
test('suggestion visible only to reviewer/supervisor on Routing Review; routes table stays empty; no assignment',async()=>{
 const own=await login('alok')
 const r=await req('/api/complaints',{title:'Garbage',description:'Pile',category:'Garbage Collection',ward:'Ghaziabad Ward 38'},own)
 const id=r.body.acknowledgementNumber
 assert.equal(r.body.complaint.status,'Routing Review');assert.equal(r.body.complaint.officer,null)
 assert.equal(r.body.complaint.routingSuggestion,undefined)
 for(const [u,seen] of [['supervisor',true],['reviewer',true],['alok',false],['verma',false],[null,false]]){
  const c=(await req('/api/complaints/'+id,null,u?await login(u):null)).body.complaint
  assert.equal(Boolean(c.routingSuggestion),seen,String(u))
  if(seen)assert.equal(c.routingSuggestion.wardId,'38')
 }
 assert.equal(db.prepare('SELECT count(*) n FROM routes').get().n,0)
 assert.equal(db.prepare('SELECT officer FROM complaints WHERE id=?').get(id).officer,null)
})
test('staff hint file: re-extraction recorded, names/designations/wards only, no contacts',()=>{
 const f=require('../data/ghaziabad/officer-hints.json')
 assert.equal(f.reExtractedAt,'2026-10-14');assert.equal(f.officers.length,8)
 assert.doesNotMatch(JSON.stringify(f),/\b[6-9]\d{9}\b|@|\d{6,7}-[ORF]/)
})
