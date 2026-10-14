/* Public self-service registration. The only role this route can create is citizen.
   Prototype IP limit: counts every attempt, including concurrent and invalid ones,
   before expensive hashing. Bounded memory, resets on process restart. */
const crypto = require('crypto')
const { normalize, ensureColumn } = require('./phone.cjs')
const WINDOW_MS = 10 * 60 * 1000
const MAX_ATTEMPTS = 5
const MAX_IPS = 1000
function mount({ app, db, scryptAsync, hashToken }) {
  ensureColumn(db)
  const attempts = new Map()
  const create = db.transaction((username, passhash, name, phone, token, now) => {
    db.prepare('INSERT INTO users(username,passhash,name,role,phone) VALUES (?,?,?,\'citizen\',?)').run(username, passhash, name, phone)
    db.prepare('INSERT INTO tokens(token,username,createdTs) VALUES (?,?,?)').run(hashToken(token), username, now)
  })
  app.post('/api/signup', async (req, res, next) => {
    const now = Date.now(), ip = req.ip || req.socket.remoteAddress || 'unknown'
    const recent = (attempts.get(ip) || []).filter(ts => now - ts < WINDOW_MS)
    if (recent.length >= MAX_ATTEMPTS) {
      const retryAfterSec = Math.max(1, Math.ceil((recent[0] + WINDOW_MS - now) / 1000))
      res.set('Retry-After', String(retryAfterSec))
      return res.status(429).json({ error: 'Too many signup attempts. Try again later.', retryAfterSec })
    }
    if (!attempts.has(ip) && attempts.size >= MAX_IPS) attempts.delete(attempts.keys().next().value)
    recent.push(now)
    attempts.set(ip, recent)
    const b = req.body
    if (!b || typeof b !== 'object' || Array.isArray(b)) return res.status(400).json({ error: 'Signup details must be an object' })
    if (b.role !== undefined && b.role !== 'citizen') return res.status(400).json({ error: 'Only citizen signup is allowed' })
    if (typeof b.name !== 'string' || !b.name.trim() || b.name.trim().length > 100 || /[\x00-\x1f\x7f]/.test(b.name))
      return res.status(400).json({ error: 'Name must be 1-100 characters without control characters' })
    if (typeof b.username !== 'string' || b.username.length > 64 || !/^[a-z0-9_-]{3,60}$/.test(b.username.trim().toLowerCase()))
      return res.status(400).json({ error: 'Username must be 3-60 letters, numbers, underscores or hyphens' })
    if (typeof b.password !== 'string' || b.password.length < 12 || b.password.length > 128)
      return res.status(400).json({ error: 'Password must be 12-128 characters' })
    let phone = null
    if (b.phone !== undefined && b.phone !== '') {
      if (typeof b.phone !== 'string' || b.phone.length > 32 || !(phone = normalize(b.phone)))
        return res.status(400).json({ error: 'Valid Indian mobile number required (10 digits, optional +91)' })
    }
    const username = b.username.trim().toLowerCase(), name = b.name.trim()
    if (db.prepare('SELECT 1 FROM users WHERE username=?').get(username))
      return res.status(409).json({ error: 'Username already exists' })
    try {
      const salt = crypto.randomBytes(16).toString('hex')
      const passhash = `scrypt:${salt}:${(await scryptAsync(b.password, salt)).toString('hex')}`
      const token = crypto.randomBytes(24).toString('hex')
      create(username, passhash, name, phone, token, Date.now())
      res.status(201).json({ token, user: { username, name, role: 'citizen' }, ...(phone ? { phoneSaved: true, phoneVerified: false } : {}) })
    } catch (err) {
      // Two requests may pass the lookup while hashing. The database is final.
      if (err.code === 'SQLITE_CONSTRAINT_PRIMARYKEY' || err.code === 'SQLITE_CONSTRAINT_UNIQUE')
        return res.status(409).json({ error: 'Username already exists' })
      next(err)
    }
  })
  return attempts
}
module.exports = { mount }
