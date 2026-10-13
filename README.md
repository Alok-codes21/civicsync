# CivicSync backend v2 - local prototype workflows

API-only Node/Express/SQLite backend. No frontend, paid API, SMS, Aadhaar, municipal connection or deployment is included. An optional local-only image model is available as an unvalidated review signal. No fake photo/GPS/verification claims are inserted. This feature branch is a breaking API update and has not been merged.

## Run and test

```
npm ci
npm test
DEMO_MODE=true npm start
```

`HOST` defaults to loopback 127.0.0.1. `PORT` defaults to 3001. Node >=20.9.0 is required for patched sharp. `DB_PATH` overrides `server/civicsync.db`. Old complaint tables are migrated additively; existing records are preserved but their unsupported evidence claims are marked legacy/unverified. Fresh databases have no fictional complaint seed. Back up an existing database before upgrading. Tests use an isolated in-memory database, actual HTTP requests and a temporary legacy database.

## Authentication and prototype limits

Demo mode is OFF by default. Set `DEMO_MODE=true` only for sample accounts below, which all use `demo123`:

| Username | Role |
|---|---|
| alok / citizen2 | citizen |
| verma | official |
| reviewer | independent reviewer |
| supervisor | supervisor |
| assisted | assisted intake desk |

These are public sample credentials, not secure production identities. Use `DEMO_MODE=false` to stop creating demo accounts/routes. This does NOT delete previously created demo accounts. Operator-only local provisioning is available through `scripts/provision-user.cjs`; real staff authority verification, password rotation/reset, secure hosting, backups, quotas and encryption are pending. A retention sweep deletes evidence and redacts title, description, landmark, coordinates, ward and latestUpdate on old resolved records after 90 days, and pseudonymizes the complaint author; it keeps accountability fields (category, priority, status history, officer) and does not purge old audit entries or backups. Do not put actual citizen evidence into a publicly reachable demo instance.

Existing login endpoints and 12-hour tokens remain. Login validates username/password type and length before hashing and verifies with asynchronous scrypt so bursts of attempts do not block the event loop; failed-attempt rate limiting is in-memory and bounded (prototype-grade, resets on restart). Bearer tokens are stored only as SHA-256 hashes, so a database copy cannot be replayed as a live session. Filing now REQUIRES a bearer token. The public acknowledgement lookup remains but returns ONLY status/category/priority/deadline/department/escalation and workflow-stage summaries. It omits names, exact location, title, description, landmark, notes, raw audit payloads and evidence. Owners, assigned officers, reviewers and supervisors receive authorized detail. Reviewers/supervisors are deliberately broad roles in this prototype.

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

Filing body: `{title, description, category, ward, landmark?, lat?, lon?, accuracy?, hazards?, priority?, language?}`. Category must match the existing categories in `server/seed.cjs`. `language` supports en/hi content codes. `Accept-Language: hi-IN` or `?lang=hi` translates common API errors/acknowledgements. Unsupported messages explicitly return translationFallback; machine codes remain stable. No automatic content translation. Submitted `priority` is validated and recorded in audit but cannot override server rules. `open_manhole`/`live_wire` hazard codes set Critical; `unsafe_road`/`water_loss`/`blocked_access` set High; otherwise Medium. Hazards are citizen claims, not validated physical severity. SLAs are prototype policy: Critical 2, High 5, Medium 7, Low 10 days from submission. A supervisor can review priority but cannot silently extend the deadline through that endpoint.

Default jurisdiction is Ghaziabad only. Ward polygons are partial vintage data (94 of 100 wards, 2022 SBM-derived, unverified with GNN); lookups return a likely ward as an unverified hint and never route to an officer. Complaints without an explicitly configured prototype route go to Routing Review with no guessed officer. The old Lucknow demo routes (Ward 12 - Gomti Nagar, Ward 8 - Aliganj, Ward 3 - Hazratganj) are disabled by default, including when found in an existing database. Only `DEMO_ROUTES=true` enables them for historical demo/test compatibility. They are never Ghaziabad data or official boundaries. New IDs have random suffixes; do not parse acknowledgement suffixes as integers.

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

Before/after uploads are stored privately in SQLite (max 4 MB each, 20 per complaint). Full decoding rejects malformed files and caps input at 16 million pixels. SHA-256 detects exact-byte reuse. 64-bit dHash can flag some resized/recompressed copies (Hamming distance <=6), but not reliable arbitrary crops/edits. Flat images are flagged as unreliable; similarity checks inspect at most the latest 2000 hashes from 90 days, exclude legacy unhashed evidence, and never expose matching complaint IDs. Accepted uploads are re-encoded with Sharp into the same PNG/JPEG format with all metadata (EXIF/GPS/camera tags) stripped; original bytes are never stored. Malware scanning is pending. All cheap checks (authentication, access, stage, MIME, base64 shape, byte size, file signature, per-user rate limit of 20 uploads per 10 minutes) run before any image decoding or AI inference. Server receive times and hashes are real. Capture times/GPS are client claims. Old photo (>7 days), reuse, missing metadata, accuracy uncertainty and location mismatch (>150m) produce reason codes and human review, never AI confidence or automatic rejection. GPS attestation, EXIF validation and tamper detection are NOT implemented. Optional AI inference is local, experimental and unvalidated, with null civic-photo accuracy and human review only.

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

