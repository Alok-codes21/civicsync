process.env.DEMO_MODE='true';process.env.DEMO_ROUTES='true';process.env.DB_PATH=':memory:';process.env.AI_DETECTOR='off'
const {test,after}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),sharp=require('sharp')
const {app,db,stop,retention}=require('../server/index.cjs'),server=app.listen(0),base='http://127.0.0.1:'+server.address().port,tokens={}
const {score,NOTICE}=require('../server/evidence-trust.cjs')
after(async()=>{await new Promise(r=>server.close(r));stop()})
async function call(path,user,body,status=200){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(tokens[user]?{Authorization:'Bearer '+tokens[user]}:{})},body:body?JSON.stringify(body):undefined});const d=await r.json();assert.equal(r.status,status,JSON.stringify(d));return d}
let id,id2,png
const cp=(x=id)=>'/api/complaints/'+x
const upload=(extra={},user='alok',status=201,x=id)=>call(cp(x)+'/evidence',user,{stage:'before',mime:'image/png',base64:png,...extra},status)
const session=(user='alok',x=id)=>call(cp(x)+'/evidence-session',user, {})
const sha=x=>crypto.createHash('sha256').update(x).digest('hex')
test('setup and explicit review-only capabilities',async()=>{
 for(const user of ['alok','citizen2','reviewer','supervisor','verma'])tokens[user]=(await call('/api/login',null,{username:user,password:'demo123'})).token
 const make=async()=> (await call('/api/complaints','alok',{title:'Synthetic evidence regression',description:'No actual personal data',category:'Garbage Collection',ward:'Ward 12 - Gomti Nagar',lat:28.6,lon:77.4},201)).acknowledgementNumber
 id=await make();id2=await make()
 png=(await sharp({create:{width:32,height:32,channels:3,background:'#ab4321'}}).png().toBuffer()).toString('base64')
 const c=await call('/api/capabilities');assert.equal(c.evidenceNotice,NOTICE);assert.equal(c.imageDetection,'not_connected')
})
test('capture sessions require membership and store only hashes; creation audit is private-safe',async()=>{
 await call(cp()+'/evidence-session',null,{},401);await call(cp()+'/evidence-session','citizen2',{},403)
 const s=await session();assert.match(s.sessionId,/^[a-f0-9]{64}$/);assert.match(s.nonce,/^[a-f0-9]{64}$/)
 const row=db.prepare('SELECT * FROM evidence_sessions WHERE sessionHash=?').get(sha(s.sessionId));assert.equal(row.nonceHash,sha(s.nonce));assert.equal(row.expiresTs-row.createdTs,120000)
 const a=db.prepare("SELECT afterJson FROM audit WHERE action='Evidence capture session created' ORDER BY seq DESC LIMIT 1").get().afterJson
 assert.ok(!a.includes(s.sessionId)&&!a.includes(s.nonce));assert.ok(!a.includes('28.6'))
})
test('wrong session user/complaint/nonce rejected without consuming; live camera requires session',async()=>{
 const s=await session('reviewer');await upload({sessionId:s.sessionId},'alok',400)
 await upload({sessionId:s.sessionId},'reviewer',400,id2)
 await upload({sessionId:s.sessionId,nonce:'0'.repeat(64)},'reviewer',400)
 assert.equal(db.prepare('SELECT consumedTs FROM evidence_sessions WHERE sessionHash=?').get(sha(s.sessionId)).consumedTs,null)
 await upload({captureMethod:'live_camera'},'alok',400)
 await upload({sessionId:'0'.repeat(64),captureMethod:'live_camera'},'alok',400)
})
test('expiry and automatic cleanup; invalid sessions never change complaint state',async()=>{
 const s=await session(),before=db.prepare('SELECT status FROM complaints WHERE id=?').get(id).status
 db.prepare('UPDATE evidence_sessions SET expiresTs=? WHERE sessionHash=?').run(Date.now()-1,sha(s.sessionId))
 const r=await upload({sessionId:s.sessionId},'alok',400);assert.match(r.error,/expired/)
 retention();assert.equal(db.prepare('SELECT 1 FROM evidence_sessions WHERE sessionHash=?').get(sha(s.sessionId)),undefined)
 assert.equal(db.prepare('SELECT status FROM complaints WHERE id=?').get(id).status,before)
})
test('invalid image does not consume; concurrent uploads consume a session once atomically',async()=>{
 const s=await session();await upload({sessionId:s.sessionId,base64:Buffer.from('not image').toString('base64')},'alok',400)
 const post=()=>fetch(base+cp()+'/evidence',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+tokens.alok},body:JSON.stringify({stage:'before',mime:'image/png',base64:png,captureMethod:'live_camera',sessionId:s.sessionId,nonce:s.nonce})})
 const results=await Promise.all([post(),post()]);assert.deepEqual(results.map(r=>r.status).sort(),[201,400])
 const success=await results.find(r=>r.status===201).json();assert.equal(success.captureSessionUsed,true)
 await upload({sessionId:s.sessionId},'alok',400)
 assert.equal(db.prepare("SELECT count(*) n FROM audit WHERE action='Evidence capture session consumed'").get().n,1)
})
test('session expires during inference and is rechecked at commit',async()=>{
 const s=await session(),detector=require('../server/detector.cjs'),old=detector.predict
 detector.predict=async()=>{db.prepare('UPDATE evidence_sessions SET expiresTs=? WHERE sessionHash=?').run(Date.now()-1,sha(s.sessionId));return {available:false,reason:'AI_DETECTOR_UNAVAILABLE'}}
 try{await upload({sessionId:s.sessionId},'alok',400)}finally{detector.predict=old}
 assert.equal(db.prepare('SELECT consumedTs FROM evidence_sessions WHERE sessionHash=?').get(sha(s.sessionId)).consumedTs,null)
})
test('evidence insert failure rolls back consumption and its audit',async()=>{
 const s=await session(),count=db.prepare('SELECT count(*) n FROM audit').get().n
 db.exec("CREATE TRIGGER fail_evidence BEFORE INSERT ON evidence BEGIN SELECT RAISE(ABORT,'test rollback'); END")
 const res=await fetch(base+cp()+'/evidence',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+tokens.alok},body:JSON.stringify({stage:'before',mime:'image/png',base64:png,sessionId:s.sessionId})})
 assert.equal(res.status,500);db.exec('DROP TRIGGER fail_evidence')
 assert.equal(db.prepare('SELECT consumedTs FROM evidence_sessions WHERE sessionHash=?').get(sha(s.sessionId)).consumedTs,null)
 assert.equal(db.prepare('SELECT count(*) n FROM audit').get().n,count)
 await upload({sessionId:s.sessionId})
})
test('SHA compares original bytes, not normalized bytes; high risk does not reject/close/advance complaint',async()=>{
 const before=db.prepare('SELECT status FROM complaints WHERE id=?').get(id).status
 const good=await upload({clientImageSha256:sha(Buffer.from(png,'base64')).toUpperCase()});assert.ok(!good.riskReasons.includes('CLIENT_SHA256_MISMATCH'))
 const r=await upload({clientImageSha256:'0'.repeat(64),deviceIntegrity:'failed',provenanceStatus:'invalid',integrityRequestHash:'f'.repeat(64),lat:0,lon:0,accuracy:10,capturedTs:Date.now()-8*86400000})
 assert.equal(r.trustLevel,'high_risk');assert.equal(r.decision,'human_review');assert.equal(r.confidence,null)
 for(const code of ['CLIENT_SHA256_MISMATCH','EXACT_PHOTO_REUSED','PHOTO_LOCATION_MISMATCH','OLD_PHOTO','DECLARED_DEVICE_INTEGRITY_FAILED','DECLARED_PROVENANCE_INVALID','AI_DETECTOR_UNAVAILABLE'])assert.ok(r.riskReasons.includes(code),code)
 assert.equal(db.prepare('SELECT status FROM complaints WHERE id=?').get(id).status,before)
 const e=db.prepare('SELECT * FROM evidence WHERE id=?').get(r.evidenceId);assert.equal(e.originalSha256,sha(Buffer.from(png,'base64')));assert.equal(e.c2paStatus,'unsupported');assert.equal(e.provenanceStatus,'invalid');assert.equal(e.integrityRequestHash,'f'.repeat(64))
})
test('original-byte digest remains distinct from metadata-stripped stored digest',async()=>{
 const original=await sharp({create:{width:30,height:30,channels:3,background:'#225577'}}).jpeg().withMetadata({exif:{IFD0:{Artist:'Synthetic test fixture'}}}).toBuffer()
 const r=await upload({mime:'image/jpeg',base64:original.toString('base64'),clientImageSha256:sha(original)})
 const e=db.prepare('SELECT originalSha256,sha,bytes FROM evidence WHERE id=?').get(r.evidenceId)
 assert.equal(e.originalSha256,sha(original));assert.notEqual(e.sha,e.originalSha256);assert.equal((await sharp(e.bytes).metadata()).exif,undefined);assert.ok(!r.riskReasons.includes('CLIENT_SHA256_MISMATCH'))
})
test('client valid/passed declarations never become proof; C2PA is explicitly unsupported',async()=>{
 const r=await upload({deviceIntegrity:'passed',provenanceStatus:'valid'});assert.equal(r.provenanceSignal.status,'unsupported');assert.equal(r.provenanceSignal.validated,false);assert.equal(r.decision,'human_review');assert.ok(r.riskReasons.includes('DEVICE_INTEGRITY_CLIENT_ASSERTED'));assert.ok(r.riskReasons.includes('PROVENANCE_CLIENT_ASSERTED'))
 for(const extra of [{deviceIntegrity:'verified'},{provenanceStatus:'real'},{captureMethod:'selfie'},{clientImageSha256:'bad'},{integrityRequestHash:4},{sessionId:null},{nonce:'bad'}])await upload(extra,'alok',400)
})
test('risk levels are deterministic; AI alone never raises high risk or produces verification',()=>{
 assert.equal(score([]).trustLevel,'low_risk');assert.equal(score(['GPS_CLIENT_ASSERTED','AI_MODEL_SCORE_UNVALIDATED']).trustLevel,'needs_review')
 assert.equal(score(['PHOTO_LOCATION_MISSING']).trustLevel,'needs_review')
 for(const c of ['CAPTURE_SESSION_INVALID','CAPTURE_SESSION_EXPIRED','CLIENT_SHA256_MISMATCH','EXACT_PHOTO_REUSED','SIMILAR_PHOTO_REVIEW_REQUIRED','PHOTO_LOCATION_MISMATCH','OLD_PHOTO','DECLARED_PROVENANCE_INVALID','DECLARED_DEVICE_INTEGRITY_FAILED']){const r=score([c,'AI_MODEL_SCORE_UNVALIDATED']);assert.equal(r.trustLevel,'high_risk');assert.equal(r.decision,'human_review');assert.equal(r.confidence,null)}
})
test('review decisions persist per evidence and history; reupload stays possible; audit is valid',async()=>{
 const e=db.prepare('SELECT id FROM evidence WHERE complaintId=? LIMIT 1').get(id),status=db.prepare('SELECT status FROM complaints WHERE id=?').get(id).status
 await call(cp()+'/evidence-review','alok',{decision:'needs_reupload',reason:'Please retry photo'},403)
 await call(cp()+'/evidence-review','reviewer',{decision:'needs_reupload',reason:'x'},400)
 await call(cp(id2)+'/evidence-review','reviewer',{evidenceId:e.id,decision:'needs_reupload',reason:'Wrong complaint photo'},400)
 for(const decision of ['accepted_for_work','needs_site_visit','needs_reupload'])await call(cp()+'/evidence-review','reviewer',{evidenceId:e.id,decision,reason:'Synthetic private review reason'})
 const row=db.prepare('SELECT * FROM evidence WHERE id=?').get(e.id);assert.equal(row.reviewedBy,'reviewer');assert.equal(row.reviewDecision,'needs_reupload');assert.ok(row.reviewedAt)
 const detail=(await call(cp(),'alok')).complaint;assert.equal(detail.reviewHistory.length,3);assert.equal(detail.reviewHistory[0].reason,'Synthetic private review reason')
 await upload();assert.equal(db.prepare('SELECT status FROM complaints WHERE id=?').get(id).status,status)
 const audit=await call('/api/audit','supervisor');assert.equal(audit.valid,true);assert.equal(audit.events.filter(a=>a.action==='Evidence reviewed').length,3);assert.ok(!JSON.stringify(audit.events).includes('Synthetic private review reason'))
})
test('public and unrelated tracking/list routes omit all evidence/private signals and history',async()=>{
 const e=db.prepare('SELECT id FROM evidence LIMIT 1').get()
 for(const user of [null,'citizen2']){
  for(const path of [cp(),'/api/complaints']){const r=await call(path,user);const c=r.complaint||r.complaints.find(c=>c.id===id);for(const k of ['evidence','reviewHistory','reasons','riskReasons','lat','lon','deviceIntegrity','provenanceStatus','originalSha256','integrityRequestHash'])assert.equal(c[k],undefined,k)}
  const response=await fetch(base+'/api/evidence/'+e.id,{headers:tokens[user]?{Authorization:'Bearer '+tokens[user]}:{}});assert.equal(response.status,403)
 }
})
test('retention deletes added evidence signals along with image bytes and cleans sessions',async()=>{
 db.prepare("UPDATE complaints SET status='Resolved',resolvedTs=? WHERE id=?").run(Date.now()-91*86400000,id)
 retention();assert.equal(db.prepare('SELECT count(*) n FROM evidence WHERE complaintId=?').get(id).n,0)
})
