process.env.DEMO_MODE='true';process.env.DB_PATH=':memory:';process.env.DEMO_ROUTES='true';process.env.AI_DETECTOR='off'
const {test,after}=require('node:test'),assert=require('node:assert/strict')
const sharp=require('sharp')
const {app,db,stop}=require('../server/index.cjs'),server=app.listen(0),base='http://127.0.0.1:'+server.address().port
let token,ack
const evCount=()=>db.prepare('SELECT count(*) n FROM evidence WHERE complaintId=?').get(ack).n
const evEvents=()=>db.prepare("SELECT count(*) n FROM audit WHERE complaintId=? AND action='Evidence received'").get(ack).n
async function upload(buf,mime){const r=await fetch(base+'/api/complaints/'+ack+'/evidence',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({stage:'before',mime,base64:buf.toString('base64')})});return{s:r.status,d:await r.json()}}
after(async()=>{await new Promise(r=>server.close(r));stop()})

test('round 10 setup: login and complaint',async()=>{
 const r=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'alok',password:'demo123'})})
 token=(await r.json()).token
 const c=await fetch(base+'/api/complaints',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({title:'Image failure probe',description:'d',category:'Garbage Collection',ward:'Ward 12 - Gomti Nagar'})})
 assert.equal(c.status,201);ack=(await c.json()).acknowledgementNumber
})

test('round 10: truncated PNG with valid signature rejected, no partial evidence row or audit event',async()=>{
 const good=await sharp({create:{width:32,height:32,channels:3,background:'#778899'}}).png().toBuffer()
 const truncated=good.subarray(0,40) // signature + partial IHDR, no image data
 const before=evCount(),events=evEvents()
 const r=await upload(truncated,'image/png')
 assert.equal(r.s,400);assert.equal(r.d.error,'Image decode failed or pixel limit exceeded')
 assert.equal(evCount(),before);assert.equal(evEvents(),events)
 const h=await fetch(base+'/api/health');assert.equal(h.status,200)
})

test('round 10: declared MIME not matching file signature rejected, nothing stored',async()=>{
 const png=await sharp({create:{width:16,height:16,channels:3,background:'#aabbcc'}}).png().toBuffer()
 const before=evCount(),events=evEvents(),status=db.prepare('SELECT status FROM complaints WHERE id=?').get(ack).status
 const r=await upload(png,'image/jpeg')
 assert.equal(r.s,400);assert.equal(r.d.error,'File signature mismatch')
 assert.equal(evCount(),before);assert.equal(evEvents(),events)
 assert.equal(db.prepare('SELECT status FROM complaints WHERE id=?').get(ack).status,status)
})

test('round 10: image over the 16M pixel limit rejected, no partial evidence row, API stays up',async()=>{
 const big=await sharp({create:{width:4001,height:4001,channels:3,background:'#336699'}}).png({compressionLevel:9}).toBuffer()
 assert.ok(big.length<=4*1024*1024,'fixture must pass the byte-size gate to reach the pixel check')
 const before=evCount(),events=evEvents()
 const r=await upload(big,'image/png')
 assert.equal(r.s,400);assert.equal(r.d.error,'Image decode failed or pixel limit exceeded')
 assert.equal(evCount(),before);assert.equal(evEvents(),events)
 const h=await fetch(base+'/api/health');assert.equal(h.status,200)
})
