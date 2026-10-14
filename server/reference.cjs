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
