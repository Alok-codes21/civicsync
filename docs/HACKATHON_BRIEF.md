# CivicSync - hackathon brief (Ghaziabad prototype)

Backend-only prototype. Not deployed, no live municipal integration, no real citizen data.

## 30-second judge explanation
Citizens file a civic complaint and get an acknowledgement number. Nothing is routed by guesswork: if the ward and category have no configured route, it goes to Routing Review and a supervisor confirms. The assigned officer accepts, uploads before/after evidence, and the repair is closed only when someone other than the repairer approves it (the citizen owner or an independent reviewer). Disputes, reopens, missed deadlines and escalations are tracked and written to a tamper-evident audit log.

## Official data used (all from ghaziabadnagarnigam.in, fetched 14 Oct 2026, copied not live)
| Page | Used for | Status |
|---|---|---|
| citizen-charter.aspx | SLA days per sub-category, responsible role | 63 rows in seed. SLA applied automatically only to Garbage Collection and Streetlights (1 day, unambiguous). Other categories span several SLAs and keep priority-based deadlines. |
| zones-and-wards.aspx | Ward-to-locality names (100 wards, string ids), zone candidates | Suggestion only. Names repeat across wards, so ambiguous matches go to human review. |
| staffList.aspx | Officer names/designations as supervisor hints | Names only, no contacts, reviewers/supervisors only, never used for login or assignment. |
| health-department.aspx | Context for garbage/drain routing | Text only, nothing structured. |
Seed: `data/ghaziabad/seed-v1.json` (version 1, verified 2026-10-14, flagged stale after 180 days). Source flaws recorded in the file: no effective dates, one malformed Tubewell row, conflicting duplicate "Barren land to be Greened" (7D and 1D).
Ward boundaries are 2022 SBM polygons, 94 of 100 wards, unverified hints.

## Limitations to say out loud
- Not a live integration. Not an official export. No SMS or municipal systems. Citizen phone number is saved as an unverified contact (staff-only, no OTP).
- Client GPS and photos can be faked; AI image score is an experimental flag for human review only, never a decision.
- Demo accounts and routes are public sample identities. Rate limits are in memory.
- Reviewer and supervisor roles are broad in this prototype.
- Frontend is built separately by a teammate.

## Run
```
npm ci
npm test          # 76 tests
npm run demo      # scripted success + overdue/dispute/escalation/reopen scenarios, in memory
DEMO_MODE=true npm start   # API on 127.0.0.1:3001
```
New read-only endpoints: `GET /api/reference/charter`, `GET /api/reference/locality?q=`.
