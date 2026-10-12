/* Sahayog demo backend - Express + SQLite (better-sqlite3), $0 stack.
   API-only backend; no frontend assets are served.
   Auto-escalation engine: real, time-based sweep over deadlines. */
const express = require('express')
const path = require('path')
const crypto = require('crypto')
const Database = require('better-sqlite3')
const { SEED, ESCALATION_LADDER, DEPARTMENTS } = require('./seed.cjs')

const DB_PATH = path.join(__dirname, 'sahayog.db')
const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')

db.exec(`
CREATE TABLE IF NOT EXISTS complaints (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL, category TEXT NOT NULL, description TEXT NOT NULL,
  ward TEXT NOT NULL, landmark TEXT DEFAULT '',
  status TEXT NOT NULL, priority TEXT NOT NULL,
  submittedAt TEXT NOT NULL, submittedTs INTEGER NOT NULL,
  deadline TEXT NOT NULL, deadlineTs INTEGER NOT NULL,
  dept TEXT NOT NULL, officer TEXT,
  escalationLevel INTEGER NOT NULL DEFAULT 0,
  latestUpdate TEXT DEFAULT '',
  author TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS events (
  rowid INTEGER PRIMARY KEY AUTOINCREMENT,
  complaintId TEXT NOT NULL, position INTEGER NOT NULL,
  label TEXT NOT NULL, at TEXT NOT NULL, detail TEXT DEFAULT '', kind TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  username TEXT PRIMARY KEY, password TEXT NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tokens (
  token TEXT PRIMARY KEY, username TEXT NOT NULL, createdTs INTEGER NOT NULL
);
`)

/* ---------- seed once ---------- */
const MONTHS = { Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5, Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11 }
function parseDeadline(d) { // '8 Oct 2026'
  const m = d.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/)
  return m ? new Date(+m[3], MONTHS[m[2]], +m[1], 23, 59, 59).getTime() : NaN
}
function parseSubmitted(s) { // '28 Sep 2026, 9:14 AM'
  const m = s.match(/(\d{1,2})\s+(\w+)\s+(\d{4}),\s*(\d{1,2}):(\d{2})\s*(AM|PM)/)
  if (!m) return Date.now()
  let h = +m[4] % 12; if (m[6] === 'PM') h += 12
  return new Date(+m[3], MONTHS[m[2]], +m[1], h, +m[5]).getTime()
}
if (db.prepare('SELECT COUNT(*) n FROM complaints').get().n === 0) {
  const insC = db.prepare(`INSERT INTO complaints (id,title,category,description,ward,landmark,status,priority,submittedAt,submittedTs,deadline,deadlineTs,dept,officer,escalationLevel,latestUpdate)
    VALUES (@id,@title,@category,@description,@ward,@landmark,@status,@priority,@submittedAt,@submittedTs,@deadline,@deadlineTs,@dept,@officer,@escalationLevel,@latestUpdate)`)
  const insE = db.prepare('INSERT INTO events (complaintId,position,label,at,detail,kind) VALUES (?,?,?,?,?,?)')
  const tx = db.transaction(() => {
    for (const c of SEED) {
      insC.run({ ...c, submittedTs: parseSubmitted(c.submittedAt), deadlineTs: parseDeadline(c.deadline), officer: c.officer ?? null })
      c.timeline.forEach((e, i) => insE.run(c.id, i, e.label, e.at, e.detail ?? '', e.kind))
    }
  })
  tx()
  console.log('seeded', SEED.length, 'complaints')
}
if (db.prepare('SELECT COUNT(*) n FROM users').get().n === 0) {
  const insU = db.prepare('INSERT INTO users VALUES (?,?,?,?)')
  insU.run('alok', 'demo123', 'Alok (Citizen, Gomti Nagar)', 'citizen')
  insU.run('verma', 'demo123', 'R. Verma - JE, Zone 4', 'official')
  console.log('seeded demo users')
}

/* ---------- auto-escalation engine (real, time-based) ---------- */
const LADDER_NAMES = ['Ward Officer', 'Zonal Officer', 'Municipal Commissioner']
function sweep(now = Date.now()) {
  const rows = db.prepare("SELECT * FROM complaints WHERE status != 'Resolved'").all()
  const upd = db.prepare('UPDATE complaints SET escalationLevel=?, status=?, latestUpdate=? WHERE id=?')
  const insE = db.prepare('INSERT INTO events (complaintId,position,label,at,detail,kind) VALUES (?,?,?,?,?,?)')
  const changes = []
  for (const c of rows) {
    if (!c.deadlineTs || now <= c.deadlineTs) continue
    const daysOver = Math.floor((now - c.deadlineTs) / 86400000)
    const level = daysOver >= 7 ? 3 : daysOver >= 2 ? 2 : 1
    if (level > c.escalationLevel) {
      const status = level === 1 ? 'Overdue' : 'Escalated'
      const auth = LADDER_NAMES[level - 1]
      const upd_txt = `Escalated to ${auth} (L${level}) - deadline missed by ${daysOver} day${daysOver === 1 ? '' : 's'}.`
      upd.run(level, status, upd_txt, c.id)
      const pos = db.prepare('SELECT COUNT(*) n FROM events WHERE complaintId=?').get(c.id).n
      insE.run(c.id, pos, `Escalated to ${auth}`, 'Just now', `Level ${level} escalation, auto-triggered by deadline engine.`, 'current')
      changes.push({ id: c.id, level, status })
    }
  }
  return changes
}
setInterval(() => sweep(), 60 * 1000).unref()

