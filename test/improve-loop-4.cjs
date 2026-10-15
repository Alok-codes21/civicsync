process.env.DEMO_MODE='true';process.env.DB_PATH=':memory:';process.env.DEMO_ROUTES='true';process.env.AI_DETECTOR='off';process.env.CORS_ORIGINS=' http://a.test , http://b.test/ '
const {test,after}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http')
const {app,db,stop}=require('../server/index.cjs'),server=app.listen(0),port=server.address().port,base='http://127.0.0.1:'+port,tokens={}
const png='iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAHElEQVQokWPoIBEwjGogAjAQowgZjGogBtA+lADnoJgQ2ess4gAAAABJRU5ErkJggg=='
async function raw(path,user,{method='GET',body,headers={}}={}){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(tokens[user]?{Authorization:'Bearer '+tokens[user]}:{}),...headers},body});return r}
async function call(path,user,body,status=200){const r=await raw(path,user,{method:body?'POST':'GET',body:body?JSON.stringify(body):undefined});const d=await r.json();assert.equal(r.status,status,JSON.stringify(d));return d}
const file=async title=>(await call('/api/complaints','alok',{title,description:'Synthetic regression',category:'Garbage Collection',ward:'Ward 12 - Gomti Nagar',lat:28.6743,lon:77.3834},201)).acknowledgementNumber
const options=origin=>new Promise((res,rej)=>{const q=http.request({port,host:'127.0.0.1',method:'OPTIONS',path:'/api/complaints',headers:{Origin:origin}},r=>{r.resume();res({status:r.statusCode,allow:r.headers['access-control-allow-origin']})});q.on('error',rej);q.end()})
after(async()=>{await new Promise(r=>server.close(r));stop()})
test('round 4: work queue: official sees only own complaints and relevant transfers, staff roles see all',async()=>{
 for(const u of ['alok','citizen2','verma','reviewer','supervisor'])tokens[u]=(await call('/api/login',null,{username:u,password:'demo123'})).token
 const mine=await file('Queue mine'),other=await file('Queue other')
 db.prepare("UPDATE complaints SET officer='verma' WHERE id=?").run(mine);db.prepare("UPDATE complaints SET officer='nobody' WHERE id=?").run(other)
 db.prepare('INSERT INTO transfers(complaintId,requester,target,reason) VALUES (?,?,?,?)').run(mine,'verma','reviewer','mine');db.prepare('INSERT INTO transfers(complaintId,requester,target,reason) VALUES (?,?,?,?)').run(other,'nobody','reviewer','other')
 const v=await call('/api/work-queue','verma'),s=await call('/api/work-queue','supervisor')
 assert.deepEqual(v.complaints.map(c=>c.id).sort(),[mine]);assert.deepEqual(v.transfers.map(t=>t.complaintId),[mine]);assert.deepEqual(v.extensions,[])
 assert.ok(s.complaints.some(c=>c.id===other)&&s.complaints.some(c=>c.id===mine));assert.equal(s.transfers.length,2)
 await call('/api/work-queue','alok',null,403)
})
test('round 4: evidence download authorization',async()=>{
 const id=await file('Evidence access');await call('/api/complaints/'+id+'/evidence','alok',{stage:'before',mime:'image/png',base64:png},201)
 const eid=db.prepare('SELECT id FROM evidence WHERE complaintId=?').get(id).id,want=Buffer.from(png,'base64')
 for(const [u,status] of [[undefined,403],['citizen2',403],['alok',200],['reviewer',200],['supervisor',200]]){const r=await raw('/api/evidence/'+eid,u);assert.equal(r.status,status,String(u));if(status===200){assert.deepEqual(Buffer.from(await r.arrayBuffer()),want);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(r.headers.get('x-content-type-options'),'nosniff')}else assert.ok(!(await r.text()).includes('PNG'))}
 assert.equal((await raw('/api/evidence/does-not-exist','alok')).status,404)
})
test('round 4: malformed and oversized JSON give stable JSON errors without internals',async()=>{
 const bad=await raw('/api/login',null,{method:'POST',body:'{not json'});assert.equal(bad.status,400);assert.deepEqual(await bad.json(),{error:'Invalid or oversized request'})
 const big=await raw('/api/login',null,{method:'POST',body:JSON.stringify({username:'x'.repeat(7*1024*1024)})});assert.equal(big.status,413);assert.deepEqual(await big.json(),{error:'Invalid or oversized request'})
})
test('round 4: CORS origins are trimmed and matched exactly',async()=>{
 assert.deepEqual(await options('http://a.test'),{status:204,allow:'http://a.test'})
 assert.equal((await options('http://evil.test')).status,403);assert.equal((await options('http://a.test.evil')).status,403)
 assert.equal((await options('http://b.test')).status,403) // configured with a trailing slash: exact-match only, never a wildcard
 assert.equal((await raw('/api/health',null)).headers.get('access-control-allow-origin'),null)
})
test('round 4: reviewer work queue is broad and unexpected errors give a generic 500',async()=>{
 const r=await call('/api/work-queue','reviewer');assert.ok(r.complaints.length>=2);assert.deepEqual(r.extensions,[]);assert.equal(r.notifications,'internal_only')
 const realPrepare=db.prepare.bind(db),realErr=console.error;console.error=()=>{}
 db.prepare=sql=>{if(String(sql).startsWith('SELECT COUNT(*) n FROM complaints'))throw new Error('SQLITE_SECRET_DETAIL /srv/db/path');return realPrepare(sql)}
 try{const res=await raw('/api/complaints','alok');const body=await res.text();assert.equal(res.status,500);assert.deepEqual(JSON.parse(body),{error:'Internal server error'});assert.ok(!/SECRET|srv|stack|at /.test(body))}finally{db.prepare=realPrepare;console.error=realErr}
})
