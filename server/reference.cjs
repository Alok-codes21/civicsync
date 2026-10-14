/* Versioned, read-only Ghaziabad reference seed (data/ghaziabad/seed-v1.json).
   Scraped from public Nagar Nigam pages, not an official export or live integration.
   Used for: charter SLA (only where unambiguous) and locality-to-ward suggestions.
   Never used for authentication or automatic officer assignment. */
const seed = require('../data/ghaziabad/seed-v1.json')
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9\u0900-\u097f]+/g, ' ').trim()
const index = new Map()
for (const [ward, names] of Object.entries(seed.wardLocalities.wards)) for (const n of names) {
  const k = norm(n); if (!k) continue
  if (!index.has(k)) index.set(k, new Set()); index.get(k).add(ward)
}
function staleness(now = Date.now()) {
  const ageDays = Math.floor((now - Date.parse(seed.verifiedAt + 'T00:00:00Z')) / 86400000)
  return { seedVersion: seed.seedVersion, verifiedAt: seed.verifiedAt, ageDays, staleAfterDays: seed.staleAfterDays, stale: ageDays > seed.staleAfterDays }
}
function charterSlaDays(category) {
  const c = seed.categorySla[category]
  return c && !c.ambiguous && Number.isInteger(c.slaDays) ? c.slaDays : null
}
// Returns {result:'unique'|'ambiguous'|'none', wards:[...]} - exact normalized locality name only.
function matchLocality(text) {
  const k = norm(text)
  if (!k) return { result: 'none', wards: [] }
  const hit = index.get(k)
  if (!hit) return { result: 'none', wards: [] }
  const wards = [...hit].sort((a, b) => Number(a) - Number(b))
  return { result: wards.length === 1 ? 'unique' : 'ambiguous', wards }
}
function charter(now) {
  return { ...staleness(now), municipality: seed.municipality, source: seed.charter.source, notes: seed.charter.notes, categorySla: seed.categorySla, rows: seed.charter.rows,
    disclaimer: 'Copied from public pages; not an official export or live integration. Human routing review remains required.' }
}
module.exports = { staleness, charterSlaDays, matchLocality, charter, seed }

/* Routing suggestion for supervisors/reviewers. NOT a route: nothing is assigned, no account
   is created, the routes table is untouched. Ward comes from the complaint's own text
   ("Ward 38") or an exact unique locality name; conflicting or repeated names stay ambiguous. */
const officerHints = require('./officer-hints.cjs')
function suggestRoute({ ward, landmark, category }) {
  const cat = seed.categoryDepartments[category]
  const found = new Set()
  const m = /\bward\s*(?:no\.?|number|#)?\s*(\d{1,3})\b/i.exec(String(ward || ''))
  if (m && seed.wardLocalities.wards[String(Number(m[1]))]) found.add(String(Number(m[1])))
  let ambiguous = false
  for (const t of [ward, landmark]) {
    const r = matchLocality(t)
    if (r.result === 'unique') found.add(r.wards[0]); else if (r.result === 'ambiguous') { ambiguous = true; r.wards.forEach(w => found.add(w)) }
  }
  const wards = [...found].sort((a, b) => Number(a) - Number(b))
  const status = wards.length === 1 && !ambiguous ? 'suggested_unverified' : wards.length ? 'ambiguous' : 'no_match'
  const wardId = status === 'suggested_unverified' ? wards[0] : null
  const deptOk = cat && cat.departments.length === 1 && !cat.ambiguous
  const hints = wardId ? officerHints.lookup(Number(wardId)) : null
  return {
    status, wardId, candidateWards: wards,
    department: deptOk ? cat.departments[0] : null, departmentCandidates: cat ? cat.departments : [], charterRole: deptOk ? cat.role : null,
    staffHints: hints ? hints.officers.map(o => ({ name: o.name, designation: o.designation })) : [], zoneAmbiguous: hints ? hints.zoneAmbiguous : null,
    sources: [seed.sources.wards, seed.sources.charter, seed.sources.staff], ...staleness(),
    requiresHumanReview: true, automaticAssignment: false, verified: false,
    notice: 'Suggestion from copied public pages. Supervisor must confirm; nothing is assigned. Staff names are not accounts and have no access.'
  }
}
module.exports.suggestRoute = suggestRoute