/* ---------- helpers ---------- */
const OFFICERS = {
  'Road Department': 'R. Verma (JE)', 'Jal Nigam': 'A. Khan (JE Water Works)',
  'Nagar Nigam - Drainage': 'M. Prasad (JE)', 'Sanitation Department': 'K. Singh (Sanitation Supervisor)',
  'Electricity Board': 'S. Yadav (Lineman)', 'Parks Department': 'P. Nigam (Supervisor)', 'Ward Office': 'Ward Officer (in-charge)',
}
const PRIORITY_DAYS = { Critical: 2, High: 5, Medium: 7, Low: 10 }
function fmtDate(ts) {
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Calcutta' })
}
function fmtTs(ts) {
  const d = new Date(ts)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Calcutta' }) + ', ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Calcutta' })
}
function toComplaint(c) {
  const timeline = db.prepare('SELECT label,at,detail,kind FROM events WHERE complaintId=? ORDER BY position').all(c.id)
  const { submittedTs, deadlineTs, ...rest } = c
  return { ...rest, escalationLevel: c.escalationLevel, timeline }
}
function nextId() {
  const year = new Date().getFullYear()
  const row = db.prepare("SELECT id FROM complaints WHERE id LIKE ? ORDER BY id DESC LIMIT 1").get(`SHG-${year}-%`)
  const n = row ? parseInt(row.id.split('-')[2], 10) + 1 : 1000
  return `SHG-${year}-${n}`
}

/* ---------- app ---------- */
const app = express()
app.use(express.json({ limit: '1mb' }))
app.use((req, res, next) => { res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization'); res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS'); if (req.method === 'OPTIONS') return res.sendStatus(204); next() })

function authUser(req) {
  const h = req.headers.authorization || ''
  const tok = h.startsWith('Bearer ') ? h.slice(7) : null
  if (!tok) return null
  const row = db.prepare('SELECT u.username,u.name,u.role FROM tokens t JOIN users u ON u.username=t.username WHERE t.token=?').get(tok)
  return row || null
}

app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }))

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {}
  const u = db.prepare('SELECT * FROM users WHERE username=?').get(String(username || '').toLowerCase())
  if (!u || u.password !== String(password || '')) return res.status(401).json({ error: 'Invalid username or password' })
  const token = crypto.randomBytes(24).toString('hex')
  db.prepare('INSERT INTO tokens VALUES (?,?,?)').run(token, u.username, Date.now())
  res.json({ token, user: { username: u.username, name: u.name, role: u.role } })
})
app.post('/api/logout', (req, res) => {
  const h = req.headers.authorization || ''
  if (h.startsWith('Bearer ')) db.prepare('DELETE FROM tokens WHERE token=?').run(h.slice(7))
  res.json({ ok: true })
})
app.get('/api/me', (req, res) => { const u = authUser(req); if (!u) return res.status(401).json({ error: 'not logged in' }); res.json({ user: u }) })

app.get('/api/complaints', (req, res) => {
  sweep()
  const { status, q } = req.query
  let rows = db.prepare('SELECT * FROM complaints ORDER BY submittedTs DESC').all()
  if (status && status !== 'all') rows = rows.filter(r => r.status === status)
  if (q) { const s = String(q).toLowerCase(); rows = rows.filter(r => (r.id + ' ' + r.title + ' ' + r.category + ' ' + r.ward).toLowerCase().includes(s)) }
  res.json({ complaints: rows.map(toComplaint) })
})

app.get('/api/complaints/:id', (req, res) => {
  sweep()
  const c = db.prepare('SELECT * FROM complaints WHERE id=?').get(String(req.params.id).toUpperCase())
  if (!c) return res.status(404).json({ error: 'Complaint not found' })
  res.json({ complaint: toComplaint(c) })
})

