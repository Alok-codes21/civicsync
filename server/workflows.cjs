/* Prototype workflows. Configured routes and reviewers are local demo identities,
   not a municipal integration. No AI or identity-verification claims are fabricated. */
const crypto = require('crypto')
const { DEPARTMENTS } = require('./seed.cjs')
module.exports = ({ db, hashPassword, fmtDate, fmtTs, PRIORITY_DAYS }) => {
  db.pragma('foreign_keys = ON')
  const columns = {
    originalDeadlineTs:'INTEGER', lat:'REAL', lon:'REAL', accuracy:'REAL', issueId:'TEXT',
    reasons:"TEXT DEFAULT '[]'", severityReasons:"TEXT DEFAULT '[]'", resolvedTs:'INTEGER',
    reopenCount:'INTEGER DEFAULT 0', repairActor:'TEXT', accepted:'INTEGER DEFAULT 0',
    channel:"TEXT DEFAULT 'web'", language:"TEXT DEFAULT 'en'", routeVerified:'INTEGER DEFAULT 0'
  }
  const existing = db.prepare('PRAGMA table_info(complaints)').all().map(x => x.name)
  for (const [name,type] of Object.entries(columns)) if (!existing.includes(name)) db.exec(`ALTER TABLE complaints ADD COLUMN ${name} ${type}`)
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit (seq INTEGER PRIMARY KEY AUTOINCREMENT, complaintId TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, ts INTEGER NOT NULL, beforeJson TEXT, afterJson TEXT, prevHash TEXT NOT NULL, hash TEXT NOT NULL);
    CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT,'append only'); END;
    CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT,'append only'); END;
    CREATE TABLE IF NOT EXISTS routes (ward TEXT, category TEXT, dept TEXT NOT NULL, officer TEXT NOT NULL, supervisor TEXT NOT NULL, verified INTEGER DEFAULT 0, PRIMARY KEY(ward,category));
    CREATE TABLE IF NOT EXISTS transfers (id INTEGER PRIMARY KEY, complaintId TEXT NOT NULL, requester TEXT NOT NULL, target TEXT NOT NULL, reason TEXT NOT NULL, state TEXT DEFAULT 'pending');
    CREATE UNIQUE INDEX IF NOT EXISTS one_pending_transfer ON transfers(complaintId) WHERE state='pending';
    CREATE TABLE IF NOT EXISTS extensions (id INTEGER PRIMARY KEY, complaintId TEXT NOT NULL, requester TEXT NOT NULL, deadlineTs INTEGER NOT NULL, reason TEXT NOT NULL, state TEXT DEFAULT 'pending');
    CREATE UNIQUE INDEX IF NOT EXISTS one_pending_extension ON extensions(complaintId) WHERE state='pending';
    CREATE TABLE IF NOT EXISTS evidence (id TEXT PRIMARY KEY, complaintId TEXT NOT NULL, actor TEXT NOT NULL, stage TEXT NOT NULL, mime TEXT NOT NULL, bytes BLOB NOT NULL, sha TEXT NOT NULL, ts INTEGER NOT NULL, capturedTs INTEGER, lat REAL, lon REAL, accuracy REAL, reasons TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS reviews (id INTEGER PRIMARY KEY, complaintId TEXT NOT NULL, actor TEXT NOT NULL, decision TEXT NOT NULL, reason TEXT NOT NULL, ts INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS escalation_tasks (complaintId TEXT NOT NULL, cycle INTEGER NOT NULL, level INTEGER NOT NULL, authority TEXT NOT NULL, state TEXT DEFAULT 'pending', acceptedBy TEXT, ts INTEGER NOT NULL, PRIMARY KEY(complaintId,cycle,level));
    CREATE TABLE IF NOT EXISTS impact (id INTEGER PRIMARY KEY, complaintId TEXT NOT NULL, actor TEXT NOT NULL, metric TEXT NOT NULL, value REAL NOT NULL, unit TEXT NOT NULL, note TEXT NOT NULL, ts INTEGER NOT NULL);
  `)
  db.exec('UPDATE complaints SET originalDeadlineTs=deadlineTs WHERE originalDeadlineTs IS NULL; UPDATE complaints SET issueId=id WHERE issueId IS NULL;')
  // Mark legacy records as unverified. Preserve their text only in the restricted legacy timeline.
  db.exec("UPDATE complaints SET latestUpdate='Legacy demo record: historical evidence and verification claims are unverified.' WHERE author='' AND latestUpdate LIKE '%verif%'")
  if (process.env.DEMO_MODE !== 'false') {
    const users = [['alok','Citizen','citizen'],['citizen2','Second citizen','citizen'],['verma','Demo officer','official'],['reviewer','Independent demo reviewer','reviewer'],['supervisor','Demo supervisor','supervisor'],['assisted','Assisted reporting desk','intake']]
    for (const [u,n,r] of users) if (!db.prepare('SELECT 1 FROM users WHERE username=?').get(u)) db.prepare('INSERT INTO users(username,passhash,name,role) VALUES (?,?,?,?)').run(u,hashPassword('demo123'),n,r)
    for (const ward of ['Ward 12 - Gomti Nagar','Ward 8 - Aliganj','Ward 3 - Hazratganj']) for (const [category,dept] of Object.entries(DEPARTMENTS)) db.prepare('INSERT OR IGNORE INTO routes VALUES (?,?,?,?,?,0)').run(ward,category,dept,'verma','supervisor')
  }
  function audit(id, actor, action, before, after) {
    const prev = db.prepare('SELECT hash FROM audit ORDER BY seq DESC LIMIT 1').get()?.hash || ''
    const ts=Date.now(), a=JSON.stringify(before ?? null), b=JSON.stringify(after ?? null)
    const hash=crypto.createHash('sha256').update(JSON.stringify([id,actor,action,ts,a,b,prev])).digest('hex')
    db.prepare('INSERT INTO audit(complaintId,actor,action,ts,beforeJson,afterJson,prevHash,hash) VALUES (?,?,?,?,?,?,?,?)').run(id,actor,action,ts,a,b,prev,hash)
    const pos=db.prepare('SELECT COUNT(*) n FROM events WHERE complaintId=?').get(id).n
    db.prepare('INSERT INTO events(complaintId,position,label,at,detail,kind) VALUES (?,?,?,?,?,?)').run(id,pos,action,fmtTs(ts),'Authenticated workflow event','done')
  }
  const get = id => db.prepare('SELECT * FROM complaints WHERE id=?').get(String(id).toUpperCase())
  function fail(code,msg) { const e=new Error(msg); e.status=code; throw e }
  function text(x,max=2000) { return typeof x==='string' ? x.trim().slice(0,max) : '' }
  function reason(x) { const s=text(x); if(s.length<5) fail(400,'A reason of at least 5 characters is required'); return s }
  function coordinates(b, required=false) {
    const present=b.lat!=null || b.lon!=null
    if(!present) { if(required) fail(400,'lat and lon required'); return {lat:null,lon:null,accuracy:null} }
    if(typeof b.lat!=='number'||typeof b.lon!=='number'||Math.abs(b.lat)>90||Math.abs(b.lon)>180||!Number.isFinite(b.lat)||!Number.isFinite(b.lon)) fail(400,'Invalid coordinates')
    if(b.accuracy!=null && (typeof b.accuracy!=='number'||!Number.isFinite(b.accuracy)||b.accuracy<0)) fail(400,'Invalid accuracy')
    return {lat:b.lat,lon:b.lon,accuracy:b.accuracy ?? null}
  }
  function metres(a,b) {
    if(a.lat==null||b.lat==null) return Infinity
    const rad=Math.PI/180, dlat=(b.lat-a.lat)*rad, dlon=(b.lon-a.lon)*rad
    const h=Math.sin(dlat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dlon/2)**2
    return 6371000*2*Math.asin(Math.min(1,Math.sqrt(h)))
  }
  function member(u,c) { return u && (u.username===c.author || ['reviewer','supervisor'].includes(u.role) || (u.role==='official' && u.username===c.officer)) }
  function worker(u,c) { if(!u || !(u.role==='supervisor'||u.role==='official'&&u.username===c.officer)) fail(403,'Assigned officer or supervisor required') }
  function supervisor(u) { if(u?.role!=='supervisor') fail(403,'Supervisor required') }
  function serialize(c,u) {
    const overdue=c.status!=='Resolved'&&Date.now()>c.deadlineTs
    const base={id:c.id,status:c.status,category:c.category,priority:c.priority,submittedAt:c.submittedAt,deadline:c.deadline,dept:c.dept,escalationLevel:c.escalationLevel,overdue,stage:c.status,legacyDemo:!c.author}
    if(!member(u,c)) return {...base,latestUpdate:`${c.status}. Public tracking omits private complaint details.`,timeline:db.prepare('SELECT action AS label,ts FROM audit WHERE complaintId=? ORDER BY seq').all(c.id).map(x=>({...x,at:fmtTs(x.ts)}))}
    const {submittedTs,deadlineTs,...rest}=c
    return {...rest,...base,reasons:JSON.parse(c.reasons),severityReasons:JSON.parse(c.severityReasons),timeline:db.prepare('SELECT actor,action AS label,ts,beforeJson,afterJson FROM audit WHERE complaintId=? ORDER BY seq').all(c.id),evidence:db.prepare('SELECT id,stage,actor,mime,sha,ts,capturedTs,reasons FROM evidence WHERE complaintId=?').all(c.id).map(e=>({...e,reasons:JSON.parse(e.reasons)}))}
  }
  function change(c,u,action,values) {
    const keys=Object.keys(values)
    db.prepare(`UPDATE complaints SET ${keys.map(k=>k+'=?').join(',')} WHERE id=?`).run(...Object.values(values),c.id)
    audit(c.id,u.username,action,c,values)
    return get(c.id)
  }
  function severity(b) {
    if(b.priority!=null&&!Object.hasOwn(PRIORITY_DAYS,b.priority)) fail(400,'Invalid priority')
    const hazards=b.hazards ?? []
    if(!Array.isArray(hazards)||hazards.some(h=>!['open_manhole','live_wire','unsafe_road','water_loss','blocked_access'].includes(h))) fail(400,'Invalid hazard code')
    const priority=hazards.some(h=>['open_manhole','live_wire'].includes(h))?'Critical':hazards.length?'High':'Medium'
    return {priority,reasons:hazards.length?hazards.map(h=>'REPORTED_'+h.toUpperCase()):['DEFAULT_MEDIUM_UNVERIFIED'],reportedPriority:b.priority??null}
  }
  function candidates(c) { return db.prepare('SELECT * FROM complaints WHERE category=? AND ward=?').all(c.category,c.ward).filter(x=>x.id!==c.id&&metres(x,c)<=100) }
  function sweep(now=Date.now()) {
    return db.transaction(()=>{
      const changes=[]
      for(const c of db.prepare("SELECT * FROM complaints WHERE status!='Resolved' AND deadlineTs < ?").all(now)) {
        const days=Math.floor((now-c.deadlineTs)/86400000), level=days>=7?3:days>=2?2:1
        const route=db.prepare('SELECT * FROM routes WHERE ward=? AND category=?').get(c.ward,c.category)
        for(let n=1;n<=level;n++) {
          const names=['Ward Officer','Zonal Officer','Municipal Commissioner']
          const inserted=db.prepare('INSERT OR IGNORE INTO escalation_tasks(complaintId,cycle,level,authority,ts) VALUES (?,?,?,?,?)').run(c.id,c.reopenCount,n,route?.supervisor || names[n-1],now)
          if(inserted.changes) {audit(c.id,'system','Escalation L'+n,null,{authority:route?.supervisor||names[n-1],delivery:'internal_queue_only',municipalAuthorityLevel:n});changes.push({id:c.id,level:n})}
        }
        const status=['Verification Pending','Reopened'].includes(c.status)?c.status:level===1?'Overdue':'Escalated'
        const nextLevel=Math.max(level,c.escalationLevel)
        if(nextLevel!==c.escalationLevel||status!==c.status) {
          db.prepare('UPDATE complaints SET escalationLevel=?,status=? WHERE id=?').run(nextLevel,status,c.id)
          audit(c.id,'system','Overdue state maintained',{status:c.status,escalationLevel:c.escalationLevel},{status,escalationLevel:nextLevel})
        }
      }
      return changes
    })()
  }
  function mount(app,authUser) {
    const route=(method,path,fn)=>app[method](path,(req,res,next)=>{try {const u=authUser(req); const body=req.body||{}; const result=db.transaction(()=>fn(req,u,body,res))(); if(!res.headersSent) res.json(result)} catch(e){if(e.status)res.status(e.status).json({error:e.message});else next(e)}})
    const complaint=req=>{const c=get(req.params.id);if(!c)fail(404,'Complaint not found');return c}
    route('get','/api/capabilities',()=>({version:2,demoMode:process.env.DEMO_MODE!=='false',identity:{smsOTP:'not_connected',aadhaar:'not_connected'},imageDetection:'not_connected',gps:'client_asserted_not_attested',jurisdictions:'demo_routes_not_official_boundaries',languages:['en','hi'],assistedIntake:true,notifications:'internal_queue_only'}))
    route('get','/api/complaints',(req,u)=>{sweep();let rows=db.prepare('SELECT * FROM complaints ORDER BY submittedTs DESC').all();if(req.query.mine==='true'){if(!u)fail(401,'Login required');rows=rows.filter(c=>c.author===u.username)}if(req.query.status&&req.query.status!=='all') rows=rows.filter(c=>c.status===req.query.status);if(req.query.q){const q=String(req.query.q).toLowerCase();rows=rows.filter(c=>(c.id+' '+c.category).toLowerCase().includes(q))} const offset=Math.max(0,Number(req.query.offset)||0),limit=Math.max(1,Math.min(100,Number(req.query.limit)||25));return {total:rows.length,complaints:rows.slice(offset,offset+limit).map(c=>serialize(c,u))}})
    route('get','/api/complaints/:id',(req,u)=>{sweep();return {complaint:serialize(complaint(req),u)}})
    route('post','/api/complaints',(req,u,b,res)=>{
      if(!u)fail(401,'Login required; use assisted desk for offline intake')
      for(const key of ['title','description','ward'])if(!text(b[key]))fail(400,key+' required')
      if(!Object.hasOwn(DEPARTMENTS,b.category))fail(400,'Invalid category')
      const location=coordinates(b),now=Date.now(),sev=severity(b)
      const r=db.prepare('SELECT * FROM routes WHERE ward=? AND category=?').get(text(b.ward),b.category)
      const channel=u.role==='intake'?(b.channel||'assisted'):'web'
      if(!['web','assisted','phone','desk'].includes(channel))fail(400,'Invalid intake channel')
      const author=u.role==='intake'?text(b.citizenUsername):u.username
      if(!author||!db.prepare("SELECT 1 FROM users WHERE username=? AND role='citizen'").get(author))fail(400,'Known citizen account required; anonymous/offline unclaimed registration is pending')
      if(b.language&&!['en','hi'].includes(b.language))fail(400,'Supported language codes: en, hi')
      const reasons=['CONTENT_UNVERIFIED',...(location.lat==null?['LOCATION_MISSING']:['GPS_CLIENT_ASSERTED']),...(!r?.verified?['JURISDICTION_UNVERIFIED']:[])]
      const id='SHG-'+new Date().getFullYear()+'-'+crypto.randomBytes(6).toString('hex').toUpperCase(),deadlineTs=now+PRIORITY_DAYS[sev.priority]*86400000
      const c={id,title:text(b.title,140),category:b.category,description:text(b.description),ward:text(b.ward,140),landmark:text(b.landmark,200),status:r?'Assigned':'Routing Review',priority:sev.priority,submittedAt:fmtTs(now),submittedTs:now,deadline:fmtDate(deadlineTs),deadlineTs,originalDeadlineTs:deadlineTs,dept:r?.dept||'Jurisdiction review',officer:r?.officer||null,author,latestUpdate:r?'Demo route assigned; evidence not verified.':'Unknown jurisdiction: manual routing required.',...location,issueId:id,reasons:JSON.stringify(reasons),severityReasons:JSON.stringify(sev.reasons),channel,language:b.language||'en',routeVerified:r?.verified||0}
      db.prepare(`INSERT INTO complaints(${Object.keys(c).join(',')}) VALUES (${Object.keys(c).map(k=>'@'+k).join(',')})`).run(c)
      audit(id,u.username,'Complaint submitted',null,{severity:sev,channel,locationTrust:'unverified'})
      res.status(201);return {complaint:serialize(get(id),u),acknowledgementNumber:id,duplicateCandidates:candidates(c).map(x=>({id:x.id,status:x.status,issueId:x.issueId})),requiresHumanReview:true}
    })
    route('post','/api/complaints/:id/status',(req,u,b)=>{
      const c=complaint(req),note=reason(b.note)
      if(b.status==='Reopened'){
        if(u?.username!==c.author)fail(403,'Only complaint owner may reopen')
        if(c.status!=='Resolved')fail(409,'Only resolved complaints can reopen')
        const deadlineTs=Date.now()+PRIORITY_DAYS[c.priority]*86400000
        return {complaint:serialize(change(c,u,'Citizen dispute',{status:'Reopened',latestUpdate:note,deadlineTs,deadline:fmtDate(deadlineTs),escalationLevel:0,resolvedTs:null,reopenCount:c.reopenCount+1,repairActor:null}),u)}
      }
      worker(u,c)
      if(b.status!=='In Progress')fail(400,'Use repair submission and independent verification to resolve; only In Progress supported here')
      if(!['Assigned','Reopened','Overdue','Escalated','In Progress'].includes(c.status))fail(409,'Invalid transition')
      if(!c.accepted)fail(409,'Accept assignment first')
      const next=change(c,u,'Work progress',{status:'In Progress',latestUpdate:note});sweep();return {complaint:serialize(get(next.id),u)}
    })
    route('post','/api/complaints/:id/events',()=>{fail(410,'Arbitrary timeline events disabled; use authenticated workflow endpoints')})
    route('post','/api/complaints/:id/accept',(req,u,b)=>{const c=complaint(req);worker(u,c);return {complaint:serialize(change(c,u,'Assignment accepted',{accepted:1,latestUpdate:'Assignment accepted.'}),u)}})
    route('post','/api/routes',(req,u,b)=>{
      supervisor(u);if(!Object.hasOwn(DEPARTMENTS,b.category)||!text(b.ward)||!text(b.dept))fail(400,'ward, category, dept required')
      if(!db.prepare("SELECT 1 FROM users WHERE username=? AND role='official'").get(b.officer)||!db.prepare("SELECT 1 FROM users WHERE username=? AND role='supervisor'").get(b.supervisor))fail(400,'Known officer and supervisor required')
      const note=reason(b.reason)
      db.prepare('INSERT OR REPLACE INTO routes VALUES (?,?,?,?,?,?)').run(text(b.ward),b.category,text(b.dept),b.officer,b.supervisor,0)
      audit('CONFIG',u.username,'Routing configuration updated',null,{...b,reason:note,verified:false});return {ok:true,verified:false,notice:'Configuration is not proof of municipal jurisdiction'}
    })
    route('post','/api/complaints/:id/route',(req,u,b)=>{supervisor(u);const c=complaint(req),note=reason(b.reason),r=db.prepare('SELECT * FROM routes WHERE ward=? AND category=?').get(c.ward,c.category);if(!r)fail(409,'Configure this ward and category first');return {complaint:serialize(change(c,u,'Jurisdiction routing reviewed',{dept:r.dept,officer:r.officer,status:'Assigned',accepted:0,routeVerified:0,latestUpdate:note}),u),jurisdiction:'configured_not_geographically_verified'}})
    route('post','/api/complaints/:id/transfer',(req,u,b)=>{const c=complaint(req);worker(u,c);if(!db.prepare("SELECT 1 FROM users WHERE username=? AND role='official'").get(b.target)||b.target===c.officer)fail(400,'Different known officer required');if(db.prepare("SELECT 1 FROM transfers WHERE complaintId=? AND state='pending'").get(c.id))fail(409,'Transfer already pending');const note=reason(b.reason);const t=db.prepare('INSERT INTO transfers(complaintId,requester,target,reason) VALUES (?,?,?,?)').run(c.id,u.username,b.target,note);audit(c.id,u.username,'Transfer requested',null,{id:Number(t.lastInsertRowid),target:b.target,reason:note});return {transferId:Number(t.lastInsertRowid),ownerRemains:c.officer}})
    route('post','/api/transfers/:id/accept',(req,u)=>{const t=db.prepare('SELECT * FROM transfers WHERE id=?').get(req.params.id);if(!t)fail(404,'Transfer not found');if(u?.username!==t.target)fail(403,'Target officer required');if(t.state!=='pending')fail(409,'Transfer not pending');const c=get(t.complaintId);db.prepare("UPDATE transfers SET state='accepted' WHERE id=?").run(t.id);return {complaint:serialize(change(c,u,'Transfer accepted',{officer:u.username,accepted:1}),u)}})
    route('post','/api/complaints/:id/extensions',(req,u,b)=>{const c=complaint(req);worker(u,c);const note=reason(b.reason);if(!Number.isSafeInteger(b.deadlineTs)||b.deadlineTs<=Math.max(c.deadlineTs,Date.now())||b.deadlineTs> Date.now()+30*86400000)fail(400,'Future deadline within 30 days required');if(db.prepare("SELECT 1 FROM extensions WHERE complaintId=? AND state='pending'").get(c.id))fail(409,'Extension pending');const x=db.prepare('INSERT INTO extensions(complaintId,requester,deadlineTs,reason) VALUES (?,?,?,?)').run(c.id,u.username,b.deadlineTs,note);audit(c.id,u.username,'Extension requested',null,{id:Number(x.lastInsertRowid),reason:note,deadlineTs:b.deadlineTs});return {extensionId:Number(x.lastInsertRowid),state:'pending'}})
    route('post','/api/extensions/:id/review',(req,u,b)=>{supervisor(u);const x=db.prepare('SELECT * FROM extensions WHERE id=?').get(req.params.id);if(!x)fail(404,'Extension not found');if(x.requester===u.username)fail(403,'Independent approval required');if(x.state!=='pending')fail(409,'Already reviewed');if(x.deadlineTs<=Date.now()&&b.decision==='approve')fail(409,'Requested extension is no longer in the future');if(!['approve','deny'].includes(b.decision))fail(400,'approve or deny required');const note=reason(b.reason);db.prepare('UPDATE extensions SET state=? WHERE id=?').run(b.decision,x.id);const c=get(x.complaintId);if(b.decision==='approve')change(c,u,'Extension approved',{deadlineTs:x.deadlineTs,deadline:fmtDate(x.deadlineTs),latestUpdate:note,status:['Overdue','Escalated'].includes(c.status)?'In Progress':c.status});else audit(c.id,u.username,'Extension denied',x,{reason:note});return {state:b.decision,complaint:serialize(get(c.id),u)}})
    route('post','/api/complaints/:id/evidence',(req,u,b,res)=>{
      const c=complaint(req);if(!member(u,c))fail(403,'Private evidence access required')
      if(!['before','after','dispute'].includes(b.stage))fail(400,'before, after or dispute required')
      if(b.stage==='after')worker(u,c)
      if(!['image/jpeg','image/png'].includes(b.mime)||typeof b.base64!=='string'||! /^[A-Za-z0-9+/]*={0,2}$/.test(b.base64))fail(400,'PNG/JPEG base64 required')
      const bytes=Buffer.from(b.base64,'base64');if(bytes.length<8||bytes.length>4*1024*1024)fail(400,'Evidence must be 8 bytes to 4 MB')
      const isPNG=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),isJPEG=bytes[0]===255&&bytes[1]===216&&bytes[2]===255
      if(!(b.mime==='image/png'&&isPNG || b.mime==='image/jpeg'&&isJPEG))fail(400,'File signature mismatch')
      if(db.prepare('SELECT COUNT(*) n FROM evidence WHERE complaintId=?').get(c.id).n>=20)fail(429,'Maximum 20 evidence files per complaint')
      const loc=coordinates(b),now=Date.now(),sha=crypto.createHash('sha256').update(bytes).digest('hex')
      const reasons=['AI_DETECTOR_UNAVAILABLE','EDIT_DETECTION_UNAVAILABLE','CAPTURE_METADATA_CLIENT_ASSERTED']
      if(db.prepare('SELECT 1 FROM evidence WHERE sha=?').get(sha))reasons.push('EXACT_PHOTO_REUSED')
      if(loc.lat==null)reasons.push('PHOTO_LOCATION_MISSING');else if(metres(c,loc)>150)reasons.push('PHOTO_LOCATION_MISMATCH')
      if(loc.accuracy==null||loc.accuracy>100)reasons.push('LOCATION_ACCURACY_UNCERTAIN')
      if(b.capturedTs!=null&&(!Number.isSafeInteger(b.capturedTs)||b.capturedTs>now+300000))fail(400,'Invalid capture time')
      if(b.capturedTs==null)reasons.push('CAPTURE_TIME_MISSING');else if(now-b.capturedTs>7*86400000)reasons.push('OLD_PHOTO')
      const id=crypto.randomUUID()
      db.prepare('INSERT INTO evidence VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,c.id,u.username,b.stage,b.mime,bytes,sha,now,b.capturedTs??null,loc.lat,loc.lon,loc.accuracy,JSON.stringify(reasons))
      const all=[...new Set([...JSON.parse(c.reasons),...reasons])];change(c,u,'Evidence received',{reasons:JSON.stringify(all)})
      res.status(201);return {evidenceId:id,reasons,decision:'human_review',confidence:null,serverReceivedTs:now,notice:'Signals do not prove AI generation, GPS authenticity or capture time'}
    })
    app.get('/api/evidence/:id',(req,res)=>{const u=authUser(req),e=db.prepare('SELECT * FROM evidence WHERE id=?').get(req.params.id);if(!e)return res.status(404).json({error:'Evidence not found'});if(!member(u,get(e.complaintId)))return res.status(403).json({error:'Private evidence access required'});res.set('Content-Type',e.mime).set('Cache-Control','no-store').set('X-Content-Type-Options','nosniff').send(e.bytes)})
    route('post','/api/complaints/:id/repair',(req,u,b)=>{const c=complaint(req);worker(u,c);if(!c.accepted)fail(409,'Accept assignment first');if(['Resolved','Verification Pending'].includes(c.status))fail(409,'Repair cannot be submitted at this stage');const note=reason(b.note);const ev=db.prepare('SELECT stage,actor FROM evidence WHERE complaintId=?').all(c.id);if(!ev.some(x=>x.stage==='before')||!ev.some(x=>x.stage==='after'&&x.actor===u.username))fail(409,'Before evidence and your after evidence required');return {complaint:serialize(change(c,u,'Repair submitted',{status:'Verification Pending',repairActor:u.username,latestUpdate:note}),u),verification:'pending'}})
    route('post','/api/complaints/:id/verify',(req,u,b)=>{const c=complaint(req);if(c.status!=='Verification Pending')fail(409,'Repair verification not pending');if(!(u?.username===c.author||u?.role==='reviewer')||u.username===c.repairActor)fail(403,'Citizen owner or independent reviewer required');if(!['approve','dispute'].includes(b.decision))fail(400,'approve or dispute required');const note=reason(b.reason);db.prepare('INSERT INTO reviews(complaintId,actor,decision,reason,ts) VALUES (?,?,?,?,?)').run(c.id,u.username,b.decision,note,Date.now());const approved=b.decision==='approve';return {complaint:serialize(change(c,u,'Resolution '+b.decision,{status:approved?'Resolved':'In Progress',resolvedTs:approved?Date.now():null,latestUpdate:note}),u),notice:'Human confirmation recorded; not independent physical attestation'}})
    route('post','/api/complaints/:id/evidence-review',(req,u,b)=>{const c=complaint(req);if(u?.role!=='reviewer')fail(403,'Reviewer required');if(!['needs_reupload','accepted_for_work','needs_site_visit'].includes(b.decision))fail(400,'Invalid review decision');const note=reason(b.reason);db.prepare('INSERT INTO reviews(complaintId,actor,decision,reason,ts) VALUES (?,?,?,?,?)').run(c.id,u.username,b.decision,note,Date.now());audit(c.id,u.username,'Evidence reviewed',null,{decision:b.decision,reason:note});return {decision:b.decision,automaticRejection:false}})
    route('post','/api/complaints/:id/priority',(req,u,b)=>{const c=complaint(req);supervisor(u);if(!Object.hasOwn(PRIORITY_DAYS,b.priority))fail(400,'Invalid priority');const note=reason(b.reason);const due=Math.min(c.deadlineTs,Date.now()+PRIORITY_DAYS[b.priority]*86400000);return {complaint:serialize(change(c,u,'Severity reviewed',{priority:b.priority,severityReasons:JSON.stringify(['HUMAN_REVIEW:'+note]),deadlineTs:due,deadline:fmtDate(due)}),u)}})
    route('post','/api/complaints/:id/link',(req,u,b)=>{const c=complaint(req);if(!['reviewer','supervisor'].includes(u?.role))fail(403,'Reviewer required');const target=get(b.target);if(!target||target.id===c.id||c.category!==target.category||c.ward!==target.ward||metres(c,target)>100)fail(400,'Same category and ward within 100m required');const note=reason(b.reason);const old=c.issueId;db.prepare('UPDATE complaints SET issueId=? WHERE issueId=?').run(target.issueId,old);audit(c.id,u.username,'Issue cluster linked',{issueId:old},{issueId:target.issueId,reason:note});return {issueId:target.issueId,complaintsPreserved:true}})
    route('get','/api/complaints/:id/related',(req,u)=>{const c=complaint(req);if(!member(u,c))fail(403,'Private access required');return {candidates:candidates(c).map(x=>({id:x.id,status:x.status,issueId:x.issueId})),recurrences:candidates(c).filter(x=>x.status==='Resolved'||x.reopenCount>0).length}})
    route('get','/api/work-queue',(req,u)=>{if(!u||!['official','supervisor','reviewer'].includes(u.role))fail(403,'Staff login required');const all=u.role==='supervisor'||u.role==='reviewer',rows=db.prepare('SELECT * FROM complaints').all().filter(c=>all||c.officer===u.username);return {complaints:rows.map(c=>serialize(c,u)),transfers:db.prepare("SELECT * FROM transfers WHERE state='pending'").all().filter(t=>all||t.target===u.username||rows.some(c=>c.id===t.complaintId)),extensions:u.role==='supervisor'?db.prepare("SELECT * FROM extensions WHERE state='pending'").all():[],notifications:'internal_only'}})
    route('get','/api/escalations',(req,u)=>{supervisor(u);sweep();return {tasks:db.prepare('SELECT * FROM escalation_tasks ORDER BY ts DESC').all(),delivery:'internal_queue_only'}})
    route('post','/api/complaints/:id/escalations/:level/accept',(req,u,b)=>{supervisor(u);const c=complaint(req),level=Number(req.params.level),note=reason(b.reason);const task=db.prepare('SELECT * FROM escalation_tasks WHERE complaintId=? AND cycle=? AND level=?').get(c.id,c.reopenCount,level);if(!task)fail(404,'Escalation not found');if(task.state!=='pending')fail(409,'Already accepted');db.prepare("UPDATE escalation_tasks SET state='accepted',acceptedBy=? WHERE complaintId=? AND cycle=? AND level=?").run(u.username,c.id,c.reopenCount,level);audit(c.id,u.username,'Escalation accepted',task,{reason:note});return {ok:true,ownerRemains:c.officer}})
    route('get','/api/audit',(req,u)=>{supervisor(u);const rows=db.prepare('SELECT * FROM audit ORDER BY seq').all();let prev='',valid=true;for(const r of rows){const hash=crypto.createHash('sha256').update(JSON.stringify([r.complaintId,r.actor,r.action,r.ts,r.beforeJson,r.afterJson,r.prevHash])).digest('hex');if(r.prevHash!==prev||r.hash!==hash)valid=false;prev=r.hash}return {valid,events:rows,limit:'Local hash chain, not externally anchored; database administrators can replace the file'}})
    function metrics(rows) {
      const resolved=rows.filter(x=>x.resolvedTs&&x.status==='Resolved'),times=resolved.map(x=>(x.resolvedTs-x.submittedTs)/3600000).sort((a,b)=>a-b)
      return {total:rows.length,resolved:resolved.length,pending:rows.length-resolved.length,overdue:rows.filter(x=>x.status!=='Resolved'&&Date.now()>x.deadlineTs).length,escalated:rows.filter(x=>x.status!=='Resolved'&&x.escalationLevel>0).length,uniqueIssues:new Set(rows.map(x=>x.issueId)).size,reopenCount:rows.reduce((s,x)=>s+x.reopenCount,0),medianResolutionHours:times.length?times[Math.floor(times.length/2)]:null,withinOriginalSLA:resolved.filter(x=>x.resolvedTs<=x.originalDeadlineTs).length,bySeverity:Object.fromEntries(Object.keys(PRIORITY_DAYS).map(p=>[p,rows.filter(x=>x.priority===p).length]))}
    }
    route('get','/api/stats/public',()=>{sweep();return {...metrics(db.prepare("SELECT * FROM complaints WHERE author!=''").all()),excludesLegacyDemo:true,impactCausality:'not_established'}})
    route('get','/api/stats/comparison',()=>{sweep();const rows=db.prepare("SELECT * FROM complaints WHERE author!=''").all(),depts=[...new Set(rows.map(x=>x.dept))];return {departments:depts.map(dept=>{const subset=rows.filter(x=>x.dept===dept);return {dept,...metrics(subset),sampleSize:subset.length,comparisonEligible:subset.length>=10,ranking:null}}),notice:'Descriptive counts, severity mix and original SLA; no speed-only ranking or causal impact claims'}})
    route('get','/api/stats/workload',(req,u)=>{supervisor(u);sweep();const rows=db.prepare("SELECT * FROM complaints WHERE author!=''").all();return {officers:[...new Set(rows.map(x=>x.officer))].map(officer=>({officer,...metrics(rows.filter(x=>x.officer===officer))})),ranking:null}})
    route('get','/api/stats/hotspots',(req,u)=>{supervisor(u);const rows=db.prepare("SELECT * FROM complaints WHERE author!=''").all(),groups=new Map();for(const c of rows){if(c.lat==null)continue;const key=c.category+':'+c.lat.toFixed(3)+':'+c.lon.toFixed(3);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(c)}return {hotspots:[...groups.entries()].map(([cell,x])=>({cell,reports:x.length,uniqueIssues:new Set(x.map(c=>c.issueId)).size,recurrences:x.reduce((s,c)=>s+c.reopenCount,0),maintenanceReview:x.length>=3,reason:'Repeated complaint counts; heuristic, not a trained prediction'})),predictionModel:'not_trained'}})
    route('post','/api/complaints/:id/impact',(req,u,b)=>{const c=complaint(req);worker(u,c);if(!['water_loss_litres','road_closure_hours','repair_cost_inr'].includes(b.metric)||typeof b.value!=='number'||!Number.isFinite(b.value)||b.value<0||!text(b.unit))fail(400,'Valid metric, nonnegative value and unit required');const note=reason(b.note);db.prepare('INSERT INTO impact(complaintId,actor,metric,value,unit,note,ts) VALUES (?,?,?,?,?,?,?)').run(c.id,u.username,b.metric,b.value,text(b.unit),note,Date.now());audit(c.id,u.username,'Impact observation recorded',null,{metric:b.metric,value:b.value,unit:b.unit,source:'officer_reported'});return {recorded:true,verified:false}})
    route('get','/api/impact',(req,u)=>{supervisor(u);return {observations:db.prepare('SELECT * FROM impact ORDER BY ts DESC').all(),notice:'Reported observations only; baseline/control data and independent measurement needed to claim reduction'}})
  }
  return {mount,sweep}
}
