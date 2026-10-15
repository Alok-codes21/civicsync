const {test,after}=require('node:test')
const assert=require('node:assert/strict')
process.env.DEMO_MODE='true'
process.env.DB_PATH=':memory:'
delete process.env.DEMO_ROUTES
const {app,db,stop}=require('../server/index.cjs')
const server=app.listen(0),base='http://127.0.0.1:'+server.address().port
const category='Roads & Potholes'
// Ward 38 (Arthala) surface point computed from the loaded 2022 SBM polygons
const INSIDE={lat:28.6742985,lon:77.38336703346414},OUTSIDE={lat:28.0,lon:77.0}
async function req(path,body,token) {
 const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined})
 return {status:r.status,body:await r.json()}
}
after(async()=>{await new Promise(r=>server.close(r));stop()})
test('Ghaziabad default seeds no Lucknow demo routes',()=>assert.equal(db.prepare('SELECT count(*) n FROM routes').get().n,0))
test('jurisdiction status is honest: partial 2022 SBM data, Ghaziabad only',async()=>{
 const {body:c}=await req('/api/jurisdictions')
 assert.equal(c.municipality,'Ghaziabad');assert.equal(c.wardCount,94);assert.equal(c.expectedWards,100)
 assert.deepEqual(c.missingWards,[79,81,87,98,99,100]);assert.equal(c.geographicLookup,true)
 assert.equal(c.officialOfficerRouting,false);assert.equal(c.status,'partial_2022_sbm_unverified')
 const {body:b}=await req('/api/capabilities');assert.equal(b.jurisdictions,'partial_2022_sbm_unverified');assert.equal(b.demoRoutes,false)
})
test('lookup matches a loaded ward without echoing coordinates, still flagged unverified',async()=>{
 const {body:b,status}=await req(`/api/jurisdictions/lookup?lat=${INSIDE.lat}&lon=${INSIDE.lon}`)
 assert.equal(status,200);assert.equal(b.matched,true);assert.equal(b.ward.code,38);assert.equal(b.ward.name,'Arthala')
 assert.equal(b.reasonCode,'WARD_MATCHED_UNVERIFIED_2022_SBM');assert.equal(b.requiresHumanReview,true);assert.equal(b.lat,undefined)
})
test('lookup fails closed outside loaded polygons and on invalid input',async()=>{
 const {body:b,status}=await req(`/api/jurisdictions/lookup?lat=${OUTSIDE.lat}&lon=${OUTSIDE.lon}`)
 assert.equal(status,200);assert.equal(b.matched,false);assert.equal(b.ward,null);assert.equal(b.reasonCode,'WARD_NOT_IN_LOADED_BOUNDARIES');assert.equal(b.lat,undefined)
 for(const q of ['', '?lat=NaN&lon=77', '?lat=91&lon=77','?lat=28'])assert.equal((await req('/api/jurisdictions/lookup'+q)).status,400)
})
test('filing attaches honest geoWard hint but never routes to an officer',async()=>{
 const {body:b}=await req('/api/login',{username:'alok',password:'demo123'})
 const r=await req('/api/complaints',{title:'Road damage',description:'Damage needs inspection',category,ward:'Ghaziabad Ward 38',...INSIDE},b.token)
 assert.equal(r.status,201);assert.equal(r.body.jurisdiction.geoWard.code,38);assert.equal(r.body.jurisdiction.officerRouting,'manual_only')
 assert.ok(r.body.complaint.reasons.includes('GEO_WARD_MATCHED_UNVERIFIED_2022_SBM'))
 assert.equal(r.body.complaint.status,'Routing Review');assert.equal(r.body.complaint.officer,null);assert.equal(r.body.complaint.routeVerified,0)
 const r2=await req('/api/complaints',{title:'Road damage',description:'Damage needs inspection',category,ward:'Ghaziabad Ward 99',...OUTSIDE},b.token)
 assert.equal(r2.body.jurisdiction.geoWard,null);assert.ok(r2.body.complaint.reasons.includes('GEO_WARD_NOT_FOUND'))
})
test('existing Lucknow seeded DB route cannot silently assign Ghaziabad/default complaints',async()=>{
 db.prepare('INSERT INTO routes VALUES (?,?,?,?,?,?)').run('Ward 12 - Gomti Nagar',category,'Demo Roads','verma','supervisor',1)
 const {body:b}=await req('/api/login',{username:'alok',password:'demo123'})
 for(const ward of ['Ghaziabad Ward 50','Ward 12 - Gomti Nagar']) {
  const r=await req('/api/complaints',{title:'Road damage',description:'Damage needs inspection',category,ward,...OUTSIDE},b.token)
  assert.equal(r.status,201);assert.equal(r.body.complaint.status,'Routing Review');assert.equal(r.body.complaint.officer,null);assert.equal(r.body.complaint.routeVerified,0);assert.ok(r.body.complaint.reasons.includes('JURISDICTION_UNVERIFIED'))
 }
})
test('configured prototype officers cannot acquire geographic verified flag',async()=>{
 db.prepare('INSERT INTO routes VALUES (?,?,?,?,?,?)').run('Ghaziabad Ward 50',category,'Prototype Roads','verma','supervisor',1)
 const {body:b}=await req('/api/login',{username:'alok',password:'demo123'})
 const {body:r}=await req('/api/complaints',{title:'Road damage',description:'Damage needs inspection',category,ward:'Ghaziabad Ward 50'},b.token)
 assert.equal(r.complaint.routeVerified,0);assert.ok(r.complaint.reasons.includes('JURISDICTION_UNVERIFIED'))
})