Authenticated workflow mutations and their audit events are transactional. Audit stores actor, server timestamp, redacted new before/after snapshots and hash chain. Old immutable audit entries may still contain personal data; event notes in legacy databases and backup files require a separate operator policy. SQL triggers prevent UPDATE/DELETE. This is application-level protection, not an external or legally immutable log: a database administrator can replace the file.

## Metrics, access and impact

- `/api/stats/public`: non-legacy complaint totals, independent overdue count, unique issue counts, reopen counts, median resolution time, original-SLA performance, severity mix.
- `/api/stats/comparison`: descriptive department counts, sample size and mix; standardizes original-SLA rates by category and severity only when every global stratum has >=10 matured cases in the department. No ranking or validated fairness claim. Unresolved matured complaints count in the denominator.
- `/api/stats/workload`: supervisor-only officer workload/severity/outcomes. No validated risk-adjusted performance score.
- `/api/stats/hotspots`: supervisor-only 150m connected-component clusters by category over 90 days; >=3 unique issue IDs flag maintenance review. Rounded centres, client location and chaining remain limits. No trained predictive model.
- POST `/api/complaints/:id/impact`: worker `{metric:water_loss_litres/road_closure_hours/repair_cost_inr,value,unit,note}`; reported observation only.
- GET `/api/impact`: supervisor observations. No demonstrated causal reduction, baseline or controlled evaluation.

Assisted desk filing accepts `citizenUsername` or creates an unclaimed citizen record without any login secret to distribute. The original intake actor can read its unclaimed report. Channels include phone/desk/assisted/offline. Retry buffered requests using the same `Idempotency-Key`; repeated identical requests return the original acknowledgement, conflicting payloads return 409. This is a backend sync contract, not a delivered offline app, anonymous public access or connected telephone/SMS/IVR. Claiming an unclaimed report still needs an identity-verification workflow. Browser accessibility and translations belong to the teammate frontend and remain untested.

## Frontend migration required

1. Send Authorization on filing, private details, evidence and staff workflows. Expect 401/403 and 409 state errors.
2. Treat acknowledgements as opaque strings. Lists are paginated; public details are deliberately redacted.
3. Replace arbitrary `/events` and direct `Resolved` status writes with private evidence -> repair -> independent verify.
4. Display Routing Review and Verification Pending; overdue is a separate boolean even if work stage stays Reopened/Verification Pending.
5. Use owner-only reopen with note; staff acceptance is required before progress/repair.
6. Add staff work queue, transfer acceptance, extension review and supervisor routing screens if those features are exposed.
7. Display risk/severity reason codes and missing integration notices honestly. Never label GPS/AI/Aadhaar as verified.

## Ghaziabad ward data (13 October 2026, partial 2022 SBM dataset)

Partial vintage ward polygons are loaded. This is not a completed official ward-dataset integration.

