/* Phone numbers are saved on users.phone as given by the citizen, format-checked only.
   No OTP, no SMS, no verification: the number is an unverified contact detail.
   Never returned by public tracking, complaint detail or audit; staff read it through
   GET /api/complaints/:id/contact (supervisor or assigned officer only). */
function normalize(phone) {
  if (typeof phone !== 'string') return null
  const p = phone.replace(/[ ()-]/g, '')
  return /^\+91[6-9]\d{9}$/.test(p) ? p : /^[6-9]\d{9}$/.test(p) ? '+91' + p : null
}
function ensureColumn(db) {
  if (!db.prepare('PRAGMA table_info(users)').all().some(c => c.name === 'phone')) db.exec('ALTER TABLE users ADD COLUMN phone TEXT')
}
function mount({ app, db, authUser, securityEvent }) {
  ensureColumn(db)
  app.post('/api/me/phone', (req, res) => {
    const u = authUser(req)
    if (!u) return res.status(401).json({ error: 'Login required' })
    if (u.role !== 'citizen') return res.status(403).json({ error: 'Citizen account required' })
    const phone = normalize(req.body?.phone)
    if (!phone) return res.status(400).json({ error: 'Valid Indian mobile number required (10 digits, optional +91)' })
    db.prepare('UPDATE users SET phone=? WHERE username=?').run(phone, u.username)
    if (securityEvent) securityEvent(u.username, 'Contact phone updated')
    res.json({ saved: true, verified: false, notice: 'Saved as an unverified contact number. No OTP or SMS is used.' })
  })
}
module.exports = { normalize, ensureColumn, mount }
