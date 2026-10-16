# CivicSync backend v2 - local prototype workflows

API-only Node/Express/SQLite backend. No frontend, paid API, SMS, Aadhaar, municipal connection or deployment is included. An optional local-only image model is available as an unvalidated review signal. No fake photo/GPS/verification claims are inserted. This API includes authenticated civic workflows; existing route names remain, but legacy unauthenticated writes are disabled.

## Backups

Use the SQLite online backup API, which is safe on a running server in WAL mode:

    node scripts/backup-db.cjs [destination-file]

It captures a consistent snapshot of the committed database state at the backup point; writes after that point are not part of the snapshot. Do NOT rely on copying the live `.db` file alone while the server runs: in WAL mode recent commits may still sit in the `-wal` file, so a raw copy can be an incomplete snapshot. Backups may contain PII; store them with the same care as the live database.


## Run and test

```
npm ci
npm test
DEMO_MODE=true npm start
```

`HOST` defaults to loopback 127.0.0.1. `PORT` defaults to 3001. Use 64-bit Node 22.x or 24.x (tested locally with 22.23.3 and 24.21.0 on Linux). `DB_PATH` overrides `server/civicsync.db`. Old complaint tables are migrated additively; existing records are preserved but their unsupported evidence claims are marked legacy/unverified. Fresh databases have no fictional complaint seed. Back up an existing database before upgrading. Tests use an isolated in-memory database, actual HTTP requests and a temporary legacy database.

### Windows PowerShell (Node 24, no C++ build tools)

Download the ZIP from `feature/verified-civic-workflows`, extract it to a **new folder**, and open that folder in VS Code. Do not copy an old `node_modules` into it. In the VS Code terminal:

```powershell
node -v
node -p "process.platform + ' ' + process.arch"
npm ci
npm test
$env:DEMO_MODE="true"
npm start
```

The checks should show Node `v24.x` (or `v22.x`) and `win32 x64` for a normal 64-bit Windows laptop. The API runs at `http://127.0.0.1:3001/api/health`. Stop it with Ctrl+C. Demo accounts are local examples only; see the limits below.

`better-sqlite3` is deliberately pinned to **12.11.1**, not `latest`. Its release includes a Windows x64 / Node 24 (ABI 137) binary. Its explicit `prebuild-install` step downloads that binary without invoking a compiler when the download succeeds. Version 13.0.3 bundles binaries, but npm can still run its implicit `node-gyp rebuild` because it ships `binding.gyp`; on Windows that can require Visual Studio discovery even when a binary exists. Upgrading Node or installing Visual Studio is not needed for the supported prebuilt path.

The prebuilt download needs access to GitHub release assets. If a proxy, firewall or antivirus blocks it, installation may still fall back to `node-gyp`. Keep the first download error and the output of the two checks above when reporting an install problem. Windows execution has not been tested here; the published Windows binary was downloaded and checked, and clean install, tests and server start were verified on Linux with Node 24.21.0. The deprecated `prebuild-install` warning is upstream tooling, not an install failure. Do not run `npm install better-sqlite3@latest`, which would replace the tested pin.

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

Citizen self-signup is available with `POST /api/signup`, including when demo mode is off. Body: `{name, username, password, phone?}`. Name is trimmed (1-100 characters); username is trimmed/lowercased (3-60 letters, digits, `_` or `-`); password is 12-128 characters and hashed with asynchronous scrypt. Optional phone uses the same Indian mobile format check as `/api/me/phone` and stays unverified, with no OTP/SMS. New users are always citizens; attempts to request staff roles are rejected. Staff accounts still need operator provisioning or local demo seeds.

Success is 201 with `{token, user: {username, name, role: "citizen"}}`, automatically signed in with the same 12-hour session policy as login. Phone supplied: `phoneSaved:true, phoneVerified:false` (the number itself is not echoed). Invalid fields return 400, duplicate usernames return 409, and attempt number six from one IP within 10 minutes returns 429 with `Retry-After`. Every attempt counts, including failures and successes. Signup rate limiting is in-memory, bounded to 1000 IPs, resets on restart and is not a production abuse-control service. Do not trust client-supplied forwarding headers; deploying behind a proxy needs deliberate proxy/rate-limit configuration. No phone-based login, account recovery or identity verification is provided.

