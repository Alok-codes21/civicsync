/* Safe live backup of the CivicSync database using SQLite's online backup API.
   Usage: node scripts/backup-db.cjs [destination-file]
   WAL-aware: captures a consistent snapshot of committed state at backup time, which
   a raw copy of the .db file alone cannot guarantee while the server is running
   (recent commits may live in -wal). */
const path = require('path')
const dest = path.resolve(process.argv[2] || `civicsync-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.db`)
const src = process.env.DB_PATH || path.join(__dirname, '..', 'server', 'civicsync.db')
if (src === ':memory:') { console.error('Cannot back up an in-memory database from a separate process.'); process.exit(1) }
if (path.resolve(src) === dest) { console.error('Destination must be different from the source database.'); process.exit(1) }
const D = require('better-sqlite3')
const db = new D(src, { fileMustExist: true })
db.backup(dest)
  .then(() => {
    const snap = new D(dest, { readonly: true })
    const n = snap.prepare('SELECT count(*) n FROM complaints').get().n
    snap.close()
    console.log('Backup written:', dest, `(${n} complaints in snapshot)`)
    db.close()
  })
  .catch(e => { console.error('Backup failed:', e.message); db.close(); process.exitCode = 1 })
