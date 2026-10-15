// Deterministic review priority, never a decision about authenticity or complaint state.
const NOTICE='Evidence signals are review aids. They do not prove image authenticity, GPS accuracy, capture time, physical repair, or municipal authority.'
const HIGH=new Set(['CAPTURE_SESSION_INVALID','CAPTURE_SESSION_EXPIRED','CLIENT_SHA256_MISMATCH','EXACT_PHOTO_REUSED','SIMILAR_PHOTO_REVIEW_REQUIRED','PHOTO_LOCATION_MISMATCH','OLD_PHOTO','DECLARED_PROVENANCE_INVALID','DECLARED_DEVICE_INTEGRITY_FAILED'])
const NEUTRAL=new Set(['GPS_CLIENT_ASSERTED','CAPTURE_METADATA_CLIENT_ASSERTED','DEVICE_INTEGRITY_CLIENT_ASSERTED','PROVENANCE_CLIENT_ASSERTED','INTEGRITY_REQUEST_HASH_UNVERIFIED','EDIT_DETECTION_UNAVAILABLE'])
function score(reasons){
 const riskReasons=[...new Set(reasons)]
 const trustLevel=riskReasons.some(r=>HIGH.has(r))?'high_risk':riskReasons.some(r=>!NEUTRAL.has(r))?'needs_review':'low_risk'
 return {trustLevel,riskReasons,decision:'human_review',confidence:null}
}
function declarations(b){
 const bad=msg=>{const e=new Error(msg);e.status=400;throw e}
 for(const [key,values] of Object.entries({captureMethod:['live_camera','gallery','web_upload'],deviceIntegrity:['passed','failed','unavailable'],provenanceStatus:['valid','absent','invalid','unsupported']}))if(b[key]!==undefined&&!values.includes(b[key]))bad('Invalid '+key)
 for(const key of ['clientImageSha256','integrityRequestHash'])if(b[key]!==undefined&&(typeof b[key]!=='string'||! /^[a-f0-9]{64}$/i.test(b[key])))bad(key+' must be a SHA-256 hex digest')
 if(b.sessionId!==undefined&&(typeof b.sessionId!=='string'||! /^[a-f0-9]{64}$/.test(b.sessionId)))bad('Invalid capture session')
 if(b.nonce!==undefined&&(typeof b.nonce!=='string'||! /^[a-f0-9]{64}$/.test(b.nonce)))bad('Invalid capture nonce')
 if(b.captureMethod==='live_camera'&&b.sessionId===undefined)bad('live_camera requires a valid active capture session; use web_upload without one')
 return {captureMethod:b.captureMethod||'web_upload',deviceIntegrity:b.deviceIntegrity||'unavailable',provenanceStatus:b.provenanceStatus||'unsupported'}
}
module.exports={score,declarations,NOTICE}
