const { test, after, beforeEach } = require('node:test')
const assert = require('node:assert/strict'), crypto = require('crypto')
process.env.DEMO_MODE = 'false'; process.env.DB_PATH = ':memory:'; process.env.AI_DETECTOR = 'off'
const { app, db, stop, _signupAttempts } = require('../server/index.cjs')
const server = app.listen(0), base = 'http://127.0.0.1:' + server.address().port
const valid = { name: 'Test Citizen', username: 'new_citizen', password: 'Test-password-123' }
async function req(path, body, token) {
  const r = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) })
  return { status: r.status, body: await r.json(), headers: r.headers }
}
const signup = body => req('/api/signup', body)
beforeEach(() => { _signupAttempts.clear(); db.prepare('DELETE FROM tokens').run(); db.prepare('DELETE FROM users').run() })
after(async () => { await new Promise(r => server.close(r)); stop() })
test('signup with demo off creates citizen, hashes password/token, automatically logs in, logs out', async () => {
  const r = await signup(valid); assert.equal(r.status, 201); assert.deepEqual(r.body.user, { username: valid.username, name: valid.name, role: 'citizen' })
  const row = db.prepare('SELECT * FROM users').get(); assert.match(row.passhash, /^scrypt:/); assert.ok(!JSON.stringify(r.body).includes(valid.password))
  const [, salt, hash] = row.passhash.split(':'); assert.equal(crypto.scryptSync(valid.password, salt, 64).toString('hex'), hash)
  const stored = db.prepare('SELECT * FROM tokens').get(); assert.equal(stored.token, crypto.createHash('sha256').update(r.body.token).digest('hex')); assert.notEqual(stored.token, r.body.token)
  assert.equal((await req('/api/me', undefined, r.body.token)).body.user.role, 'citizen')
  assert.equal((await req('/api/login', { username: valid.username, password: valid.password })).status, 200)
  assert.equal((await req('/api/logout', {}, r.body.token)).status, 200)
  assert.equal((await req('/api/me', undefined, r.body.token)).status, 401)
})
test('normalizes names/usernames, supports Hindi name and optional unverified phone without echo', async () => {
  const r = await signup({ ...valid, name: '  नागरिक नाम  ', username: ' NEW_Citizen ', phone: '+91-98765 43210' })
  assert.equal(r.status, 201); assert.equal(r.body.user.name, 'नागरिक नाम'); assert.equal(r.body.user.username, 'new_citizen')
  assert.equal(r.body.phoneVerified, false); assert.equal(r.body.phoneSaved, true); assert.ok(!JSON.stringify(r.body).includes('98765'))
  assert.equal(db.prepare('SELECT phone FROM users').get().phone, '+919876543210')
})
test('phone may be omitted or empty', async () => {
  for (const phone of [undefined, '']) { const r = await signup({ ...valid, username: phone === '' ? 'other_user' : 'no_phone', phone }); assert.equal(r.status, 201) }
  assert.ok(db.prepare('SELECT phone FROM users').all().every(r => r.phone === null))
})
test('validates all fields and size/type limits without creating users or tokens', async () => {
  const cases = [null, [], {}, { name: '' }, { name: '   ' }, { name: 123 }, { name: 'x'.repeat(101) }, { name: 'bad\nname' }, { username: 12 }, { username: 'ab' }, { username: 'a'.repeat(61) }, { username: 'bad user' }, { username: '<script>' }, { password: 123 }, { password: 'x'.repeat(11) }, { password: 'x'.repeat(129) }, { password: 'x'.repeat(200000) }, { phone: 9876543210 }, { phone: null }, { phone: '123' }, { phone: 'x'.repeat(1000) }]
  for (const fields of cases) { _signupAttempts.clear(); const b = fields === null || Array.isArray(fields) ? fields : { ...valid, ...fields }; if (Object.keys(fields || {}).length === 0 && fields && !Array.isArray(fields)) delete b.password; assert.equal((await signup(b)).status, 400, JSON.stringify(fields).slice(0,80)) }
  assert.equal(db.prepare('SELECT COUNT(*) n FROM users').get().n, 0); assert.equal(db.prepare('SELECT COUNT(*) n FROM tokens').get().n, 0)
})
test('12 and 128 character passwords accepted; distinct salts for same password', async () => {
  for (const n of [12, 128]) assert.equal((await signup({ ...valid, username: 'length_' + n, password: 'p'.repeat(n) })).status, 201)
  await signup({ ...valid, username: 'salt_a' }); await signup({ ...valid, username: 'salt_b' })
  assert.notEqual(db.prepare("SELECT passhash FROM users WHERE username='salt_a'").get().passhash, db.prepare("SELECT passhash FROM users WHERE username='salt_b'").get().passhash)
})
test('duplicate normalized usernames return 409 and cannot overwrite any existing account', async () => {
  const first = await signup(valid), before = db.prepare('SELECT * FROM users').get()
  assert.equal((await signup({ ...valid, username: ' NEW_CITIZEN ', name: 'Changed', password: 'Another-secret-123' })).status, 409)
  assert.deepEqual(db.prepare('SELECT * FROM users').get(), before); assert.equal(db.prepare('SELECT COUNT(*) n FROM tokens').get().n, 1)
  assert.equal((await req('/api/me', undefined, first.body.token)).status, 200)
})
test('concurrent same username gives one 201, one 409, one account and one session', async () => {
  const results = await Promise.all([signup(valid), signup(valid)])
  assert.deepEqual(results.map(r => r.status).sort(), [201, 409]); assert.equal(db.prepare('SELECT COUNT(*) n FROM users').get().n, 1); assert.equal(db.prepare('SELECT COUNT(*) n FROM tokens').get().n, 1)
})
test('cannot request staff roles; injected auth fields cannot elevate a citizen', async () => {
  for (const role of ['official', 'supervisor', 'reviewer', 'intake', null]) assert.equal((await signup({ ...valid, role })).status, 400)
  _signupAttempts.clear()
  const r = await signup({ ...valid, role: 'citizen', isAdmin: true, token: 'attacker', passhash: 'attacker' }); assert.equal(r.status, 201)
  for (const path of ['/api/work-queue', '/api/escalations', '/api/audit']) assert.equal((await req(path, undefined, r.body.token)).status, 403)
})
test('new citizen can file and read own complaint; phone absent from public detail', async () => {
  const r = await signup({ ...valid, phone: '9876543210' })
  const c = await req('/api/complaints', { title: 'Signup QA', description: 'Synthetic complaint', category: 'Garbage Collection', ward: 'Ghaziabad Ward 38' }, r.body.token)
  assert.equal(c.status, 201); const id = c.body.acknowledgementNumber
  assert.equal((await req('/api/complaints?mine=true', undefined, r.body.token)).status, 200)
  assert.ok(!JSON.stringify((await req('/api/complaints/' + id)).body).includes('9876543210'))
})
test('sixth signup attempt limited per IP even with varied usernames and fake forwarded IP; expires after window', async () => {
  for (let i = 0; i < 5; i++) assert.equal((await signup({ ...valid, username: 'rate_' + i })).status, 201)
  const response = await fetch(base + '/api/signup', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '192.0.2.10' }, body: JSON.stringify({ ...valid, username: 'rate_extra' }) })
  assert.equal(response.status, 429); assert.ok(Number(response.headers.get('Retry-After')) > 0); assert.ok((await response.json()).retryAfterSec <= 600)
  for (const key of _signupAttempts.keys()) _signupAttempts.set(key, [Date.now() - 600001])
  assert.equal((await signup(valid)).status, 201)
})
test('invalid and concurrent requests count before hashing; map stays bounded', async () => {
  const results = await Promise.all(Array.from({ length: 6 }, (_, i) => signup({ ...valid, username: 'parallel_' + i })))
  assert.equal(results.filter(r => r.status === 201).length, 5); assert.equal(results.filter(r => r.status === 429).length, 1)
  _signupAttempts.clear(); for (let i = 0; i < 5; i++) assert.equal((await signup({})).status, 400)
  assert.equal((await signup(valid)).status, 429)
  _signupAttempts.clear(); for (let i = 0; i < 1000; i++) _signupAttempts.set('fake-ip-' + i, [Date.now()])
  assert.equal((await signup(valid)).status, 201); assert.equal(_signupAttempts.size, 1000)
})
