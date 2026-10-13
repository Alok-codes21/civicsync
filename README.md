# CivicSync backend v2 - local prototype workflows

API-only Node/Express/SQLite backend. No frontend, paid API, external detector, SMS, Aadhaar, municipal connection or deployment is included. No fake photo/GPS/verification claims are inserted. This feature branch is a breaking API update and has not been merged.

## Run and test

```
npm ci
npm test
npm start
```

`PORT` defaults to 3001. `DB_PATH` overrides `server/civicsync.db`. Old complaint tables are migrated additively; existing records are preserved but their unsupported evidence claims are marked legacy/unverified. Fresh databases have no fictional complaint seed. Back up an existing database before upgrading. Tests use an isolated in-memory database, actual HTTP requests and a temporary legacy database.

## Authentication and prototype limits

Demo mode is ON by default. All demo accounts below use `demo123`:

| Username | Role |
|---|---|
| alok / citizen2 | citizen |
| verma | official |
| reviewer | independent reviewer |
| supervisor | supervisor |
| assisted | assisted intake desk |

These are public sample credentials, not secure production identities. Use `DEMO_MODE=false` to stop creating demo accounts/routes. This does NOT delete previously created demo accounts. Production identity provisioning, real staff roles, password rotation/reset, secure hosting, backups, quotas, encryption and retention are pending. Do not put actual citizen evidence into a publicly reachable demo instance.

Existing login endpoints and 12-hour tokens remain. Filing now REQUIRES a bearer token. The public acknowledgement lookup remains but returns ONLY status/category/priority/deadline/department/escalation and workflow-stage summaries. It omits names, exact location, title, description, landmark, notes, raw audit payloads and evidence. Owners, assigned officers, reviewers and supervisors receive authorized detail. Reviewers/supervisors are deliberately broad roles in this prototype.

## Core APIs

| Method | Endpoint | Purpose / permission |
|---|---|---|
| GET | /api/health, /api/capabilities | liveness; honest unavailable integrations |
| POST | /api/login, /api/logout | token session |
| GET | /api/me | current user |
| GET | /api/complaints | public redacted list; `mine=true` requires login; limit 1-100 (default 25), offset, status, q (id/category only) |
| GET | /api/complaints/:id | redacted public tracking or authorized full detail |
| POST | /api/complaints | logged-in citizen filing / intake-desk filing |
| POST | /api/complaints/:id/accept | assigned officer / supervisor accepts assignment |
| POST | /api/complaints/:id/status | `In Progress` by accepted assigned officer; `Reopened` only owner of a resolved complaint; note required |
| POST | /api/complaints/:id/events | always 410: arbitrary events disabled |
| GET | /api/work-queue | officer work/transfers or reviewer/supervisor queue |

Filing body: `{title, description, category, ward, landmark?, lat?, lon?, accuracy?, hazards?, priority?, language?}`. Category must match the existing categories in `server/seed.cjs`. `language` supports en/hi content codes, not automatic translation. Submitted `priority` is validated and recorded in audit but cannot override server rules. `open_manhole`/`live_wire` hazard codes set Critical; `unsafe_road`/`water_loss`/`blocked_access` set High; otherwise Medium. Hazards are citizen claims, not validated physical severity. SLAs are prototype policy: Critical 2, High 5, Medium 7, Low 10 days from submission. A supervisor can review priority but cannot silently extend the deadline through that endpoint.

Known demo ward+category routes cover Ward 12 - Gomti Nagar, Ward 8 - Aliganj, Ward 3 - Hazratganj. They are not official municipal boundaries. Unknown wards go to Routing Review with no guessed officer. New IDs have random suffixes; do not parse acknowledgement suffixes as integers.

## Evidence, repair and dispute APIs

| Method | Endpoint | Body / permission |
|---|---|---|
| POST | /api/complaints/:id/evidence | `{stage:before/after/dispute, mime:image/png or image/jpeg, base64, capturedTs?, lat?, lon?, accuracy?}`; private member access, after requires assigned worker |
| GET | /api/evidence/:id | authorized raw bytes, no-store; no public evidence URLs |
| POST | /api/complaints/:id/repair | `{note}`; assigned worker, accepted assignment, before and their after evidence required |
| POST | /api/complaints/:id/verify | `{decision:approve/dispute, reason}`; citizen owner or independent reviewer, never repair submitter |
| POST | /api/complaints/:id/evidence-review | `{decision:needs_reupload/accepted_for_work/needs_site_visit, reason}`; reviewer |
| POST | /api/complaints/:id/priority | `{priority, reason}`; supervisor |
| GET | /api/complaints/:id/related | private duplicate/recurrence candidates |
| POST | /api/complaints/:id/link | `{target, reason}`; reviewer/supervisor; same category+ward, within 100m; reports retained |

