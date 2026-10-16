const crypto=require('node:crypto')
const hash=x=>crypto.createHash('sha256').update(x).digest('hex')
module.exports=({db,audit,fail})=>{
 db.exec(`CREATE TABLE IF NOT EXISTS evidence_sessions (
 sessionHash TEXT PRIMARY KEY, nonceHash TEXT NOT NULL, complaintId TEXT NOT NULL,
 actor TEXT NOT NULL, createdTs INTEGER NOT NULL, expiresTs INTEGER NOT NULL, consumedTs INTEGER);
 CREATE INDEX IF NOT EXISTS evidence_sessions_expiry ON evidence_sessions(expiresTs);`)
 const cleanup=(now=Date.now())=>db.prepare('DELETE FROM evidence_sessions WHERE expiresTs<=?').run(now)
 cleanup()
 function create(c,u){
  cleanup()
  // Bound outstanding sessions per account to avoid an unbounded issuance store.
  if(db.prepare('SELECT count(*) n FROM evidence_sessions WHERE actor=? AND consumedTs IS NULL').get(u.username).n>=20)fail(429,'Too many active capture sessions')
  const sessionId=crypto.randomBytes(32).toString('hex'),nonce=crypto.randomBytes(32).toString('hex'),now=Date.now(),expiresTs=now+120000
  db.prepare('INSERT INTO evidence_sessions(sessionHash,nonceHash,complaintId,actor,createdTs,expiresTs) VALUES (?,?,?,?,?,?)').run(hash(sessionId),hash(nonce),c.id,u.username,now,expiresTs)
  audit(c.id,u.username,'Evidence capture session created',null,{expiresAt:new Date(expiresTs).toISOString()})
  return {sessionId,nonce,expiresAt:new Date(expiresTs).toISOString()}
 }
 function validate(b,c,u){
  if(b.sessionId===undefined)return null
  const s=db.prepare('SELECT * FROM evidence_sessions WHERE sessionHash=?').get(hash(b.sessionId))
  if(!s||s.complaintId!==c.id||s.actor!==u.username||s.consumedTs!==null)fail(400,'Invalid, used, or unavailable capture session')
  if(s.expiresTs<=Date.now())fail(400,'Capture session expired; request a new session')
  if(typeof b.nonce!=='string'||!/^[a-f0-9]{64}$/.test(b.nonce)||hash(b.nonce)!==s.nonceHash)fail(400,'Invalid capture nonce')
  return s
 }
 function consume(b,c,u){
  const s=validate(b,c,u);if(!s)return false
  const changed=db.prepare('UPDATE evidence_sessions SET consumedTs=? WHERE sessionHash=? AND consumedTs IS NULL AND expiresTs>?').run(Date.now(),s.sessionHash,Date.now()).changes
  if(changed!==1)fail(400,'Capture session expired or already used')
  audit(c.id,u.username,'Evidence capture session consumed',null,{captureSessionUsed:true})
  return true
 }
 return {create,validate,consume,cleanup}
}