Existing login endpoints and 12-hour tokens remain. Login validates username/password type and length before hashing and verifies with asynchronous scrypt so bursts of attempts do not block the event loop; failed-attempt rate limiting is in-memory and bounded (prototype-grade, resets on restart). Bearer tokens are stored only as SHA-256 hashes, so a database copy cannot be replayed as a live session. Filing now REQUIRES a bearer token. The public acknowledgement lookup remains but returns ONLY status/category/priority/deadline/department/escalation and workflow-stage summaries. It omits names, exact location, title, description, landmark, notes, raw audit payloads and evidence. Owners, assigned officers, reviewers and supervisors receive authorized detail. Reviewers/supervisors are deliberately broad roles in this prototype.

## Core APIs

| Method | Endpoint | Purpose / permission |
|---|---|---|
| GET | /api/health, /api/capabilities | liveness; honest unavailable integrations |
| POST | /api/signup | citizen-only registration and automatic token session |
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
| POST | /api/complaints/:id/evidence-review | `{decision:needs_reupload/accepted_for_work/needs_site_visit, reason}`; reviewer; 409 once the complaint is Resolved (reopen first) |
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
- POST `/api/complaints/:id/impact`: worker `{metric:water_loss_litres/road_closure_hours/repair_cost_inr,value,unit,note}`; reported observation only; 409 once the complaint is Resolved (reopen first).
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

Phone number: citizens may give an Indian mobile number when filing (`phone`, optional) or via `POST /api/me/phone`. It is saved on the user record, format-checked only (10 digits, optional +91), and is NOT verified: no OTP, no SMS is sent and no SMS provider is connected. It never appears in public tracking, complaint detail, audit or logs. The supervisor or the assigned officer can read it with `GET /api/complaints/:id/contact` (each read is audited without the number). Aadhaar is out of scope at user request.

### Phone number (saved, unverified)

Phone-only signup/login, recovery and number ownership checks are not implemented. The earlier OTP/Twilio code was removed.

## Latest free/local completion pass

- Read-only Ghaziabad officer hints: reviewer/supervisor `GET /api/jurisdictions/officer-hints?ward=38`. AE lists cover 100 wards; JE lists 56. Names only, no phone numbers or account bindings. All remain unverified and manual-review-only. Source A/ए numbering may not match 2022 polygons. Multiple zones are retained, not guessed.
- Local labelled-photo evaluation: `node scripts/evaluate-detector.cjs /private/photos/manifest.json`. No real civic accuracy result exists yet.
- Older note (historical count, see `npm test` for the current suite): 66 automated tests passed with checksum-pinned detector installed (synthetic model smoke is not accuracy testing).
- Backend API only. Teammate frontend integration and live deployment are not verified.


## Routing suggestions (read-only)