Before/after uploads are stored privately in SQLite (max 4 MB each, 20 per complaint). MIME/signature checks are basic; full image decoding, safe re-encoding, EXIF stripping and malware scanning are pending. SHA-256 detects exact-byte reuse, NOT cropped/edited perceptual duplicates. Server receive times and hashes are real. Capture times/GPS are client claims. Old photo (>7 days), reuse, missing metadata, accuracy uncertainty and location mismatch (>150m) produce reason codes and human review, never AI confidence or automatic rejection. GPS attestation, EXIF validation, edit detection and AI-generated-image detection are NOT implemented.

Repair -> Verification Pending -> citizen/independent reviewer approval -> Resolved. Dispute returns to work. These are authenticated workflow decisions, not proof of a physical inspection. Resolved owners can reopen with a reason, a fresh deadline, a reset escalation level and incremented recurrence cycle. The original SLA remains for metrics.

## Routing, handoff, extensions and escalation

| Method | Endpoint | Body / permission |
|---|---|---|
| POST | /api/routes | `{ward,category,dept,officer,supervisor,reason}`; supervisor; known users; configured-not-verified mapping |
| POST | /api/complaints/:id/route | `{reason}`; supervisor applies existing mapping |
| POST | /api/complaints/:id/transfer | `{target,reason}`; assigned worker/supervisor requests transfer |
| POST | /api/transfers/:id/accept | target officer only; old owner retained until acceptance |
| POST | /api/complaints/:id/extensions | `{deadlineTs,reason}`; assigned worker/supervisor; future deadline <=30 days ahead |
| POST | /api/extensions/:id/review | `{decision:approve/deny,reason}`; different supervisor approves; original deadline preserved |
| GET | /api/escalations | supervisor internal escalation queue |
| POST | /api/complaints/:id/escalations/:level/accept | `{reason}`; supervisor accepts internal task; no municipal delivery implied |
| GET | /api/audit | supervisor: append-only records + hash-chain validation |

Sweeps run at boot, every minute and reads. Overdue is calculated independently of status, so L3 cannot be hidden by In Progress. L1 starts after the deadline, L2 after 2 days, L3 after 7 days. Escalation tasks are unique per complaint/reopen cycle/level. They are internal queues only: no email/SMS, real authority integration, reassignment or guarantee of repair. Demo supervisors stand in for all three authority levels; this is not a real hierarchy.

Authenticated workflow mutations and their audit events are transactional. Audit stores actor, server timestamp, before/after and hash chain. SQL triggers prevent UPDATE/DELETE. This is application-level protection, not an external or legally immutable log: a database administrator can replace the file.

## Metrics, access and impact

- `/api/stats/public`: non-legacy complaint totals, independent overdue count, unique issue counts, reopen counts, median resolution time, original-SLA performance, severity mix.
- `/api/stats/comparison`: descriptive department counts, sample size and mix; marks <10 samples unsuitable for comparison, never generates a speed-only ranking.
- `/api/stats/workload`: supervisor-only officer workload/severity/outcomes. No validated risk-adjusted performance score.
- `/api/stats/hotspots`: supervisor-only approximate 0.001-degree cells, report counts, recurrence and heuristic maintenance-review flags. Boundary splits are possible. No trained predictive model.
- POST `/api/complaints/:id/impact`: worker `{metric:water_loss_litres/road_closure_hours/repair_cost_inr,value,unit,note}`; reported observation only.
- GET `/api/impact`: supervisor observations. No demonstrated causal reduction, baseline or controlled evaluation.

Assisted desk filing accepts `citizenUsername` (existing citizen account), `channel:phone/desk/assisted`, language and text without requiring images/GPS. No real telephone/SMS/IVR intake or offline synchronization is connected. Browser accessibility and translations belong to the teammate frontend and remain untested.

## Frontend migration required

1. Send Authorization on filing, private details, evidence and staff workflows. Expect 401/403 and 409 state errors.
2. Treat acknowledgements as opaque strings. Lists are paginated; public details are deliberately redacted.
3. Replace arbitrary `/events` and direct `Resolved` status writes with private evidence -> repair -> independent verify.
4. Display Routing Review and Verification Pending; overdue is a separate boolean even if work stage stays Reopened/Verification Pending.
5. Use owner-only reopen with note; staff acceptance is required before progress/repair.
6. Add staff work queue, transfer acceptance, extension review and supervisor routing screens if those features are exposed.
7. Display risk/severity reason codes and missing integration notices honestly. Never label GPS/AI/Aadhaar as verified.
