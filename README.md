# Sahayog - backend (civic issue escalation demo)

Express + better-sqlite3 (SQLite) REST API for the Sahayog civic complaint escalation app. This repository contains backend code only; it does not include or serve frontend assets.

## Run it

```bash
npm install
npm start            # http://localhost:3001 (PORT env var overrides)
```

The SQLite database (server/sahayog.db) is created and seeded with Lucknow sample data automatically on first boot - it is gitignored and not part of the source.

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
| POST | /api/complaints/:id/status | official for normal status changes; any logged-in user may reopen | body {status, note?}; writes the updated complaint |
| POST | /api/complaints/:id/events | No authentication in this demo | add a timeline event {label, detail, kind} |
| GET  | /api/stats/public | - | aggregate counts for the public dashboard |

## Auto-escalation engine (real, not simulated)

A sweep runs at boot, every 60 seconds, and on each read:

- deadline passed -> L1, Overdue, Ward Officer
- >= 2 days overdue -> L2, Escalated, Zonal Officer
- >= 7 days overdue -> L3, Escalated, Municipal Commissioner

Every escalation writes a timeline event on the complaint.

## Honest limits (demo-grade by design)

- Passwords are plain text in the local SQLite file; tokens are opaque random strings in a DB table. Not production auth.
- No email/SMS/WhatsApp notifications.
- Sample data is fictional Lucknow complaints.

## Suggested next steps

Password hashing (bcrypt) + OTP login, photo upload storage, SMS/WhatsApp alerts on status change, officer workload balancing, public upvoting, deployment on a free tier (Render/Railway).
