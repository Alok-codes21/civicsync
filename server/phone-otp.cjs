const crypto=require('crypto')
const TTL=5*60*1000,COOLDOWN=60000,HOUR=3600000
function normalize(phone){if(typeof phone!=='string')return null;const p=phone.replace(/[ ()-]/g,'');return /^\+91[6-9]\d{9}$/.test(p)?p:/^[6-9]\d{9}$/.test(p)?'+91'+p:null}
module.exports=function createPhoneOTP({db,authUser,mode='disabled',sender=null,pepper=null,now=Date.now,devSink=null}){
 if(mode==='sms'&&(!sender||typeof sender.send!=='function'||!pepper||Buffer.byteLength(pepper)<32))throw new Error('SMS mode requires sender and 32-byte private OTP pepper')
 if(!['disabled','dev','sms'].includes(mode))throw new Error('Invalid OTP mode')
 const secret=pepper||crypto.randomBytes(32).toString('hex'),mac=value=>crypto.createHmac('sha256',secret).update(value).digest('hex')
 for(const [name,type] of Object.entries({phone:'TEXT',phoneVerified:'INTEGER NOT NULL DEFAULT 0',phoneVerifiedTs:'INTEGER'}))if(!db.prepare('PRAGMA table_info(users)').all().some(c=>c.name===name))db.exec(`ALTER TABLE users ADD COLUMN ${name} ${type}`)
 db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS unique_verified_phone ON users(phone) WHERE phoneVerified=1;
 CREATE TABLE IF NOT EXISTS phone_otp(id TEXT PRIMARY KEY,username TEXT NOT NULL,phone TEXT NOT NULL,digest TEXT NOT NULL,expiresTs INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,state TEXT NOT NULL,mode TEXT NOT NULL,createdTs INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS phone_otp_rates(scope TEXT NOT NULL,kind TEXT NOT NULL,ts INTEGER NOT NULL);CREATE INDEX IF NOT EXISTS otp_rate_scope ON phone_otp_rates(scope,kind,ts);`)
 function error(status,msg){return Object.assign(new Error(msg),{status})}
 function requireCitizen(req){const u=authUser(req);if(!u)throw error(401,'Login required');if(u.role!=='citizen'||u.username.startsWith('unclaimed-'))throw error(403,'Claimed citizen account required');return u}
 const ip=req=>req.socket.remoteAddress||'unknown' // Never trust client-supplied forwarding headers.
 function clean(t){db.prepare('DELETE FROM phone_otp_rates WHERE ts<?').run(t-HOUR);db.prepare('DELETE FROM phone_otp WHERE expiresTs<?').run(t-24*HOUR)}
 function charge(scopes,kind,limit,t){for(const scope of scopes)if(db.prepare('SELECT COUNT(*) n FROM phone_otp_rates WHERE scope=? AND kind=? AND ts>?').get(scope,kind,t-HOUR).n>=limit)throw error(429,'OTP hourly limit reached');for(const scope of scopes)db.prepare('INSERT INTO phone_otp_rates VALUES (?,?,?)').run(scope,kind,t)}
 function view(u){const r=db.prepare('SELECT phone,phoneVerified,phoneVerifiedTs FROM users WHERE username=?').get(u.username);return {phoneMasked:r.phone?r.phone.slice(0,3)+'******'+r.phone.slice(-4):null,phoneVerified:Boolean(r.phoneVerified),phoneVerifiedTs:r.phoneVerifiedTs,mode,notice:'Phone possession only, not identity or physical complaint verification'}}
 function mount(app){
 app.get('/api/phone/status',(req,res)=>{try{const u=requireCitizen(req);res.json(view(u))}catch(e){res.status(e.status||500).json({error:e.status?e.message:'OTP unavailable'})}})
 app.post('/api/phone/otp/request',async(req,res)=>{let id=null;try{
 const u=requireCitizen(req);if(mode==='disabled')throw error(503,'SMS provider not configured');const phone=normalize(req.body?.phone);if(!phone)throw error(400,'Valid Indian mobile number required');if(req.body?.consent!==true)throw error(400,'Consent to receive this verification OTP required');const t=now();id=crypto.randomUUID();const code=String(crypto.randomInt(0,1000000)).padStart(6,'0')
 db.transaction(()=>{clean(t);const last=db.prepare('SELECT createdTs FROM phone_otp WHERE username=? ORDER BY createdTs DESC LIMIT 1').get(u.username);if(last&&t-last.createdTs<COOLDOWN)throw error(429,'Wait 60 seconds before resending OTP');charge([mac('user:'+u.username),mac('phone:'+phone),mac('ip:'+ip(req))],'send',5,t);db.prepare("UPDATE phone_otp SET state='superseded' WHERE username=? AND state IN ('pending','sent')").run(u.username);db.prepare('INSERT INTO phone_otp VALUES (?,?,?,?,?,0,?,?,?)').run(id,u.username,phone,mac(id+':'+u.username+':'+phone+':'+code),t+TTL,'pending',mode,t)})()
 if(mode==='dev'){if(devSink)devSink({challengeId:id,code});else console.log('DEV ONLY OTP',id,code)}else {let timer;const receipt=await Promise.race([sender.send({to:phone,code,expiresSeconds:TTL/1000,challengeId:id}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(error(503,'SMS sender timeout')),15000)})]).finally(()=>clearTimeout(timer));if(receipt?.accepted!==true)throw error(503,'SMS sender did not accept request')}
 const changed=db.prepare("UPDATE phone_otp SET state='sent' WHERE id=? AND state='pending'").run(id);if(!changed.changes)throw error(409,'OTP superseded; request a new code')
 res.status(202).json({challengeId:id,expiresInSeconds:TTL/1000,resendAfterSeconds:COOLDOWN/1000,delivery:mode==='dev'?'dev_local_only':'provider_accepted_not_delivery_confirmed',realVerification:mode==='sms'})
 }catch(e){if(id)db.prepare("UPDATE phone_otp SET state='failed' WHERE id=? AND state='pending'").run(id);res.status(e.status||503).json({error:e.status?e.message:'OTP sender unavailable'})}})
 app.post('/api/phone/otp/verify',(req,res)=>{try{const u=requireCitizen(req),t=now();const result=db.transaction(()=>{
 clean(t);charge([mac('verify-user:'+u.username),mac('verify-ip:'+ip(req))],'verify',20,t)
 const id=req.body?.challengeId,code=req.body?.code,c=typeof id==='string'?db.prepare('SELECT * FROM phone_otp WHERE id=? AND username=?').get(id,u.username):null
 if(!c||c.state!=='sent'||c.expiresTs<=t||c.attempts>=5||c.mode!==mode)return {status:400,error:'OTP invalid, expired or already used'}
 db.prepare('UPDATE phone_otp SET attempts=attempts+1 WHERE id=?').run(c.id)
 const valid=typeof code==='string'&&/^\d{6}$/.test(code)&&crypto.timingSafeEqual(Buffer.from(c.digest,'hex'),Buffer.from(mac(c.id+':'+u.username+':'+c.phone+':'+code),'hex'))
 if(!valid){if(c.attempts+1>=5)db.prepare("UPDATE phone_otp SET state='locked' WHERE id=?").run(c.id);return {status:400,error:'OTP invalid, expired or already used'}}
 if(mode==='sms'&&db.prepare('SELECT 1 FROM users WHERE phone=? AND phoneVerified=1 AND username!=?').get(c.phone,u.username)){db.prepare("UPDATE phone_otp SET state='used' WHERE id=?").run(c.id);return {status:409,error:'Number unavailable for this account'}}
 db.prepare("UPDATE phone_otp SET state='used',digest='' WHERE id=?").run(c.id)
 if(mode==='sms')db.prepare('UPDATE users SET phone=?,phoneVerified=1,phoneVerifiedTs=? WHERE username=?').run(c.phone,t,u.username)
 return {status:200,phoneVerified:mode==='sms',devTestPassed:mode==='dev',notice:mode==='dev'?'Development code only; no real phone verification':'Phone possession verified; not Aadhaar or identity verification'}
 })();const {status,...body}=result;res.status(status).json(body)
 }catch(e){res.status(e.status||500).json({error:e.status?e.message:'OTP unavailable'})}})
 }
 return {mount,mode,view}
}
module.exports.normalize=normalize
