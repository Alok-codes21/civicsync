/* CivicSync demo backend - API-only (Express + SQLite / better-sqlite3), $0 stack.
   REST API under /api; anything else returns a JSON 404.
   Auto-escalation engine: real, time-based sweep over deadlines. */
const express = require('express')
const path = require('path')
const crypto = require('crypto')
const Database = require('better-sqlite3')

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'civicsync.db')
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
  username TEXT PRIMARY KEY, passhash TEXT NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tokens (
  token TEXT PRIMARY KEY, username TEXT NOT NULL, createdTs INTEGER NOT NULL
);
`)

/* ---------- password hashing (Node built-in crypto, no deps) ---------- */
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(String(pw), salt, 64).toString('hex')
  return `scrypt:${salt}:${hash}`
}
function verifyPassword(pw, stored) {
  const parts = String(stored || '').split(':')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  const hash = crypto.scryptSync(String(pw), parts[1], 64)
  const expected = Buffer.from(parts[2], 'hex')
  return hash.length === expected.length && crypto.timingSafeEqual(hash, expected)
}

/* Async variant for the login path: scrypt runs off the event loop so a burst of
   login attempts cannot block other API requests. Sync verify stays for boot-time
   migration/seeding only. */
const scryptAsync = (pw, salt) => new Promise((resolve, reject) => crypto.scrypt(pw, salt, 64, (err, hash) => err ? reject(err) : resolve(hash)))
async function verifyPasswordAsync(pw, stored) {
  const parts = String(stored || '').split(':')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  const hash = await scryptAsync(String(pw), parts[1])
  const expected = Buffer.from(parts[2], 'hex')
  return hash.length === expected.length && crypto.timingSafeEqual(hash, expected)
}

/* Bearer tokens are stored as SHA-256 hashes: a database copy alone cannot be
   replayed as a live session. The raw token is only ever returned to the client. */
const hashToken = t => crypto.createHash('sha256').update(t).digest('hex')

/* ---------- migrate old DBs: plaintext password column -> scrypt passhash ---------- */
{
  const cols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name)
  if (cols.includes('password') && !cols.includes('passhash')) {
    db.prepare('ALTER TABLE users ADD COLUMN passhash TEXT').run()
    for (const u of db.prepare('SELECT username, password FROM users').all())
      db.prepare('UPDATE users SET passhash=? WHERE username=?').run(hashPassword(u.password), u.username)
    db.prepare('ALTER TABLE users DROP COLUMN password').run()
    console.log('migrated users table: plaintext passwords re-hashed with scrypt')
  }
}

/* migrate legacy plaintext bearer tokens to hashed storage; sessions stay valid */
for (const row of db.prepare('SELECT token FROM tokens').all())
  if (!/^[0-9a-f]{64}$/.test(row.token)) db.prepare('UPDATE tokens SET token=? WHERE token=?').run(hashToken(row.token), row.token)

const PRIORITY_DAYS = { Critical: 2, High: 5, Medium: 7, Low: 10 }
function fmtDate(ts) { return new Date(ts).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric', timeZone:'Asia/Calcutta' }) }
function fmtTs(ts) { return new Date(ts).toISOString() }
const workflows = require('./workflows.cjs')({ db, hashPassword, fmtDate, fmtTs, PRIORITY_DAYS })
const { sweep, retention } = workflows
require('./detector.cjs').load()
const sweepTimer = setInterval(() => {
  sweep()
  retention()
  db.prepare('DELETE FROM tokens WHERE createdTs < ?').run(Date.now() - 12 * 60 * 60 * 1000)
}, 60000)
sweepTimer.unref()

/* ---------- app ---------- */
const app = express()
app.use(express.json({ limit: '6mb' }))
app.use((req,res,next)=>{
 res.set('Cache-Control','no-store').set('X-Content-Type-Options','nosniff').set('Referrer-Policy','no-referrer')
 const origin=req.headers.origin,allowed=(process.env.CORS_ORIGINS||'').split(',').filter(Boolean)
 if(origin&&allowed.includes(origin)){res.set('Access-Control-Allow-Origin',origin).set('Vary','Origin').set('Access-Control-Allow-Headers','Content-Type, Authorization, Idempotency-Key').set('Access-Control-Allow-Methods','GET,POST,OPTIONS')}
 if(req.method==='OPTIONS')return res.sendStatus(origin&&!allowed.includes(origin)?403:204)
 next()
})
app.use(require('./i18n.cjs').middleware)


const TOKEN_TTL_MS = 12 * 60 * 60 * 1000 // sessions expire after 12 hours
function authUser(req) {
  const h = req.headers.authorization || ''
  const tok = h.startsWith('Bearer ') ? h.slice(7) : null
  if (!tok) return null
  const row = db.prepare('SELECT t.createdTs, u.username,u.name,u.role FROM tokens t JOIN users u ON u.username=t.username WHERE t.token=?').get(hashToken(tok))
  if (!row) return null
  if (Date.now() - row.createdTs > TOKEN_TTL_MS) {
    db.prepare('DELETE FROM tokens WHERE token=?').run(hashToken(tok))
    return null // expired token -> 401 downstream
  }
  return { username: row.username, name: row.name, role: row.role }
}

app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }))

/* login rate limiting: max 5 failed attempts per IP+username per 10 minutes.
   In-memory and bounded (oldest keys evicted past LOGIN_FAILURE_MAP_MAX); limits
   reset on restart - fine for this prototype, not sufficient for public deployment. */
const LOGIN_WINDOW_MS = 10 * 60 * 1000
const LOGIN_MAX_FAILURES = 5
const LOGIN_FAILURE_MAP_MAX = 1000
const LOGIN_USERNAME_MAX = 64
const LOGIN_PASSWORD_MAX = 128
const loginFailures = new Map() // key "ip|username" -> array of failure timestamps
function recordFailure(key, now) {
  const recent = (loginFailures.get(key) || []).filter(ts => now - ts < LOGIN_WINDOW_MS)
  recent.push(now)
  if (!loginFailures.has(key) && loginFailures.size >= LOGIN_FAILURE_MAP_MAX)
    for (const old of loginFailures.keys()) { loginFailures.delete(old); if (loginFailures.size < LOGIN_FAILURE_MAP_MAX) break }
  loginFailures.set(key, recent)
}

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {}
  // Type and length validated BEFORE any hashing: oversized input never reaches scrypt.
  if (typeof username !== 'string' || typeof password !== 'string' ||
      !username.length || username.length > LOGIN_USERNAME_MAX ||
      !password.length || password.length > LOGIN_PASSWORD_MAX)
    return res.status(400).json({ error: 'Username and password must be text within length limits' })
  const uname = username.toLowerCase()
  const key = `${req.ip || req.socket.remoteAddress || 'unknown'}|${uname}`
  const now = Date.now()
  const recent = (loginFailures.get(key) || []).filter(ts => now - ts < LOGIN_WINDOW_MS)
  if (recent.length >= LOGIN_MAX_FAILURES) {
    loginFailures.set(key, recent)
    const retryAfterSec = Math.ceil((recent[0] + LOGIN_WINDOW_MS - now) / 1000)
    res.setHeader('Retry-After', retryAfterSec)
    return res.status(429).json({ error: `Too many failed login attempts. Try again in ${Math.ceil(retryAfterSec / 60)} minute(s).`, retryAfterSec })
  }
  const u = db.prepare('SELECT * FROM users WHERE username=?').get(uname)
  if (!u || !(await verifyPasswordAsync(password, u.passhash))) {
    recordFailure(key, now)
    return res.status(401).json({ error: 'Invalid username or password' })
  }
  loginFailures.delete(key)
  const token = crypto.randomBytes(24).toString('hex')
  db.prepare('INSERT INTO tokens VALUES (?,?,?)').run(hashToken(token), u.username, now)
  res.json({ token, user: { username: u.username, name: u.name, role: u.role } })
})
app.post('/api/logout', (req, res) => {
  const h = req.headers.authorization || ''
  if (h.startsWith('Bearer ')) db.prepare('DELETE FROM tokens WHERE token=?').run(hashToken(h.slice(7)))
  res.json({ ok: true })
})
app.get('/api/me', (req, res) => { const u = authUser(req); if (!u) return res.status(401).json({ error: 'not logged in' }); res.json({ user: u }) })

// Phone numbers: saved unverified on users.phone, format-checked only. No OTP/SMS.
require('./phone.cjs').mount({app,db,authUser})
workflows.mount(app, authUser)
app.use((err, req, res, next) => {
  if (err.status || err.type === 'entity.too.large') return res.status(err.status || 413).json({ error:'Invalid or oversized request' })
  console.error(err)
  res.status(500).json({ error:'Internal server error' })
})
app.use((req, res) => res.status(404).json({ error:'Not found - this server is API-only' }))
const PORT = process.env.PORT || 3001
if (require.main === module) app.listen(PORT, process.env.HOST || '127.0.0.1', () => { sweep(); retention(); console.log(`CivicSync backend on http://127.0.0.1:${PORT}`) })
module.exports = { app, db, sweep, retention, _loginFailures: loginFailures, stop: () => { clearInterval(sweepTimer); db.close() } }
