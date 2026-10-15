/* Ghaziabad only. Ward polygons: SBM (Urban) GIS 2022 records, 94 of 100 wards,
   redistributed CC0 1.0. Partial vintage data, unverified with GNN.
   Polygons identify a likely ward; they do not prove official boundaries,
   current delimitation, GPS authenticity, or any officer's authority. */
const fs = require('fs')
const path = require('path')
const manifest = require('../data/ghaziabad/provenance.json')
const wards = JSON.parse(fs.readFileSync(path.join(__dirname,'..','data','ghaziabad','ghaziabad-wards-2022-sbm.geojson'),'utf8'))
const META = wards.metadata
const MISSING = META.missingWards

function ringContains(ring, x, y) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
function polygonContains(rings, x, y) {
  if (!rings.length || !ringContains(rings[0], x, y)) return false
  for (let k = 1; k < rings.length; k++) if (ringContains(rings[k], x, y)) return false
  return true
}
function featureContains(f, lon, lat) {
  const g = f.geometry
  if (g.type === 'Polygon') return polygonContains(g.coordinates, lon, lat)
  if (g.type === 'MultiPolygon') return g.coordinates.some(r => polygonContains(r, lon, lat))
  return false
}
function findWard(lon, lat) {
  for (const f of wards.features) if (featureContains(f, lon, lat)) return f.properties
  return null
}
function sourceInfo() {
  return { dataset: META.name, recordsDated: META.recordsDated, source: META.source,
    license: 'CC0 1.0 (attribution: Swachh Bharat Mission / MoHUA and redistributors)',
    wardCount: META.wardCount, expectedWards: META.expectedWards, missingWards: MISSING,
    verifiedAgainst: META.verifiedAgainst, notOfficial: META.notOfficial }
}
function status() {
  return { municipality: 'Ghaziabad', state: 'Uttar Pradesh', status: 'partial_2022_sbm_unverified',
    geographicLookup: true, lookupCoverage: 'partial', officialOfficerRouting: false,
    wardCount: META.wardCount, expectedWards: META.expectedWards, missingWards: MISSING,
    verifiedAsOf: manifest.checkedAt, sources: manifest.sources,
    reason: 'Partial 2022 SBM-derived ward polygons loaded (94/100). Not official GNN boundaries; matches are unverified hints, officers still require manual configuration.' }
}
function lookup({ lat, lon }) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    const e = new Error('Invalid coordinates'); e.status = 400; throw e
  }
  // Intentionally do not echo potentially private location values.
  const hit = findWard(lon, lat)
  const base = { ...status(), requiresHumanReview: true }
  if (!hit) return { ...base, matched: false, ward: null, reasonCode: 'WARD_NOT_IN_LOADED_BOUNDARIES',
    note: 'No loaded polygon contains this point. It may be outside Ghaziabad Nagar Nigam or in one of the 6 missing wards.' }
  return { ...base, matched: true, reasonCode: 'WARD_MATCHED_UNVERIFIED_2022_SBM',
    ward: { code: hit.ward, name: hit.name, label: `Ward ${hit.ward} - ${hit.name}` } }
}
module.exports = { status, lookup }
