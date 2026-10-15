/* Safe live backup of the CivicSync database using SQLite's online backup API.
   Usage: node scripts/backup-db.cjs [destination-file]
   WAL-aware: captures every committed row, which a raw copy of the .db file alone
   cannot guarantee while the server is running (recent commits may live in -wal). */
const path = require('path')
const dest = process.argv[2] || `civicsync-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.db`
const src = process.env.DB_PATH || path.join(__dirname, '..', 'server', 'civicsync.db')
if (src === ':memory:') { console.error('Cannot back up an in-memory database from a separate process.'); process.exit(1) }
const db = new (require('better-sqlite3'))(src, { fileMustExist: true })
db.backup(dest)
  .then(() => { console.log('Backup written:', dest, `(${db.prepare('SELECT count(*) n FROM complaints').get().n} complaints)`); db.close() })
  .catch(e => { console.error('Backup failed:', e.message); process.exitCode = 1 })