- Source: Swachh Bharat Mission (Urban) GIS, Ministry of Housing and Urban Affairs, redistributed CC0 1.0 by [ramSeraph/indian_admin_boundaries](https://github.com/ramSeraph/indian_admin_boundaries/releases) and [yashveeeeeeer/india-geodata](https://github.com/yashveeeeeeer/india-geodata). Attribution: Swachh Bharat Mission / MoHUA and the redistributors.
- Coverage: 94 of 100 Ghaziabad wards (ULB code 800734); missing 79, 81, 87, 98, 99, 100. Records dated Dec 2021 - Mar 2022.
- Cross-check against the [official GNN zones/wards directory](https://ghaziabadnagarnigam.in/zones-and-wards.aspx) (13 Oct 2026): numbering matches on comparable names (Shalimar Garden Main 37, Shaheed Nagar 34/90, Mausam Vihar 66, Kuti 29). Known source glitches: ward 17 name field carries number 28, ward 88 name says 83, ward 78 name says 73, and ward 16 Morta conflicts with GNN listing Morta under ward 50. Raw source names are preserved in each feature's `sourceName`.
- `GET /api/jurisdictions` reports `partial_2022_sbm_unverified` with coverage and sources.
- `GET /api/jurisdictions/lookup?lat=28.67&lon=77.42` returns a matched ward as an unverified hint (`WARD_MATCHED_UNVERIFIED_2022_SBM`) or fails closed (`WARD_NOT_IN_LOADED_BOUNDARIES`). It never echoes coordinates and never invents a ward.
- Filing attaches the geoWard hint to the response with `officerRouting: 'manual_only'`; complaints still go to Routing Review, `routeVerified:0`. Polygons cannot prove current boundaries, GPS authenticity, or officer authority.
- Limits: 2022 vintage (delimitation may have changed), 6 wards missing, not a GNN export, original government data has no explicit license beyond the CC0 redistribution terms.
- Existing complaints and configured routes are preserved. Old seeded Lucknow routes are ignored by default rather than deleting records. `DEMO_ROUTES=true npm start` is only the old demo compatibility option; do not use it to claim Ghaziabad routing.
- Rejected sources (detail in `data/ghaziabad/provenance.json`): DataMeet has no Ghaziabad dataset; LGD directory is CAPTCHA-gated and tabular only; Esri LivingAtlas layer conflicts with GNN numbering and has blank licenseInfo; GDA GIS is development-scheme only; OSM ward coverage unverified.
- Needed next: current official GNN ward polygons with effective date and reuse terms, plus an independently authorized ward/category-to-officer registry, before geographic lookup or officer routing can be treated as verified.

Exact source findings are in `data/ghaziabad/provenance.json`.

## Local additions, 13 October 2026

- `GET /api/translations`: common en/hi strings and honest translation coverage. Regional languages/UI remain pending.
- `GET /api/stats/predictive-risk`: supervisor-only history heuristic, no trained model, no failure probability, no automated dispatch.
- `GET /api/privacy`, `POST /api/privacy/retention`: policy and supervisor retention sweep; also runs each minute and at startup. No removal of active unresolved evidence.
- CORS is closed by default. Set `CORS_ORIGINS` to exact comma-separated trusted origins. Responses use no-store, nosniff and no-referrer. TLS, distributed rate limits, storage quotas and broader production controls remain pending.
- Impact units must match litres / hours / INR for water loss / road closure / repair cost. Entries are officer-reported, not measured baseline or causal impact.

### Optional local AI review signal

Setup, one command: `npm run setup:detector`. It downloads the checksum-pinned (SHA-256) Apache-2.0 model weights (about 83 MB) into `models/` (git-ignored, never committed) and verifies them. Restart the server: the detector turns ON automatically when `models/ai-image-detection.onnx` exists (or `AI_MODEL_PATH` points to a file). Without weights it stays `not_connected`; `AI_DETECTOR=off` forces it off. Check `GET /api/capabilities`. Runtime inference uses local CPU only and never sends citizen images to an external API. Missing/bad model and concurrent work fail closed to human review.

Attribution and version are in `docs/model-provenance.json`; original model card is in `docs/AI_MODEL_CARD.md`. The model uses CIFAKE-trained ViT from Google/dima806/CapCheck, converted by ONNX Community. The score is a softmax model output, not a calibrated probability or proof of authenticity. No accuracy claim on CivicSync photos is available. Bilinear 224x224 RGB preprocessing follows the model configuration, but quantization/domain/compression effects remain unevaluated. Never auto-reject complaints using it.

Source: https://huggingface.co/onnx-community/ai-image-detection-ONNX . Evidence on dataset/compression bias: https://arxiv.org/html/2403.17608 .

Mobile OTP flow is implemented with a provider-pluggable sender, hashed codes, expiry and abuse controls. Default is disabled; dev codes never count as verified. No real SMS provider is connected. Aadhaar is out of scope at user request. See docs/PHONE_OTP.md for endpoints, setup and verified free/trial limits.

### Mobile verification

`POST /api/phone/otp/request`, `POST /api/phone/otp/verify`, `GET /api/phone/status` require a claimed citizen login. This links/verifies a number; phone-only signup/login and recovery are not implemented. Hashed codes expire in 5 minutes with 5 attempts, 60-second resend cooldown and persistent hourly limits. SMS mode needs an explicitly configured sender+private pepper; dev mode never sets the real flag. Aadhaar is out of scope. Provider setup/details: `docs/PHONE_OTP.md`.

## Latest free/local completion pass

- Read-only Ghaziabad officer hints: reviewer/supervisor `GET /api/jurisdictions/officer-hints?ward=38`. AE lists cover 100 wards; JE lists 56. Names only, no phone numbers or account bindings. All remain unverified and manual-review-only. Source A/ए numbering may not match 2022 polygons. Multiple zones are retained, not guessed.
- Opt-in Twilio Messaging sender: see `docs/COMPLETION_HANDOFF.md`. Disabled by default, mock-tested only. No SMS was sent or account created.
- Local labelled-photo evaluation: `node scripts/evaluate-detector.cjs /private/photos/manifest.json`. No real civic accuracy result exists yet.
- 66 automated tests pass with checksum-pinned detector installed (synthetic model smoke is not accuracy testing).
- Backend API only. Teammate frontend integration and live deployment are not verified.
