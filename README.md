# CivicSync - backend (civic issue escalation demo)

Express + better-sqlite3 (SQLite) REST API for the CivicSync civic complaint escalation app. 100% free stack, no paid APIs, no external services. API-only: the frontend lives in a separate repo (a teammate owns it); anything outside /api returns a JSON 404.

## Run it

```bash
npm install
npm start            # http://localhost:3001 (PORT env var overrides)
```

The SQLite database (server/civicsync.db) is created and seeded with Lucknow sample data automatically on first boot - it is gitignored and not part of the source. Existing databases from the earlier plaintext-password version are migrated automatically on boot (passwords are re-hashed with scrypt, old column dropped).

## Demo logins

| Role     | Username | Password |
|----------|----------|----------|
| Citizen  | alok     | demo123  |
| Official | verma    | demo123  |

## API endpoints

| Method | Path | Auth | What it does |
|--------|------|------|--------------|
| GET  | /api/health | - | liveness check |
| POST | /api/login | - | body {username, password} -> {token, user}; bad credentials rejected |
| POST | /api/logout | Bearer | invalidates the token |
| GET  | /api/me | Bearer | current user |
| GET  | /api/complaints | - | list; optional ?status= and ?q= filters |
| GET  | /api/complaints/:id | - | track one complaint by acknowledgement number (e.g. SHG-2026-1042), case-insensitive; public |
| POST | /api/complaints | optional | file a complaint {title, category, description, ward, landmark?, priority?} -> real acknowledgement number, rule-based auto-assignment to a department officer, priority-based deadline |
| POST | /api/complaints/:id/status | official for normal status changes; any logged-in user may reopen | body {status, note?}; accepts Submitted, Assigned, In Progress, Resolved or Reopened; writes a timeline event |
| POST | /api/complaints/:id/events | - | add a timeline event {label, detail, kind}; open in this demo so anonymous citizens can attach evidence |
| GET  | /api/stats/public | - | aggregate counts for the public dashboard |

## Auto-escalation engine (real, not simulated)

A sweep runs at boot, every 60 seconds, and on each read:

- deadline passed -> L1, Overdue, Ward Officer
- >= 2 days overdue -> L2, Escalated, Zonal Officer
- >= 7 days overdue -> L3, Escalated, Municipal Commissioner

Every escalation writes a timeline event on the complaint.

## Security notes (demo-grade by design)

- Passwords are hashed with Node's built-in crypto scrypt (per-user random salt, timing-safe compare) - no plaintext stored passwords, no extra dependencies.
- Still demo auth: tokens are opaque random strings in a DB table, no rate limiting, no password reset flow, and the demo logins above are public by design.
- No email/SMS/WhatsApp notifications.
- Sample data is fictional Lucknow complaints.

## Suggested next steps

OTP login, token expiry + rate limiting, photo upload storage, SMS/WhatsApp alerts on status change, officer workload balancing, public upvoting, deployment on a free tier (Render/Railway).
