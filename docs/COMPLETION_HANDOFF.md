# Backend completion handoff

## Officer hints

Public source pages read 13 October 2026:
- https://ghaziabadnagarnigam.in/staffList.aspx
- https://ghaziabadnagarnigam.in/zones-and-wards.aspx

Four ward-numbered Assistant Engineers cover 100 unique wards. Four ward-numbered Junior Engineers cover 56 unique wards. Other staff entries lack explicit ward lists and are not inferred. No mobile numbers are committed. Original Hindi names/designations and source ward tokens preserve provenance. These are hints, not current authority validation or login accounts.

The zone page repeats 31 ward numbers across zones and has an out-of-range "880" row. Multiple zone candidates are retained; 880 is excluded, not changed to a guessed number. A/ए ward suffix meaning and alignment with the older SBM polygons remain unverified. The source has no effective date. Review before configuring local staff accounts/routes. No seed writes into users/routes. The hint endpoint requires reviewer/supervisor access and never assigns or contacts anyone.

## SMS adapter, still disabled

`server/twilio-sender.cjs` supports the Twilio Messaging API, not managed Twilio Verify. It is tested with injected HTTP mocks only, no SMS transmission. Its custom OTP body is NOT a promise of trial eligibility or approved DLT template. A restricted trial that only accepts provider templates cannot use this adapter unchanged.

Before activation: user-approved account/route, current India eligibility/pricing/template checks, consenting controlled recipients and delivery testing. Supply secrets through secure vault/server environment, never chat or repo. No signup or spending took place.

Operator environment after these checks:
- PHONE_OTP_MODE=sms
- PHONE_OTP_SENDER_MODULE=./server/twilio-sender.cjs
- PHONE_OTP_PEPPER: persistent private value of at least 32 bytes
- TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN
- TWILIO_FROM or TWILIO_MESSAGING_SERVICE_SID
- TWILIO_ROUTE_APPROVED=true only after approval of route, body and costs

Provider acceptance is not confirmed delivery. Rejection/malformed receipts fail closed. Do not switch to sms with mocked credentials or a demo sender.
Reference: https://www.twilio.com/docs/messaging/api/message-resource
Trial/product findings and India caveats remain in PHONE_OTP.md.

## Real-image evaluation

Download checksum-pinned model with `npm run setup:detector` first. Keep photo files and results private. Manifest example (user supplies actual files and honest labels):

```json
{
  "consentToEvaluate": true,
  "images": [
    {"file": "real-road.jpg", "label": "real", "provenance": "Original civic photo, consenting owner, label checked"},
    {"file": "generated-road.jpg", "label": "ai", "provenance": "Known generator output, generation record retained"}
  ]
}
```

Run `node scripts/evaluate-detector.cjs /private/photos/manifest.json`. Images stay local. Requires both classes, relative paths inside manifest folder (including symlink checks), nonempty provenance, unique file bytes and available finite scores. Reports sample size, fixed exploratory 0.5 threshold, confusion matrix, false-positive/negative rates and per-image hash/score, not image paths. No result is produced when the detector is unavailable. Test fixtures exercise the calculator, NOT civic model accuracy. Do not commit photos or their evaluation report. Diverse held-out real/generated pothole and garbage images are needed before claiming useful accuracy; labels remain user-provided, not independently verified.

## Teammate frontend contract checklist

Need frontend repository/URL or ZIP to test its actual requests; none was supplied. No frontend code was built or changed.

1. API base defaults http://127.0.0.1:3001; configure exact frontend origin in CORS_ORIGINS. Frontend and backend must share a reachable deployment/network, not separate devices' localhost.
2. JSON requests, Bearer token from POST /api/login; expire after 12 hours. Default production setup creates no demo accounts; use scripts/provision-user.cjs. DEMO_MODE=true is local testing only.
3. POST /api/complaints requires title, description, ward and exact category string. Ack is acknowledgementNumber and complaint.id, not a sequential integer. Send optional numeric lat/lon/accuracy. Idempotency-Key retries must reuse identical payloads.
4. Inspect /api/capabilities and /api/jurisdictions. Default intake without reviewed route is Routing Review and officer null. Never turn a geoWard/officer hint into confirmed jurisdiction.
5. Assigned worker accepts assignment, uploads before/after PNG/JPEG base64 through private evidence endpoint, submits repair. Owner or reviewer approves; repair submitter cannot approve. Direct Resolved status is blocked. Owner-only dispute reopens a resolved record.
6. Public tracking deliberately hides title, description, exact location, private notes, timeline and images. Use authenticated owner/staff views for private fields. Handle 400/401/403/409/429/503; display human-review uncertainty, not fabricated verification badges.
7. Hindi/English common API strings exist, not full UI accessibility or regional translation. No actual offline frontend/IVR, phone-only signup, safe assisted claiming or live officer notifications yet.
8. Run the frontend with this backend and check citizen intake, tracking, auth expiry, private-image denial, staff acceptance, closure/dispute, OTP disabled/failure states, retries and CORS. Passing backend HTTP tests is not proof this frontend works.

## Remaining 18 partial items

Local signals cannot prove capture time, true GPS, physical work, present authority or causal public impact. Deadlines/queues cannot force repairs or confirm municipal delivery. Risk tiers are untrained; metrics still lack validated adjustment/benchmarks. Actual accessibility/offline channels, safe account claiming, deployment security/retention/backups/encryption and calibrated civic-photo detection require external data, product decisions or infrastructure. Checklist states remain 11 implemented prototype workflows and 18 partial, not 29 fully solved real-world problems. No merge or deployment was performed.
