/* Prototype workflows. Configured routes and reviewers are local demo identities,
   not a municipal integration. No AI or identity-verification claims are fabricated. */
const crypto = require('crypto')
const analytics = require('./analytics.cjs')
const images = require('./images.cjs')
const detector = require('./detector.cjs')
const trust = require('./evidence-trust.cjs')
const provenance = require('./provenance.cjs')
const { DEPARTMENTS } = require('./seed.cjs')
const jurisdiction = require('./jurisdiction.cjs')
const DEMO_WARDS = ['Ward 12 - Gomti Nagar','Ward 8 - Aliganj','Ward 3 - Hazratganj']
const reference = require('./reference.cjs')
const phoneLib = require('./phone.cjs')
module.exports = ({ db, hashPassword, fmtDate, fmtTs, PRIORITY_DAYS }) => {
  db.pragma('foreign_keys = ON')
  const columns = {
    intakeActor:'TEXT', originalDeadlineTs:'INTEGER', lat:'REAL', lon:'REAL', accuracy:'REAL', issueId:'TEXT',
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
  for(const [name,type] of Object.entries({dhash:'TEXT',lowInformation:'INTEGER DEFAULT 0'})) if(!db.prepare('PRAGMA table_info(evidence)').all().some(c=>c.name===name)) db.exec(`ALTER TABLE evidence ADD COLUMN ${name} ${type}`)
  const evidenceColumns={trustLevel:"TEXT NOT NULL DEFAULT 'needs_review'",riskReasons:"TEXT NOT NULL DEFAULT '[]'",captureMethod:"TEXT NOT NULL DEFAULT 'web_upload'",captureSessionUsed:'INTEGER NOT NULL DEFAULT 0',deviceIntegrity:"TEXT NOT NULL DEFAULT 'unavailable'",provenanceStatus:"TEXT NOT NULL DEFAULT 'unsupported'",originalSha256:'TEXT',integrityRequestHash:'TEXT',c2paStatus:"TEXT NOT NULL DEFAULT 'unsupported'",reviewDecision:'TEXT',reviewedBy:'TEXT',reviewedAt:'INTEGER'}
  for(const [name,type] of Object.entries(evidenceColumns))if(!db.prepare('PRAGMA table_info(evidence)').all().some(c=>c.name===name))db.exec(`ALTER TABLE evidence ADD COLUMN ${name} ${type}`)
  if(!db.prepare('PRAGMA table_info(reviews)').all().some(c=>c.name==='evidenceId'))db.exec('ALTER TABLE reviews ADD COLUMN evidenceId TEXT')
  const sessions=require('./evidence-sessions.cjs')({db,audit,fail})
  db.exec('CREATE INDEX IF NOT EXISTS idx_complaints_submitted ON complaints(submittedTs DESC);CREATE INDEX IF NOT EXISTS idx_complaints_issue ON complaints(issueId);CREATE INDEX IF NOT EXISTS idx_evidence_complaint ON evidence(complaintId);CREATE INDEX IF NOT EXISTS idx_evidence_ts ON evidence(ts);CREATE INDEX IF NOT EXISTS idx_audit_complaint_seq ON audit(complaintId,seq)')
  db.exec(`CREATE TABLE IF NOT EXISTS intake_keys(actor TEXT,key TEXT,digest TEXT,complaintId TEXT,PRIMARY KEY(actor,key));`)
  db.exec('UPDATE complaints SET originalDeadlineTs=deadlineTs WHERE originalDeadlineTs IS NULL; UPDATE complaints SET issueId=id WHERE issueId IS NULL;')
  // Mark legacy records as unverified. Preserve their text only in the restricted legacy timeline.
  db.exec("UPDATE complaints SET latestUpdate='Legacy demo record: historical evidence and verification claims are unverified.' WHERE author='' AND latestUpdate LIKE '%verif%'")
  if (process.env.DEMO_MODE === 'true') {
    const users = [['alok','Citizen','citizen'],['citizen2','Second citizen','citizen'],['verma','Verma (demo officer)','official'],['sharma','Sharma (demo officer)','official'],['reviewer','Independent demo reviewer','reviewer'],['supervisor','Demo supervisor','supervisor'],['assisted','Assisted reporting desk','intake']]
    for (const [u,n,r] of users) if (!db.prepare('SELECT 1 FROM users WHERE username=?').get(u)) db.prepare('INSERT INTO users(username,passhash,name,role) VALUES (?,?,?,?)').run(u,hashPassword('demo123'),n,r)
    if (process.env.DEMO_GHAZIABAD_ROUTES === 'true') for (const r of reference.demoRoutes()) db.prepare('INSERT OR IGNORE INTO routes VALUES (?,?,?,?,?,0)').run(r.ward,r.category,r.dept,r.officer,r.supervisor)
    if (process.env.DEMO_ROUTES === 'true') for (const ward of DEMO_WARDS) for (const [category,dept] of Object.entries(DEPARTMENTS)) db.prepare('INSERT OR IGNORE INTO routes VALUES (?,?,?,?,?,0)').run(ward,category,dept,'verma','supervisor')
  }
  function configuredRoute(ward, category) {
    // Ignore the old seeded Lucknow routes unless explicitly running their demo.
    // Preserve stored routes and complaints; never silently rewrite historical records.
    if (DEMO_WARDS.includes(ward) && process.env.DEMO_ROUTES !== 'true') return null
    return db.prepare('SELECT * FROM routes WHERE ward=? AND category=?').get(ward,category)
  }
  function audit(id, actor, action, before, after) {
    const prev = db.prepare('SELECT hash FROM audit ORDER BY seq DESC LIMIT 1').get()?.hash || ''
    const redact=value=>{if(!value||typeof value!=='object')return value;return Object.fromEntries(Object.entries(value).filter(([k])=>!['title','description','landmark','lat','lon','accuracy','author','note','reason','latestUpdate','citizenUsername'].includes(k)))}
    const ts=Date.now(), a=JSON.stringify(redact(before) ?? null), b=JSON.stringify(redact(after) ?? null)
    const hash=crypto.createHash('sha256').update(JSON.stringify([id,actor,action,ts,a,b,prev])).digest('hex')
    db.prepare('INSERT INTO audit(complaintId,actor,action,ts,beforeJson,afterJson,prevHash,hash) VALUES (?,?,?,?,?,?,?,?)').run(id,actor,action,ts,a,b,prev,hash)
    const pos=db.prepare('SELECT COUNT(*) n FROM events WHERE complaintId=?').get(id).n
    db.prepare('INSERT INTO events(complaintId,position,label,at,detail,kind) VALUES (?,?,?,?,?,?)').run(id,pos,action,fmtTs(ts),'Authenticated workflow event','done')
  }
  // Snapshot server-stored IDs at the cycle boundary: timestamps alone can tie.
  // No schema migration or client capture-time trust is needed.
  const evidenceBoundary = id => ({priorEvidenceIds:db.prepare('SELECT id FROM evidence WHERE complaintId=?').all(id).map(e=>e.id)})
  const EVIDENCE_BLOCKING=['needs_reupload','needs_site_visit'] // latest reviewer decision wins; unreviewed evidence still counts
  const evidenceEligible=e=>!EVIDENCE_BLOCKING.includes(e.reviewDecision)
  function currentEvidence(id) {
    const boundary=db.prepare("SELECT ts,afterJson FROM audit WHERE complaintId=? AND action IN ('Citizen dispute','Resolution dispute') ORDER BY seq DESC LIMIT 1").get(id)
    const prior=boundary?JSON.parse(boundary.afterJson).priorEvidenceIds:null
    return db.prepare('SELECT id,stage,actor,ts,reviewDecision FROM evidence WHERE complaintId=?').all(id).filter(e=>
      !boundary || (Array.isArray(prior)?!prior.includes(e.id):e.ts>boundary.ts)) // old audit entries fail closed on timestamp ties
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
  function member(u,c) { return u && (u.username===c.author || (u.role==='intake'&&u.username===c.intakeActor) || ['reviewer','supervisor'].includes(u.role) || (u.role==='official' && u.username===c.officer)) }
  function worker(u,c) { if(!u || !(u.role==='supervisor'||u.role==='official'&&u.username===c.officer)) fail(403,'Assigned officer or supervisor required') }
  function supervisor(u) { if(u?.role!=='supervisor') fail(403,'Supervisor required') }
  function serialize(c,u) {
    const overdue=c.status!=='Resolved'&&Date.now()>c.deadlineTs
    const base={id:c.id,status:c.status,category:c.category,priority:c.priority,submittedAt:c.submittedAt,deadline:c.deadline,dept:c.dept,escalationLevel:c.escalationLevel,overdue,stage:c.status,legacyDemo:!c.author}
    if(!member(u,c)) return {...base,latestUpdate:`${c.status}. Public tracking omits private complaint details.`,timeline:[]}
    const {submittedTs,deadlineTs,...rest}=c
    const suggestion=c.status==='Routing Review'&&['reviewer','supervisor'].includes(u.role)?{routingSuggestion:reference.suggestRoute(c)}:{}
    return {...rest,...base,...suggestion,reasons:JSON.parse(c.reasons),severityReasons:JSON.parse(c.severityReasons),timeline:db.prepare('SELECT actor,action AS label,ts,beforeJson,afterJson FROM audit WHERE complaintId=? ORDER BY seq').all(c.id),evidence:db.prepare('SELECT id,stage,actor,mime,sha,ts,capturedTs,reasons,trustLevel,riskReasons,captureMethod,captureSessionUsed,deviceIntegrity,provenanceStatus,originalSha256,c2paStatus,reviewDecision,reviewedBy,reviewedAt FROM evidence WHERE complaintId=?').all(c.id).map(e=>({...e,reasons:JSON.parse(e.reasons),riskReasons:JSON.parse(e.riskReasons),captureSessionUsed:Boolean(e.captureSessionUsed)})),reviewHistory:db.prepare('SELECT id,evidenceId,actor,decision,reason,ts FROM reviews WHERE complaintId=? ORDER BY id').all(c.id)}
  }
  function change(c,u,action,values,auditExtras={}) {
    const keys=Object.keys(values)
    db.prepare(`UPDATE complaints SET ${keys.map(k=>k+'=?').join(',')} WHERE id=?`).run(...Object.values(values),c.id)
    audit(c.id,u.username,action,c,{...values,...auditExtras})
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
  /* NOTE: the status field currently mixes work stage (In Progress / Verification
     Pending / Reopened) with deadline state (Overdue / Escalated). Splitting stage from
     escalation is a planned API change and is intentionally NOT done here: the frontend
     consumes the current contract. */
  function sweep(now=Date.now()) {
    return db.transaction(()=>{
      const changes=[]
      for(const c of db.prepare("SELECT * FROM complaints WHERE status!='Resolved' AND deadlineTs < ?").all(now)) {
        const days=Math.floor((now-c.deadlineTs)/86400000), level=days>=7?3:days>=2?2:1
        const route=configuredRoute(c.ward,c.category)
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
  /* Field-by-field retention policy for resolved complaints older than 90 days:
     - deleted: evidence blobs (photos, the largest personal/location store)
     - redacted: title, description, landmark, coordinates, ward, latestUpdate
     - pseudonymized: author (citizen identity; aggregate stats keep counting the case)
     - retained for accountability: category, priority, status/deadline history, officer
       and audit actors - the minimum needed to answer "was this case handled on time".
     Legacy append-only audit rows and operator backups are outside this sweep's reach
     and remain flagged below for an operator policy. */
  function retention(now=Date.now()) {
    sessions.cleanup(now)
    return db.transaction(()=>{const old=db.prepare("SELECT id FROM complaints WHERE status='Resolved' AND resolvedTs<? AND (lat IS NOT NULL OR description!='[retention redacted]' OR (author!='' AND author!='retention-redacted') OR ward!='[retention redacted]' OR latestUpdate!='[retention redacted]')").all(now-90*86400000);let removed=0;for(const c of old){removed+=db.prepare('DELETE FROM evidence WHERE complaintId=?').run(c.id).changes;db.prepare("UPDATE complaints SET lat=NULL,lon=NULL,accuracy=NULL,landmark='',description='[retention redacted]',title='[retention redacted]',ward='[retention redacted]',latestUpdate='[retention redacted]',author='retention-redacted' WHERE id=?").run(c.id)}if(old.length)audit('PRIVACY','system','Retention sweep',null,{complaints:old.length,evidenceRemoved:removed});return {complaintsRedacted:old.length,evidenceRemoved:removed,fieldsRedacted:['title','description','landmark','coordinates','ward','latestUpdate'],fieldsPseudonymized:['author'],retainedForAccountability:['category','priority','status history','officer','audit actors'],backups:'not_managed',historicalAudit:'append_only_legacy_PII_not_removed'}})()
  }
  function mount(app,authUser) {
    const route=(method,path,fn)=>app[method](path,(req,res,next)=>{try {const u=authUser(req); const body=req.body||{}; const result=db.transaction(()=>fn(req,u,body,res))(); if(!res.headersSent) res.json(result)} catch(e){if(e.status)res.status(e.status).json({error:e.message});else next(e)}})
    const escalationLevel=v=>{if(!['1','2','3'].includes(v))fail(400,'Escalation level must be 1, 2 or 3');return Number(v)}
    const numId=v=>{if(typeof v!=='string'||!/^[1-9]\d{0,9}$/.test(v))fail(400,'Invalid identifier');return Number(v)}
    const complaint=req=>{const c=get(req.params.id);if(!c)fail(404,'Complaint not found');return c}
    route('get','/api/capabilities',()=>({version:2,evidenceNotice:trust.NOTICE,evidenceTrust:{reviewOnly:true,captureSessionTTLSeconds:120,liveCameraWithoutSession:'400_error',deviceIntegrity:'client_declared_unverified',provenance:'unsupported_local_validator_not_bundled'},demoMode:process.env.DEMO_MODE==='true',identity:{phoneNumber:'saved_unverified_no_otp_no_sms',aadhaar:'out_of_scope'},imageDetection:detector.status(),imageSimilarity:'local_dhash_review_only',predictiveRisk:'history_heuristic_not_trained',offlineSync:'idempotent_authenticated_intake',retention:'resolved_evidence_90_days_and_pii_redaction',otpPrototype:'not_connected_no_free_SMS_rail',gps:'client_asserted_not_attested',jurisdictions:jurisdiction.status().status,municipality:'Ghaziabad',demoRoutes:process.env.DEMO_ROUTES==='true',languages:['en','hi'],assistedIntake:true,notifications:'internal_queue_only'}))
    route('get','/api/translations',(req)=>({languages:['en','hi'],strings:require('./i18n.cjs').strings,regionalLanguages:'not_translated',coverage:'common errors and acknowledgement only; English fallback disclosed'}))
    route('get','/api/jurisdictions',()=>jurisdiction.status())
    route('get','/api/jurisdictions/officer-hints',(req,u)=>{if(!['reviewer','supervisor'].includes(u?.role))fail(403,'Reviewer or supervisor required');return require('./officer-hints.cjs').lookup(Number(req.query.ward))})
    route('get','/api/reference/charter',()=>reference.charter())
    route('get','/api/reference/locality',(req)=>{const m=reference.matchLocality(String(req.query.q||'').slice(0,140));return {...m,requiresHumanReview:true,automaticAssignment:false,...reference.staleness(),source:reference.seed.wardLocalities.source}})
    route('get','/api/jurisdictions/lookup',(req)=>{
      const num=v=>v===undefined?null:(typeof v==='string'&&v.trim()!==''&&Number.isFinite(Number(v))?Number(v):fail(400,'Invalid query parameters'));const location=coordinates({lat:num(req.query.lat),lon:num(req.query.lon)},true)
      return jurisdiction.lookup(location)
    })
    route('get','/api/complaints',(req,u)=>{sweep();const intParam=(v,d,lo,hi)=>{if(v===undefined)return d;if(typeof v!=='string'||!/^\d{1,6}$/.test(v)||Number(v)<lo||Number(v)>hi)fail(400,'Invalid query parameters');return Number(v)};const offset=intParam(req.query.offset,0,0,1e6),limit=intParam(req.query.limit,25,1,100);const where=[],args=[];if(req.query.mine==='true'){if(!u)fail(401,'Login required');where.push('author=?');args.push(u.username)}if(req.query.status&&req.query.status!=='all'){where.push('status=?');args.push(String(req.query.status))}if(req.query.q){const q=String(req.query.q).toLowerCase().replace(/[\\%_]/g,m=>'\\'+m);where.push("lower(id||' '||category) LIKE ? ESCAPE '\\'");args.push('%'+q+'%')}const w=where.length?' WHERE '+where.join(' AND '):'';const total=db.prepare('SELECT COUNT(*) n FROM complaints'+w).get(...args).n;const rows=db.prepare('SELECT * FROM complaints'+w+' ORDER BY submittedTs DESC, id DESC LIMIT ? OFFSET ?').all(...args,limit,offset);return {total,complaints:rows.map(c=>serialize(c,u))}})
    route('get','/api/complaints/:id',(req,u)=>{sweep();return {complaint:serialize(complaint(req),u)}})
    route('post','/api/complaints',(req,u,b,res)=>{
      if(!u)fail(401,'Login required; use assisted desk for offline intake')
      for(const key of ['title','description','ward'])if(!text(b[key]))fail(400,key+' required')
      if(!Object.hasOwn(DEPARTMENTS,b.category))fail(400,'Invalid category')
      const key=text(req.headers['idempotency-key'],120)
      const digest=crypto.createHash('sha256').update(JSON.stringify(b)).digest('hex')
      if(key){const prior=db.prepare('SELECT * FROM intake_keys WHERE actor=? AND key=?').get(u.username,key);if(prior){if(prior.digest!==digest)fail(409,'Idempotency key payload conflict');return {complaint:serialize(get(prior.complaintId),u),acknowledgementNumber:prior.complaintId,replayed:true}}}
      const location=coordinates(b),now=Date.now(),sev=severity(b)
      const r=configuredRoute(text(b.ward),b.category)
      const channel=u.role==='intake'?(b.channel||'assisted'):'web'
      if(!['web','assisted','phone','desk','offline'].includes(channel))fail(400,'Invalid intake channel')
      let author=u.role==='intake'?text(b.citizenUsername):u.username
      if(u.role==='intake'&&!author){author='unclaimed-'+crypto.randomUUID();db.prepare('INSERT INTO users(username,passhash,name,role) VALUES (?,?,?,?)').run(author,hashPassword(crypto.randomBytes(48).toString('hex')),'Unclaimed assisted report','citizen')}
      if(!author||!db.prepare("SELECT 1 FROM users WHERE username=? AND role='citizen'").get(author))fail(400,'Known citizen account required; anonymous/offline unclaimed registration is pending')
      if(b.language&&!['en','hi'].includes(b.language))fail(400,'Supported language codes: en, hi')
      let phone=null;if(b.phone!=null&&b.phone!==''){phone=phoneLib.normalize(b.phone);if(!phone)fail(400,'Valid Indian mobile number required (10 digits, optional +91)')}
      let geoWard=null
      if(location.lat!=null){try{const g=jurisdiction.lookup(location);geoWard=g.matched?g.ward:null}catch(e){/* invalid coords already validated by coordinates() shape; fail closed */}}
      const reasons=[...(geoWard?['GEO_WARD_MATCHED_UNVERIFIED_2022_SBM']:[location.lat==null?'GEO_WARD_NOT_CHECKED':'GEO_WARD_NOT_FOUND']),'CONTENT_UNVERIFIED',...(location.lat==null?['LOCATION_MISSING']:['GPS_CLIENT_ASSERTED']),'JURISDICTION_UNVERIFIED']
      const id='SHG-'+new Date().getFullYear()+'-'+crypto.randomBytes(6).toString('hex').toUpperCase(),deadlineTs=now+Math.min(PRIORITY_DAYS[sev.priority],reference.charterSlaDays(b.category)??Infinity)*86400000
      const c={id,title:text(b.title,140),category:b.category,description:text(b.description),ward:text(b.ward,140),landmark:text(b.landmark,200),status:r?'Assigned':'Routing Review',priority:sev.priority,submittedAt:fmtTs(now),submittedTs:now,deadline:fmtDate(deadlineTs),deadlineTs,originalDeadlineTs:deadlineTs,dept:r?.dept||'Jurisdiction review',officer:r?.officer||null,author,latestUpdate:r?'Configured prototype route assigned; jurisdiction and evidence not verified.':(geoWard?`Likely ward ${geoWard.code} (${geoWard.name}) per 2022 SBM boundaries, unverified; manual routing required.`:'Ward not matched in loaded partial 2022 boundaries: manual routing required.'),...location,issueId:id,reasons:JSON.stringify(reasons),severityReasons:JSON.stringify(sev.reasons),channel,language:b.language||'en',routeVerified:0,intakeActor:u.role==='intake'?u.username:null}
      phoneLib.ensureColumn(db);if(phone)db.prepare('UPDATE users SET phone=? WHERE username=?').run(phone,author)
      db.prepare(`INSERT INTO complaints(${Object.keys(c).join(',')}) VALUES (${Object.keys(c).map(k=>'@'+k).join(',')})`).run(c)
      if(key)db.prepare('INSERT INTO intake_keys VALUES (?,?,?,?)').run(u.username,key,digest,id)
      audit(id,u.username,'Complaint submitted',null,{severity:sev,channel,locationTrust:'unverified'})
      res.status(201);return {complaint:serialize(get(id),u),jurisdiction:{geoWard,boundarySource:'sbm_2022_partial_unverified',officerRouting:'manual_only'},acknowledgementNumber:id,duplicateCandidates:candidates(c).map(x=>({id:x.id,status:x.status,issueId:x.issueId})),requiresHumanReview:true}
    })
    route('post','/api/complaints/:id/status',(req,u,b)=>{
      const c=complaint(req),note=reason(b.note)
      if(b.status==='Reopened'){
        if(u?.username!==c.author)fail(403,'Only complaint owner may reopen')
        if(c.status!=='Resolved')fail(409,'Only resolved complaints can reopen')
        const deadlineTs=Date.now()+Math.min(PRIORITY_DAYS[c.priority],reference.charterSlaDays(c.category)??Infinity)*86400000
        return {complaint:serialize(change(c,u,'Citizen dispute',{status:'Reopened',latestUpdate:note,deadlineTs,deadline:fmtDate(deadlineTs),escalationLevel:0,resolvedTs:null,reopenCount:c.reopenCount+1,repairActor:null},evidenceBoundary(c.id)),u)}
      }
      worker(u,c)
      if(b.status!=='In Progress')fail(400,'Use repair submission and independent verification to resolve; only In Progress supported here')
      if(!['Assigned','Reopened','Overdue','Escalated','In Progress'].includes(c.status))fail(409,'Invalid transition')
      if(!c.accepted)fail(409,'Accept assignment first')
      const next=change(c,u,'Work progress',{status:'In Progress',latestUpdate:note});sweep();return {complaint:serialize(get(next.id),u)}
    })
    route('post','/api/complaints/:id/events',()=>{fail(410,'Arbitrary timeline events disabled; use authenticated workflow endpoints')})
    route('get','/api/complaints/:id/contact',(req,u)=>{const c=complaint(req);if(!u||!(u.role==='supervisor'||u.role==='official'&&u.username===c.officer))fail(403,'Supervisor or assigned officer required');phoneLib.ensureColumn(db);const r=db.prepare('SELECT phone FROM users WHERE username=?').get(c.author);audit(c.id,u.username,'Citizen contact viewed',null,null);return {phone:r?.phone||null,verified:false,notice:'Citizen-supplied number, not verified. No OTP or SMS is used. For case follow-up only.'}})
    route('post','/api/complaints/:id/accept',(req,u,b)=>{const c=complaint(req);worker(u,c);return {complaint:serialize(change(c,u,'Assignment accepted',{accepted:1,latestUpdate:'Assignment accepted.'}),u)}})
    route('post','/api/routes',(req,u,b)=>{
      supervisor(u);if(!Object.hasOwn(DEPARTMENTS,b.category)||!text(b.ward)||!text(b.dept))fail(400,'ward, category, dept required')
      if(!db.prepare("SELECT 1 FROM users WHERE username=? AND role='official'").get(b.officer)||!db.prepare("SELECT 1 FROM users WHERE username=? AND role='supervisor'").get(b.supervisor))fail(400,'Known officer and supervisor required')
      const note=reason(b.reason)
      db.prepare('INSERT OR REPLACE INTO routes VALUES (?,?,?,?,?,?)').run(text(b.ward),b.category,text(b.dept),b.officer,b.supervisor,0)
      audit('CONFIG',u.username,'Routing configuration updated',null,{...b,reason:note,verified:false});return {ok:true,verified:false,notice:'Configuration is not proof of municipal jurisdiction'}
    })
    route('post','/api/complaints/:id/route',(req,u,b)=>{supervisor(u);const c=complaint(req);if(c.status==='Resolved')fail(409,'Resolved complaints cannot be routed; owner must reopen first');const note=reason(b.reason),r=configuredRoute(c.ward,c.category);if(!r)fail(409,'Configure this ward and category first');return {complaint:serialize(change(c,u,'Jurisdiction routing reviewed',{dept:r.dept,officer:r.officer,status:'Assigned',accepted:0,routeVerified:0,latestUpdate:note}),u),jurisdiction:'configured_not_geographically_verified'}})
    route('get','/api/staff',(req,u)=>{supervisor(u);return {staff:db.prepare("SELECT username,name FROM users WHERE role='official' ORDER BY username").all(),accountScope:'demo_staff_accounts_only'}})
    route('post','/api/complaints/:id/assign',(req,u,b)=>{supervisor(u);const c=complaint(req);if(c.status==='Resolved')fail(409,'Resolved complaints cannot be assigned; owner must reopen first');const target=text(b.officer,64);if(!db.prepare("SELECT 1 FROM users WHERE username=? AND role='official'").get(target))fail(400,'Known officer required');if(target===c.officer)fail(400,'Complaint is already assigned to this officer');const note=reason(b.reason);const dept=DEPARTMENTS[c.category]||c.dept;return {complaint:serialize(change(c,u,'Officer assigned',{dept,officer:target,status:'Assigned',accepted:0,routeVerified:0,latestUpdate:note}),u),assignment:'supervisor_selected_demo_account'}})
    route('post','/api/complaints/:id/transfer',(req,u,b)=>{const c=complaint(req);worker(u,c);if(!db.prepare("SELECT 1 FROM users WHERE username=? AND role='official'").get(b.target)||b.target===c.officer)fail(400,'Different known officer required');if(db.prepare("SELECT 1 FROM transfers WHERE complaintId=? AND state='pending'").get(c.id))fail(409,'Transfer already pending');const note=reason(b.reason);const t=db.prepare('INSERT INTO transfers(complaintId,requester,target,reason) VALUES (?,?,?,?)').run(c.id,u.username,b.target,note);audit(c.id,u.username,'Transfer requested',null,{id:Number(t.lastInsertRowid),target:b.target,reason:note});return {transferId:Number(t.lastInsertRowid),ownerRemains:c.officer}})
    route('post','/api/transfers/:id/accept',(req,u)=>{const t=db.prepare('SELECT * FROM transfers WHERE id=?').get(numId(req.params.id));if(!t)fail(404,'Transfer not found');if(u?.username!==t.target)fail(403,'Target officer required');if(t.state!=='pending')fail(409,'Transfer not pending');const c=get(t.complaintId);if(!c)fail(404,'Complaint not found');if(c.status==='Resolved')fail(409,'Resolved complaint cannot change owner; reopen first');if(db.prepare("UPDATE transfers SET state='accepted' WHERE id=? AND state='pending'").run(t.id).changes!==1)fail(409,'Transfer not pending');return {complaint:serialize(change(c,u,'Transfer accepted',{officer:u.username,accepted:1}),u)}})
    route('post','/api/complaints/:id/extensions',(req,u,b)=>{const c=complaint(req);worker(u,c);const note=reason(b.reason);if(!Number.isSafeInteger(b.deadlineTs)||b.deadlineTs<=Math.max(c.deadlineTs,Date.now())||b.deadlineTs> Date.now()+30*86400000)fail(400,'Future deadline within 30 days required');if(db.prepare("SELECT 1 FROM extensions WHERE complaintId=? AND state='pending'").get(c.id))fail(409,'Extension pending');const x=db.prepare('INSERT INTO extensions(complaintId,requester,deadlineTs,reason) VALUES (?,?,?,?)').run(c.id,u.username,b.deadlineTs,note);audit(c.id,u.username,'Extension requested',null,{id:Number(x.lastInsertRowid),reason:note,deadlineTs:b.deadlineTs});return {extensionId:Number(x.lastInsertRowid),state:'pending'}})
    route('post','/api/extensions/:id/review',(req,u,b)=>{supervisor(u);const x=db.prepare('SELECT * FROM extensions WHERE id=?').get(numId(req.params.id));if(!x)fail(404,'Extension not found');if(x.requester===u.username)fail(403,'Independent approval required');if(x.state!=='pending')fail(409,'Already reviewed');{const xc=get(x.complaintId);if(!xc)fail(404,'Complaint not found');if(xc.status==='Resolved'&&b.decision==='approve')fail(409,'Resolved complaint deadline cannot be extended; reopen first')}if(x.deadlineTs<=Date.now()&&b.decision==='approve')fail(409,'Requested extension is no longer in the future');if(!['approve','deny'].includes(b.decision))fail(400,'approve or deny required');const note=reason(b.reason);db.prepare('UPDATE extensions SET state=? WHERE id=?').run(b.decision,x.id);const c=get(x.complaintId);if(b.decision==='approve')change(c,u,'Extension approved',{deadlineTs:x.deadlineTs,deadline:fmtDate(x.deadlineTs),latestUpdate:note,status:['Overdue','Escalated'].includes(c.status)?'In Progress':c.status});else audit(c.id,u.username,'Extension denied',x,{reason:note});return {state:b.decision,complaint:serialize(get(c.id),u)}})
    route('post','/api/complaints/:id/evidence-session',(req,u)=>{
      if(!u)fail(401,'Login required')
      const c=complaint(req);if(!member(u,c))fail(403,'Private evidence access required')
      return sessions.create(c,u)
    })
    /* Evidence upload, ordered so nothing expensive runs before every cheap check passes:
       authentication, complaint access, stage, officer role, declared MIME, base64 shape,
       encoded length, decoded byte size, file signature, per-user rate limit - and only
       then Sharp decode (with its own pixel limits) and the optional AI detector. */
    const uploadHits=new Map() // username -> recent validated upload timestamps (in-memory, bounded)
    const UPLOAD_WINDOW_MS=10*60*1000, UPLOAD_MAX_PER_WINDOW=20, UPLOAD_MAP_MAX=1000
    function uploadAllowed(username){
      const now=Date.now(),recent=(uploadHits.get(username)||[]).filter(ts=>now-ts<UPLOAD_WINDOW_MS)
      if(recent.length>=UPLOAD_MAX_PER_WINDOW){uploadHits.set(username,recent);return false}
      if(!uploadHits.has(username)&&uploadHits.size>=UPLOAD_MAP_MAX)for(const k of uploadHits.keys()){uploadHits.delete(k);if(uploadHits.size<UPLOAD_MAP_MAX)break}
      recent.push(now);uploadHits.set(username,recent);return true
    }
    app.post('/api/complaints/:id/evidence',async(req,res,next)=>{
      try {
        res.setTimeout(30000)
        const u=authUser(req),c=get(req.params.id)
        if(!c||!member(u,c))return res.status(403).json({error:'Private evidence access required'})
        const b=req.body||{}
        req.evidenceDeclarations=trust.declarations(b)
        sessions.validate(b,c,u)
        coordinates(b)
        if(b.capturedTs!=null&&(!Number.isSafeInteger(b.capturedTs)||b.capturedTs>Date.now()+300000))fail(400,'Invalid capture time')
        if(!['before','after','dispute'].includes(b.stage))return res.status(400).json({error:'before, after or dispute required'})
        if(b.stage==='after'&&!(u&&(u.role==='supervisor'||u.role==='official'&&u.username===c.officer)))return res.status(403).json({error:'Assigned officer or supervisor required'})
        if(!['image/jpeg','image/png'].includes(b.mime)||typeof b.base64!=='string'||!/^[A-Za-z0-9+/]*={0,2}$/.test(b.base64)||b.base64.length>5600000)return res.status(400).json({error:'PNG/JPEG base64 required'})
        const raw=Buffer.from(b.base64,'base64');if(raw.length<8||raw.length>4*1024*1024)return res.status(400).json({error:'Evidence must be 8 bytes to 4 MB'})
        const isPNG=raw.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),isJPEG=raw[0]===255&&raw[1]===216&&raw[2]===255
        if(!(b.mime==='image/png'&&isPNG || b.mime==='image/jpeg'&&isJPEG))return res.status(400).json({error:'File signature mismatch'})
        if(!uploadAllowed(u.username))return res.status(429).json({error:'Too many uploads. Try again in a few minutes.'})
        if(db.prepare('SELECT COUNT(*) n FROM evidence WHERE complaintId=?').get(c.id).n>=20)fail(429,'Maximum 20 evidence files per complaint')
        req.originalSha256=crypto.createHash('sha256').update(raw).digest('hex')
        req.provenanceSignal=await provenance.inspectOriginal(raw)
        const bytes=await images.reencode(raw) // controlled copy: re-encoded, metadata stripped
        req.imageBytes=bytes
        req.imageInfo=await images.inspect(bytes)
        req.aiSignal=await detector.predict(bytes)
        next()
      }catch(e){res.status(e.status||400).json({error:e.status?e.message:'Image decode failed or pixel limit exceeded'})}
    })
    route('post','/api/complaints/:id/evidence',(req,u,b,res)=>{
      // auth, access, stage, MIME, base64, byte size, signature and rate limit already
      // validated by the middleware above, before any image processing ran.
      const c=complaint(req);if(!member(u,c))fail(403,'Private evidence access required')
      if(db.prepare('SELECT COUNT(*) n FROM evidence WHERE complaintId=?').get(c.id).n>=20)fail(429,'Maximum 20 evidence files per complaint')
      const bytes=req.imageBytes
      const loc=coordinates(b),now=Date.now(),sha=crypto.createHash('sha256').update(bytes).digest('hex')
      const info=req.imageInfo
      const reasons=[req.aiSignal.reason,'EDIT_DETECTION_UNAVAILABLE','CAPTURE_METADATA_CLIENT_ASSERTED']
      if(db.prepare('SELECT 1 FROM evidence WHERE sha=? OR originalSha256=?').get(sha,req.originalSha256))reasons.push('EXACT_PHOTO_REUSED')
      if(info.lowInformation)reasons.push('LOW_INFORMATION_IMAGE_SIMILARITY_UNRELIABLE')
      else if(db.prepare('SELECT dhash FROM evidence WHERE dhash IS NOT NULL AND lowInformation=0 AND ts>? ORDER BY ts DESC LIMIT 2000').all(now-90*86400000).some(e=>images.hamming(e.dhash,info.dhash)<=6))reasons.push('SIMILAR_PHOTO_REVIEW_REQUIRED')
      if(loc.lat==null)reasons.push('PHOTO_LOCATION_MISSING');else if(c.lat==null)reasons.push('COMPLAINT_LOCATION_MISSING');else if(metres(c,loc)>150)reasons.push('PHOTO_LOCATION_MISMATCH')
      if(loc.accuracy==null||loc.accuracy>100)reasons.push('LOCATION_ACCURACY_UNCERTAIN')
      if(b.capturedTs!=null&&(!Number.isSafeInteger(b.capturedTs)||b.capturedTs>now+300000))fail(400,'Invalid capture time')
      if(b.capturedTs==null)reasons.push('CAPTURE_TIME_MISSING');else if(now-b.capturedTs>7*86400000)reasons.push('OLD_PHOTO')
      const declared=req.evidenceDeclarations
      reasons.push('GPS_CLIENT_ASSERTED','DEVICE_INTEGRITY_CLIENT_ASSERTED','PROVENANCE_CLIENT_ASSERTED','C2PA_UNSUPPORTED')
      if(b.clientImageSha256!==undefined&&b.clientImageSha256.toLowerCase()!==req.originalSha256)reasons.push('CLIENT_SHA256_MISMATCH')
      if(declared.captureMethod==='gallery')reasons.push('GALLERY_UPLOAD_REVIEW_REQUIRED')
      if(declared.captureMethod==='web_upload')reasons.push('WEB_UPLOAD_CAPTURE_UNATTESTED')
      if(declared.deviceIntegrity==='failed')reasons.push('DECLARED_DEVICE_INTEGRITY_FAILED')
      if(declared.deviceIntegrity==='unavailable')reasons.push('DEVICE_INTEGRITY_UNAVAILABLE')
      if(declared.provenanceStatus==='invalid')reasons.push('DECLARED_PROVENANCE_INVALID')
      if(b.integrityRequestHash!==undefined)reasons.push('INTEGRITY_REQUEST_HASH_UNVERIFIED')
      const risk=trust.score(reasons),captureSessionUsed=sessions.consume(b,c,u)
      const id=crypto.randomUUID()
      db.prepare('INSERT INTO evidence(id,complaintId,actor,stage,mime,bytes,sha,ts,capturedTs,lat,lon,accuracy,reasons,dhash,lowInformation) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,c.id,u.username,b.stage,b.mime,bytes,sha,now,b.capturedTs??null,loc.lat,loc.lon,loc.accuracy,JSON.stringify(reasons),info.dhash,info.lowInformation?1:0)
      db.prepare('UPDATE evidence SET trustLevel=?,riskReasons=?,captureMethod=?,captureSessionUsed=?,deviceIntegrity=?,provenanceStatus=?,originalSha256=?,integrityRequestHash=?,c2paStatus=? WHERE id=?').run(risk.trustLevel,JSON.stringify(risk.riskReasons),declared.captureMethod,captureSessionUsed?1:0,declared.deviceIntegrity,declared.provenanceStatus,req.originalSha256,b.integrityRequestHash?.toLowerCase()??null,req.provenanceSignal.status,id)
      const all=[...new Set([...JSON.parse(c.reasons),...reasons])];change(c,u,'Evidence received',{reasons:JSON.stringify(all)})
      res.status(201);return {evidenceId:id,reasons,...risk,captureMethod:declared.captureMethod,captureSessionUsed,provenanceSignal:req.provenanceSignal,aiSignal:req.aiSignal,serverReceivedTs:now,notice:trust.NOTICE}
    })
    app.get('/api/evidence/:id',(req,res)=>{const u=authUser(req),e=db.prepare('SELECT * FROM evidence WHERE id=?').get(req.params.id);if(!e)return res.status(404).json({error:'Evidence not found'});if(!member(u,get(e.complaintId)))return res.status(403).json({error:'Private evidence access required'});res.set('Content-Type',e.mime).set('Cache-Control','no-store').set('X-Content-Type-Options','nosniff').send(e.bytes)})
    route('post','/api/complaints/:id/repair',(req,u,b)=>{const c=complaint(req);worker(u,c);if(!c.accepted)fail(409,'Accept assignment first');if(['Resolved','Verification Pending'].includes(c.status))fail(409,'Repair cannot be submitted at this stage');const note=reason(b.note);const ev=currentEvidence(c.id).filter(evidenceEligible);if(!ev.some(x=>x.stage==='before')||!ev.some(x=>x.stage==='after'&&x.actor===u.username))fail(409,'Current-cycle before evidence and your after evidence required (evidence a reviewer marked for re-upload or site visit does not count)');return {complaint:serialize(change(c,u,'Repair submitted',{status:'Verification Pending',repairActor:u.username,latestUpdate:note}),u),verification:'pending'}})
    route('post','/api/complaints/:id/verify',(req,u,b)=>{const c=complaint(req);if(c.status!=='Verification Pending')fail(409,'Repair verification not pending');if(!(u?.username===c.author||u?.role==='reviewer')||u.username===c.repairActor)fail(403,'Citizen owner or independent reviewer required');if(!['approve','dispute'].includes(b.decision))fail(400,'approve or dispute required');const note=reason(b.reason);db.prepare('INSERT INTO reviews(complaintId,actor,decision,reason,ts) VALUES (?,?,?,?,?)').run(c.id,u.username,b.decision,note,Date.now());const approved=b.decision==='approve';return {complaint:serialize(change(c,u,'Resolution '+b.decision,{status:approved?'Resolved':'In Progress',resolvedTs:approved?Date.now():null,latestUpdate:note},approved?{}:evidenceBoundary(c.id)),u),notice:'Human confirmation recorded; not independent physical attestation'}})
    route('post','/api/complaints/:id/evidence-review',(req,u,b)=>{
      const c=complaint(req)
      if(u?.role!=='reviewer')fail(403,'Reviewer required')
      if(!['needs_reupload','accepted_for_work','needs_site_visit'].includes(b.decision))fail(400,'Invalid review decision')
      const note=reason(b.reason),now=Date.now()
      if(b.evidenceId!==undefined&&(typeof b.evidenceId!=='string'||!db.prepare('SELECT 1 FROM evidence WHERE id=? AND complaintId=?').get(b.evidenceId,c.id)))fail(400,'Evidence must belong to this complaint')
      db.prepare('INSERT INTO reviews(complaintId,actor,decision,reason,ts,evidenceId) VALUES (?,?,?,?,?,?)').run(c.id,u.username,b.decision,note,now,b.evidenceId??null)
      if(b.evidenceId)db.prepare('UPDATE evidence SET reviewDecision=?,reviewedBy=?,reviewedAt=? WHERE id=?').run(b.decision,u.username,now,b.evidenceId)
      else db.prepare('UPDATE evidence SET reviewDecision=?,reviewedBy=?,reviewedAt=? WHERE complaintId=?').run(b.decision,u.username,now,c.id)
      audit(c.id,u.username,'Evidence reviewed',null,{decision:b.decision,evidenceId:b.evidenceId??null,reviewedAt:now})
      return {decision:b.decision,reviewedBy:u.username,reviewedAt:now,automaticRejection:false}
    })
    route('post','/api/complaints/:id/priority',(req,u,b)=>{const c=complaint(req);supervisor(u);if(!Object.hasOwn(PRIORITY_DAYS,b.priority))fail(400,'Invalid priority');if(c.status==='Resolved')fail(409,'Resolved complaint cannot be re-prioritised; reopen first');const note=reason(b.reason);const due=Math.min(c.deadlineTs,Date.now()+PRIORITY_DAYS[b.priority]*86400000);return {complaint:serialize(change(c,u,'Severity reviewed',{priority:b.priority,severityReasons:JSON.stringify(['HUMAN_REVIEW:'+note]),deadlineTs:due,deadline:fmtDate(due)}),u)}})
    route('post','/api/complaints/:id/link',(req,u,b)=>{const c=complaint(req);if(!['reviewer','supervisor'].includes(u?.role))fail(403,'Reviewer required');const target=get(b.target);if(!target||target.id===c.id||c.category!==target.category||c.ward!==target.ward||metres(c,target)>100)fail(400,'Same category and ward within 100m required');const note=reason(b.reason);const old=c.issueId;if(db.prepare('SELECT 1 FROM complaints WHERE issueId IN (?,?) AND (category!=? OR ward!=?)').get(old,target.issueId,target.category,target.ward))fail(409,'Every complaint in the source and target clusters must share the target category and ward');db.prepare('UPDATE complaints SET issueId=? WHERE issueId=?').run(target.issueId,old);audit(c.id,u.username,'Issue cluster linked',{issueId:old},{issueId:target.issueId,reason:note});return {issueId:target.issueId,complaintsPreserved:true}})
    route('get','/api/complaints/:id/related',(req,u)=>{const c=complaint(req);if(!member(u,c))fail(403,'Private access required');return {candidates:candidates(c).map(x=>({id:x.id,status:x.status,issueId:x.issueId})),recurrences:candidates(c).filter(x=>x.status==='Resolved'||x.reopenCount>0).length}})
    route('get','/api/work-queue',(req,u)=>{if(!u||!['official','supervisor','reviewer'].includes(u.role))fail(403,'Staff login required');const all=u.role==='supervisor'||u.role==='reviewer',rows=all?db.prepare('SELECT * FROM complaints').all():db.prepare('SELECT * FROM complaints WHERE officer=?').all(u.username);return {complaints:rows.map(c=>serialize(c,u)),transfers:all?db.prepare("SELECT * FROM transfers WHERE state='pending'").all():db.prepare("SELECT * FROM transfers WHERE state='pending' AND (target=? OR complaintId IN (SELECT id FROM complaints WHERE officer=?))").all(u.username,u.username),extensions:u.role==='supervisor'?db.prepare("SELECT * FROM extensions WHERE state='pending'").all():[],notifications:'internal_only'}})
    route('get','/api/escalations',(req,u)=>{supervisor(u);sweep();return {tasks:db.prepare('SELECT * FROM escalation_tasks ORDER BY ts DESC').all(),delivery:'internal_queue_only'}})
    route('post','/api/complaints/:id/escalations/:level/accept',(req,u,b)=>{supervisor(u);const c=complaint(req),level=escalationLevel(req.params.level),note=reason(b.reason);const task=db.prepare('SELECT * FROM escalation_tasks WHERE complaintId=? AND cycle=? AND level=?').get(c.id,c.reopenCount,level);if(!task)fail(404,'Escalation not found');if(task.state!=='pending')fail(409,'Already accepted');db.prepare("UPDATE escalation_tasks SET state='accepted',acceptedBy=? WHERE complaintId=? AND cycle=? AND level=?").run(u.username,c.id,c.reopenCount,level);audit(c.id,u.username,'Escalation accepted',task,{reason:note});return {ok:true,ownerRemains:c.officer}})
    route('get','/api/audit',(req,u)=>{supervisor(u);const rows=db.prepare('SELECT * FROM audit ORDER BY seq').all();let prev='',valid=true;for(const r of rows){const hash=crypto.createHash('sha256').update(JSON.stringify([r.complaintId,r.actor,r.action,r.ts,r.beforeJson,r.afterJson,r.prevHash])).digest('hex');if(r.prevHash!==prev||r.hash!==hash)valid=false;prev=r.hash}return {valid,events:rows,limit:'Local hash chain, not externally anchored; database administrators can replace the file'}})
    const metrics=analytics.metrics
    route('get','/api/stats/public',()=>{sweep();return {...metrics(db.prepare("SELECT * FROM complaints WHERE author!=''").all()),excludesLegacyDemo:true,impactCausality:'not_established'}})
    route('get','/api/stats/comparison',()=>{sweep();return {departments:analytics.comparison(db.prepare("SELECT * FROM complaints WHERE author!=''").all()),notice:'Category and severity standardization only when all strata have >=10 matured complaints; no ranking, calibration or causal claim'}})
    route('get','/api/stats/workload',(req,u)=>{supervisor(u);sweep();const rows=db.prepare("SELECT * FROM complaints WHERE author!=''").all();return {officers:[...new Set(rows.map(x=>x.officer))].map(officer=>({officer,...metrics(rows.filter(x=>x.officer===officer))})),ranking:null}})
    route('get','/api/stats/hotspots',(req,u)=>{supervisor(u);return {hotspots:analytics.clusters(db.prepare("SELECT * FROM complaints WHERE author!=''").all()),predictionModel:'not_trained',method:'150m connected components by category, 90-day window, 3 unique issues for review',limit:'Client coordinates and reporting bias; no asset failure probability'}})
    route('get','/api/stats/predictive-risk',(req,u)=>{supervisor(u);return {clusters:analytics.clusters(db.prepare("SELECT * FROM complaints WHERE author!=''").all()),model:'history_heuristic_v1',trained:false,validated:false,notice:'Prioritize site inspection, not predicted failure or automatic repair'}})
    route('get','/api/privacy',(req,u)=>({publicDetails:'restricted',evidenceRetentionDays:90,locationRetention:'coordinates, landmark and ward redacted with evidence after resolution retention expires',identityRetention:'complaint author pseudonymized at retention; officer and audit actors kept for accountability',historicalAudit:'Old entries may retain PII; backups need operator policy',productionReady:false}))
    route('post','/api/privacy/retention',(req,u)=>{supervisor(u);return retention()})
    route('post','/api/complaints/:id/impact',(req,u,b)=>{const c=complaint(req);worker(u,c);if(!['water_loss_litres','road_closure_hours','repair_cost_inr'].includes(b.metric)||typeof b.value!=='number'||!Number.isFinite(b.value)||b.value<0||b.unit!==({water_loss_litres:'litres',road_closure_hours:'hours',repair_cost_inr:'INR'})[b.metric])fail(400,'Valid metric, nonnegative value and unit required');const note=reason(b.note);db.prepare('INSERT INTO impact(complaintId,actor,metric,value,unit,note,ts) VALUES (?,?,?,?,?,?,?)').run(c.id,u.username,b.metric,b.value,text(b.unit),note,Date.now());audit(c.id,u.username,'Impact observation recorded',null,{metric:b.metric,value:b.value,unit:b.unit,source:'officer_reported'});return {recorded:true,verified:false}})
    route('get','/api/impact',(req,u)=>{supervisor(u);return {observations:db.prepare('SELECT * FROM impact ORDER BY ts DESC').all(),notice:'Reported observations only; baseline/control data and independent measurement needed to claim reduction'}})
  }
  return {mount,sweep,retention}
}