A complaint in Routing Review shows reviewers/supervisors a `routingSuggestion`: ward (from the complaint's own text or an exact unique locality name), charter department/role, and staff names from the public Officer's List. It is unverified, never assigned, never creates accounts, and the `routes` table stays empty until a supervisor configures a route. Ambiguous or missing matches show no ward. Staff list re-checked 2026-10-14 (names, designations and wards only, no phone numbers).

### Demo routes (demo mode only)

With `DEMO_MODE=true DEMO_GHAZIABAD_ROUTES=true` (the `npm run demo` script sets both) the routes table is filled for wards with a single zone entry on the official page and categories with one charter department (Garbage, Streetlights, Roads, Water, Parks). Key is the exact ward text `Ghaziabad Ward N`. Department is labelled `DEMO - <dept> (not real Ghaziabad staff)`, officer is the demo account `verma`, supervisor is `supervisor`, `verified` stays 0. Off by default. Multi-zone wards, Drainage and Other still go to Routing Review. Not real Ghaziabad staff or assignments.

## Private evidence trust signals (review aids only)

**Evidence signals are review aids. They do not prove image authenticity, GPS accuracy, capture time, physical repair, or municipal authority.**

This remains the same Express + SQLite backend. No external image upload, paid API, cloud inference, facial recognition, SMS or Aadhaar is used. Existing evidence download permissions, repair/closure roles and 90-day resolved-evidence retention remain in place. All trust levels return `decision: "human_review"` and `confidence: null`; none rejects, closes, resolves or advances a complaint. Malformed uploads and invalid capture sessions can fail validation; that does not reject the complaint. The existing independent human repair-verification workflow is separate from evidence review.

### Capture sessions

1. With a bearer token and complaint-member access, call `POST /api/complaints/:id/evidence-session` with `{}`.
2. Response: `{sessionId, nonce, expiresAt}`. Both random values are 256-bit; `expiresAt` is an ISO timestamp exactly two minutes after server creation. Only SHA-256 hashes are stored, scoped to the issuing user and complaint. At most 20 unconsumed active sessions per account are allowed.
3. Upload using the existing `POST /api/complaints/:id/evidence` body plus optional `sessionId` and `captureMethod: "live_camera"`. When a `sessionId` is sent, the `nonce` from the session response must be sent back too (64 hex chars); a missing or wrong nonce returns 400 and does not consume the session. A request with no `sessionId` is unaffected. A nonce is a challenge/integration hook, NOT device or camera attestation. Neither a session nor a matching hash proves the photo was taken during those two minutes.
4. A supplied session must be active, unused and owned by the same user/complaint. **`live_camera` without a valid active session returns a clear HTTP 400**, not a silent downgrade. Gallery and web uploads without a session still work. Wrong, expired or reused supplied sessions also return 400. Retry with a new session, or omit it and declare `web_upload`.
5. Validation happens before image decode and again inside the evidence-save transaction. Successful consumption, evidence insertion and audit events commit together. Failed uploads do not burn the session. Concurrent requests cannot consume it twice. Expired entries are removed on startup, session creation and the existing minute maintenance sweep; expiry is enforced at request/commit time even before cleanup. Consumed sessions remain unusable until expiry cleanup.

Audit logs record session creation and successful consumption without raw session IDs, nonces, images, locations or integrity payloads. Review reasons are held in restricted review history, not copied into audit payloads.

### Upload declarations and stored fields

Existing `{stage, mime, base64, lat?, lon?, accuracy?, capturedTs?}` stays compatible. Optional additions:

| Field | Values / meaning |
|---|---|
| `sessionId` | 64 lowercase hex characters from the session endpoint |
| `captureMethod` | `live_camera`, `gallery`, `web_upload` (default `web_upload`) |
| `clientImageSha256` | 64-character SHA-256 hex digest of **original uploaded bytes**, compared case-insensitively before Sharp re-encoding |
| `deviceIntegrity` | `passed`, `failed`, `unavailable` (default `unavailable`), client-declared/unverified |
| `integrityRequestHash` | Optional 64-character SHA-256 hex digest, stored privately as an unverified binding hook; no platform attestation service is connected |
| `provenanceStatus` | `valid`, `absent`, `invalid`, `unsupported` (default `unsupported`), client-declared/unverified |

Malformed optional values return 400. A well-formed mismatching client hash is accepted with `CLIENT_SHA256_MISMATCH` for review. `originalSha256` hashes original bytes, while the existing `sha` hashes the stored normalized bytes. The original file and raw EXIF are not retained. Original bytes are passed to `server/provenance.cjs` before metadata stripping. Existing MIME/signature/full decode/4 MB/16 million pixel limits, rate limits, normalized SHA-256, dHash and GPS/time validation remain. Missing complaint coordinates now produce `COMPLAINT_LOCATION_MISSING`, not a fabricated distance mismatch.

New additive SQLite fields: `trustLevel`, `riskReasons` (JSON), `captureMethod`, `captureSessionUsed`, `deviceIntegrity`, `provenanceStatus`, `originalSha256`, `integrityRequestHash`, `c2paStatus`, `reviewDecision`, `reviewedBy`, `reviewedAt`. Old evidence keeps its bytes, normalized hash and existing reasons; it defaults to `needs_review`, with unknown original hash/reviewer data left null. No backfilled authenticity claim is made.

### Deterministic review priority

`server/evidence-trust.cjs` has the local scoring rules, not a trained risk model:

- `high_risk`: SHA mismatch, exact normalized/original-byte reuse, non-flat dHash distance <=6 (at most 2,000 recent 90-day candidates), supplied photo location >150 m from the complaint location, reported capture >7 days old, declared invalid provenance or declared failed integrity. These are review priorities, not factual accusations. Missing/invalid/expired sessions stop the upload with 400; the pure scorer also maps invalid/expired session reason codes to high priority for integrations, but no failed upload is saved as evidence.
- `needs_review`: missing or uncertain location/time/integrity, gallery/web capture without attestation, low-information images, unsupported C2PA or unavailable/uncalibrated AI signal. GPS and time remain client claims; implausible coordinate values and future capture time over five minutes still fail existing validation.
- `low_risk`: no concerning or unresolved signals. This still requires human review and is not an authenticity badge. The current unsupported C2PA signal means actual uploads normally remain `needs_review` or `high_risk`.

The optional ONNX score is uncalibrated, local-only and never independently creates high risk or a verification result. Missing weights still return `AI_DETECTOR_UNAVAILABLE` without blocking upload.

### Reviewer decisions and privacy

`POST /api/complaints/:id/evidence-review` still accepts `{decision, reason}` from the reviewer role. Decisions: `accepted_for_work`, `needs_reupload`, `needs_site_visit`; a reason of at least five characters is required. Optional `evidenceId` targets one evidence item and must belong to this complaint. Without it, the decision applies to all currently stored evidence (backward-compatible complaint-wide review). New uploads do not inherit earlier decisions. Latest reviewer/decision/time are saved per evidence; every decision and private reason remains in `reviewHistory` for complaint members. An append-only audit event records reviewer, decision, target and time without private reason text. `needs_reupload` does not block further uploads (existing quotas still apply).

Public and unrelated-user tracking/list routes omit evidence, review history, trust/private reasons, integrity declarations and exact location. Raw evidence stays behind the existing member-only download route. New per-evidence fields are deleted with the evidence at retention; the pre-existing review/audit accountability records and backup caveats remain unchanged.

### C2PA status: explicitly unsupported

A current free local candidate, [`@contentauth/c2pa-node`](https://github.com/contentauth/c2pa-js/blob/main/packages/c2pa-node/README.md), was inspected and its 0.9.9 package installed in an isolated Linux check, not added to this project. It supports Node >=22, but introduces a native binary/install chain and settings capable of remote manifest/OCSP fetching. A safe offline-only validator, signed/invalid credential fixtures, trust-anchor policy and Windows Node 22/24 validation were not established for this change. Therefore no validator or extra runtime dependency is bundled, rather than pretending that declarations were validated.

The integration point `inspectOriginal(bytes)` currently returns `{status: "unsupported", validated: false, signerSummary: null, actionSummary: null}`. `c2paStatus` is the server result, separate from the client's `provenanceStatus`. A future adapter must disable all network fetches, validate locally under an explicit trust policy, bound resource use, and retain only privacy-safe signer/action summaries, never manifest GPS/device/identity payloads. Absent C2PA must never imply a fake image. This version does not inspect EXIF GPS/time or verify device integrity.

Tests: `npm test`. Added coverage includes session ownership/expiry/replay/concurrent consumption/transaction rollback, original-byte SHA mismatch, deterministic priorities, no automatic complaint transition, unavailable AI, public redaction, reviewer history/audit, retention and additive migration/restart. Tested on Linux Node 22 and 24; Windows has not been exercised here.

The two subprocess count-output tests use plain string writes rather than colored numeric console formatting. `FORCE_COLOR=1 npm test` was also checked on Linux to cover the terminal-color failure; this is not a Windows execution claim.

## Changes on branch improve-loop (for the frontend owner)
No response JSON shapes were intentionally changed; some validation and state-conflict status codes are stricter, and list order is deterministic when timestamps tie. Status codes that are new or stricter (treat 409 as a business-state conflict, not a server error):
- `POST /api/complaints/:id/repair`: 409 if the required before/after evidence was marked `needs_reupload` or `needs_site_visit` by a reviewer (latest reviewer decision wins; unreviewed evidence still counts).
- `POST /api/transfers/:id/accept`, `POST /api/complaints/:id/priority`: 409 on a Resolved complaint (reopen first). `POST /api/extensions/:id/review` approve: 409 if the complaint is already Resolved (deny still works).
- `POST /api/complaints/:id/link`: 400 if the two selected complaints themselves differ in category/ward, are the same, or are over 100 m apart (unchanged); new 409 if either existing cluster contains a complaint with a different category or ward than the target.
- `GET /api/complaints`: `limit` 1-100 and `offset` >= 0 must be plain integers, else 400; ties in `submittedTs` are now ordered by id descending.
- `GET /api/jurisdictions/lookup`: empty, missing or non-numeric `lat`/`lon` now 400.
- Numeric ids in `/api/transfers/:id/accept` and `/api/extensions/:id/review`: malformed 400, well-formed but missing 404. Escalation level must be 1, 2 or 3 (else 400).
- `CORS_ORIGINS` entries are now trimmed; matching is still exact.

Round 6 (hardening, no status-code or response-shape removals):
- Legacy plaintext-password migration is now one atomic transaction: a mid-migration failure rolls back instead of leaving a half-migrated `users` table. Back up real databases before upgrading regardless.
- `GET /api/jurisdictions`: the documented `sources` field is now actually populated from the provenance manifest (dataset file, records dates, SBM source, redistributors, rejected-source count); previously it was silently omitted. Additive only.
- Repeated `?lang=` query values (array-shaped input) now fall back to English instead of throwing a 500; normal Hindi/English behaviour unchanged.
- `npm run demo` cleanup refactored to a single awaited path (listener + idle sockets + database closed exactly once, nonzero exit preserved on scenario failure). The demo header now says "no external network calls" (it binds a local ephemeral port).
- Startup hardening: an explicitly set `PORT` must now be an integer 1-65535 (clear startup error otherwise; default stays 3001, `HOST` stays loopback). An unopenable `DB_PATH` exits with a clear diagnostic instead of a raw stack. `journal_mode = WAL` and `foreign_keys = ON` are verified after being set, with a startup warning (not silent assumption) if a filesystem cannot do WAL; `:memory:` databases correctly report `memory`.
- New restart regression tests: an existing current database keeps its users, complaints and passhashes across repeated startups, and startup is idempotent.
- New operator/CLI tests: `scripts/provision-user.cjs` rejects empty/short/over-512-character passwords, invalid roles and control-character display names without creating the database; accepts exactly 512 characters; strips one trailing newline/CRLF; never overwrites an existing account; closes the database cleanly.
- New i18n coverage tests: known errors return Hindi with `translationFallback:false`, unknown messages keep their English text with `translationFallback:true`, unsupported languages stay English, statuses are unchanged, and machine fields (acknowledgement number) are never translated.
- New tests: audit-chain tamper detection (payload change and broken prevHash both invalidate), migration atomicity incl. forced-failure rollback on a temporary legacy database, jurisdiction provenance, language-input shapes, demo exit codes.

## Clean-checkout verification record (15 October 2026)

Results below are from an actual fresh clone (no copied `node_modules`), not from an existing worktree.

- Revision tested: `2ce44ee` (branch `improve-loop`, round 10)
- Environment: Linux x64, Node v22.23.3, npm 10.9.9
- `npm ci`: exit 0 (0 vulnerabilities)
- `npm test`: exit 0 — 151 tests, 150 pass, 0 fail, 1 skipped (optional AI detector model not bundled)
- `npm run demo`: exit 0 — audit chain reported valid (33 events, local hash chain, not externally anchored)
- `git status --short` after the runs: clean, no tracked files modified

This pass exercised Node 22.23.3 only. The Node 24.21.0 Linux verification mentioned above predates this pass and was not re-run here; Windows execution remains untested. Reproduce with: `node --version && npm --version && node -p "process.platform + ' ' + process.arch" && npm ci && npm test && npm run demo && git status --short`.


## Account events (round 12)

`POST /api/me/phone` (valid update) and `POST /api/logout` (only when a real token row is deleted) write a row to the `security_events` table: actor, action, timestamp. This is separate from the complaint audit hash chain and never stores the phone number, token or password. Login tokens now count as expired when their age is at or past 12 hours.

## Round 13 behaviour notes

- Approving a deadline extension marks the complaint's pending escalation tasks `superseded`; accepting one returns 409. If the complaint goes overdue again, the sweep reactivates the superseded task (with a new `Escalation L<n>` audit row) instead of silently skipping it.
- `POST /api/complaints/:id/link` now returns 409 unless every complaint in the source cluster is within 100 m of some complaint in the target cluster. The audit row lists `movedComplaintIds`.
- With `DEMO_MODE=true`, startup is refused when `HOST` is not loopback (public demo password `demo123`). Set `ALLOW_DEMO_ON_NETWORK=true` only for an intentional LAN demo. The check runs before any demo account is written.

## Round 14 behaviour notes

- `POST /api/complaints/:id/route` returns 409 while a complaint is `Verification Pending` (verify or dispute first).
- Retention also deletes the redacted complaint's capture sessions, in the same transaction as its evidence.
- Public tracking by acknowledgement number is kept as designed: a random 48-bit suffix, redacted public view, 404 for unknown numbers. Whether unknown vs. existing numbers should look identical is a product decision, not changed here.

## Round 15 behaviour notes

- Login runs the same scrypt verification for unknown usernames (against a startup-computed dummy hash) so response timing does not reveal whether a username exists. The 401 body is unchanged and failures still count toward the rate limit.
- `POST /api/complaints/:id/impact` returns 409 once the complaint is Resolved (reopen first).