app.post('/api/complaints', (req, res) => {
  const { title, category, description, ward, landmark, priority } = req.body || {}
  if (!title || !category || !description || !ward) return res.status(400).json({ error: 'title, category, description and ward are required' })
  const user = authUser(req)
  const now = Date.now()
  const days = PRIORITY_DAYS[priority] ?? 7
  const dept = DEPARTMENTS[category] || 'Ward Office'
  const id = nextId()
  const c = {
    id, title: String(title).slice(0, 140), category, description: String(description).slice(0, 2000),
    ward, landmark: String(landmark || ''), status: 'Assigned', priority: priority || 'Medium',
    submittedAt: fmtTs(now), submittedTs: now,
    deadline: fmtDate(now + days * 86400000), deadlineTs: new Date(new Date(now + days * 86400000).setHours(23, 59, 59)).getTime(),
    dept, officer: OFFICERS[dept] || 'Ward Officer (in-charge)', escalationLevel: 0,
    latestUpdate: `Auto-assigned to ${dept}.`, author: user ? user.username : '',
  }
  db.prepare(`INSERT INTO complaints (id,title,category,description,ward,landmark,status,priority,submittedAt,submittedTs,deadline,deadlineTs,dept,officer,escalationLevel,latestUpdate,author)
    VALUES (@id,@title,@category,@description,@ward,@landmark,@status,@priority,@submittedAt,@submittedTs,@deadline,@deadlineTs,@dept,@officer,@escalationLevel,@latestUpdate,@author)`).run(c)
  const insE = db.prepare('INSERT INTO events (complaintId,position,label,at,detail,kind) VALUES (?,?,?,?,?,?)')
  insE.run(id, 0, 'Complaint submitted', 'Just now', 'Reported with photo and GPS tag.', 'done')
  insE.run(id, 1, `Assigned to ${dept}`, 'Just now', `Auto-assigned to ${c.officer}. Deadline: ${c.deadline}.`, 'current')
  insE.run(id, 2, 'Assignment acknowledged', 'Pending', '', 'pending')
  res.status(201).json({ complaint: toComplaint(db.prepare('SELECT * FROM complaints WHERE id=?').get(id)), acknowledgementNumber: id })
})

app.post('/api/complaints/:id/status', (req, res) => {
  const user = authUser(req)
  const c = db.prepare('SELECT * FROM complaints WHERE id=?').get(req.params.id)
  if (!c) return res.status(404).json({ error: 'Complaint not found' })
  const { status, note } = req.body || {}
  const allowed = ['Submitted', 'Assigned', 'In Progress', 'Resolved', 'Reopened']
  if (!allowed.includes(status)) return res.status(400).json({ error: 'invalid status' })
  if (status !== 'Reopened' && (!user || user.role !== 'official')) return res.status(403).json({ error: 'official login required' })
  if (status === 'Reopened' && !user) return res.status(403).json({ error: 'login required' })
  db.prepare('UPDATE complaints SET status=?, latestUpdate=? WHERE id=?').run(status, note || c.latestUpdate, c.id)
  res.json({ complaint: toComplaint(db.prepare('SELECT * FROM complaints WHERE id=?').get(c.id)) })
})

app.post('/api/complaints/:id/events', (req, res) => {
  const c = db.prepare('SELECT * FROM complaints WHERE id=?').get(req.params.id)
  if (!c) return res.status(404).json({ error: 'Complaint not found' })
  const { label, detail, kind } = req.body || {}
  if (!label) return res.status(400).json({ error: 'label required' })
  const pos = db.prepare('SELECT COUNT(*) n FROM events WHERE complaintId=?').get(c.id).n
  db.prepare('INSERT INTO events (complaintId,position,label,at,detail,kind) VALUES (?,?,?,?,?,?)')
    .run(c.id, pos, String(label).slice(0, 120), 'Just now', String(detail || ''), ['done', 'current', 'alert', 'pending'].includes(kind) ? kind : 'done')
  db.prepare('UPDATE complaints SET latestUpdate=? WHERE id=?').run(detail || label, c.id)
  res.json({ complaint: toComplaint(db.prepare('SELECT * FROM complaints WHERE id=?').get(c.id)) })
})

app.get('/api/stats/public', (req, res) => {
  sweep()
  const rows = db.prepare('SELECT status, deadlineTs FROM complaints').all()
  const total = rows.length, resolved = rows.filter(r => r.status === 'Resolved').length
  const overdue = rows.filter(r => r.status === 'Overdue').length
  const escalated = rows.filter(r => r.status === 'Escalated').length
  res.json({ total, resolved, pending: total - resolved, overdue, escalated })
})

/* API-only service; frontend assets are not served by this repository. */
app.use((req, res) => res.status(404).json({ error: 'Not found' }))

const PORT = process.env.PORT || 3001
app.listen(PORT, () => { sweep(); console.log(`Sahayog backend on http://127.0.0.1:${PORT}`) })
