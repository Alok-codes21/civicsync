# Current backend route audit

Audit against the actual server route registrations, not a UI endpoint-name count. Business logic/schema unchanged. Tests use a local in-memory synthetic database. A test file listed here is supporting evidence, not a claim that every state/role/optional payload combination was executed in it.

| API method / path (under /api) | Frontend workflow or exact boundary | Supporting checks |
| --- | --- | --- |
| GET `/health` | Service info | service.cjs; hosting.cjs |
| POST `/login` | Authentication/session | session.cjs; storage.cjs |
| POST `/logout` | Authentication/session | session.cjs; storage.cjs |
| GET `/me` | Authentication/session | session.cjs; storage.cjs |
| POST `/signup` | Authentication/session | session.cjs; storage.cjs |
| POST `/me/phone` | Service info | service.cjs; hosting.cjs |
| GET `/evidence/:id` | Private images, capture session, upload receipt with returned AI/provenance/review signals, reviewer decisions | reviewer.cjs; related.cjs; parity.cjs |
| GET `/capabilities` | Service info | service.cjs; hosting.cjs |
| GET `/translations` | Service info | service.cjs; hosting.cjs |
| GET `/jurisdictions` | Service info | service.cjs; hosting.cjs |
| GET `/jurisdictions/officer-hints` | Service info / reference lookup | lookup.cjs |
| GET `/reference/charter` | Service info | service.cjs; hosting.cjs |
| GET `/reference/locality` | Service info / reference lookup | lookup.cjs |
| GET `/jurisdictions/lookup` | Service info / reference lookup | lookup.cjs |
| GET `/complaints` | Create/report or paged mine/public lists with ID/category/status search; hazards persist in replay/draft | draft.cjs; assisted.cjs; pagination.cjs; qa.cjs; parity.cjs |
| GET `/complaints/:id` | Private/public case detail, readable assessments/review history | reviewer.cjs; parity.cjs |
| POST `/complaints` | Create/report or paged mine/public lists with ID/category/status search; hazards persist in replay/draft | draft.cjs; assisted.cjs; pagination.cjs; qa.cjs; parity.cjs |
| POST `/complaints/:id/status` | Case actions / ownership and deadline | session.cjs; backend workflow tests |
| POST `/complaints/:id/events` | Not exposed: backend always returns 410 | Backend disabled-endpoint test |
| GET `/complaints/:id/contact` | Staff case tools | case-tools.cjs |
| POST `/complaints/:id/accept` | Case actions / ownership and deadline | session.cjs; backend workflow tests |
| POST `/routes` | Operations and metrics (role gated) | operations.cjs; case-tools.cjs |
| POST `/complaints/:id/route` | Supervisor case routing for every non-resolved state, explicit reset confirmation | parity.cjs; source-state condition |
| POST `/complaints/:id/transfer` | Case actions / ownership and deadline | session.cjs; backend workflow tests |
| POST `/transfers/:id/accept` | Staff queue with transfer acceptance / independent extension review | session.cjs and backend workflow tests |
| POST `/complaints/:id/extensions` | Case actions / ownership and deadline | session.cjs; backend workflow tests |
| POST `/extensions/:id/review` | Staff queue with transfer acceptance / independent extension review | session.cjs and backend workflow tests |
| POST `/complaints/:id/evidence-session` | Private images, capture session, upload receipt with returned AI/provenance/review signals, reviewer decisions | reviewer.cjs; related.cjs; parity.cjs |
| POST `/complaints/:id/evidence` | Private images, capture session, upload receipt with returned AI/provenance/review signals, reviewer decisions | reviewer.cjs; related.cjs; parity.cjs |
| POST `/complaints/:id/repair` | Case actions / ownership and deadline | session.cjs; backend workflow tests |
| POST `/complaints/:id/verify` | Case actions / ownership and deadline | session.cjs; backend workflow tests |
| POST `/complaints/:id/evidence-review` | Private images, capture session, upload receipt with returned AI/provenance/review signals, reviewer decisions | reviewer.cjs; related.cjs; parity.cjs |
| POST `/complaints/:id/priority` | Staff case tools | case-tools.cjs |
| POST `/complaints/:id/link` | Private case related reports | related.cjs |
| GET `/complaints/:id/related` | Private case related reports | related.cjs |
| GET `/work-queue` | Staff queue with transfer acceptance / independent extension review | session.cjs and backend workflow tests |
| GET `/escalations` | Supervisor escalation queue | workflow-load-states.cjs and backend workflow tests |
| POST `/complaints/:id/escalations/:level/accept` | Supervisor escalation queue | workflow-load-states.cjs and backend workflow tests |
| GET `/audit` | Operations and metrics (role gated) | operations.cjs; case-tools.cjs |
| GET `/stats/public` | Operations and metrics (role gated) | operations.cjs; case-tools.cjs |
| GET `/stats/comparison` | Operations and metrics (role gated) | operations.cjs; case-tools.cjs |
| GET `/stats/workload` | Operations and metrics (role gated) | operations.cjs; case-tools.cjs |
| GET `/stats/hotspots` | Operations and metrics (role gated) | operations.cjs; case-tools.cjs |
| GET `/stats/predictive-risk` | Operations and metrics (role gated) | operations.cjs; case-tools.cjs |
| GET `/privacy` | Service info | service.cjs; hosting.cjs |
| POST `/privacy/retention` | Not exposed: destructive redaction/deletion. Requires explicit operator authorization and backup/privacy decision. | Backend retention tests only, not executed against user data |
| POST `/complaints/:id/impact` | Staff case tools | case-tools.cjs |
| GET `/impact` | Operations and metrics (role gated) | operations.cjs; case-tools.cjs |

## Contract boundaries
- Every registered active, non-destructive workflow has a UI route. This is not exhaustive parameter or production parity. The two endpoint exclusions above remain explicit.
- Intake hazard codes now reach server severity/deadline logic; user-selected reportedPriority is not offered because server ignores it for severity. English/Hindi selection records language metadata on assisted intake; translation endpoint only supplies limited backend strings, not a full Hindi UI.
- Evidence upload uses validated PNG/JPEG web uploads or two-minute capture sessions. Device integrity is honestly unavailable and provenance unsupported. Arbitrary integrity hashes, C2PA claims, manually spoofed capture timestamps/GPS and external attestation are not fabricated. Evidence photo GPS is not captured by this client. Model activation is not a frontend operation; returned upload signals are now shown even when unavailable.
- Routing reset is now reachable for all non-resolved cases, including work/verification states, with explicit warning and checkbox. Backend rejects invalid configuration/permissions. No new routing mutation runs on render.
- Private case assessment now displays returned severity/evidence reasons, routing suggestion when supplied, review history. Upload receipts and complaint acknowledgements show response fields previously dropped. Public views still omit private fields.
- Backend lacks route-list/users-directory, impact idempotency, account claim/recovery, OTP/SMS, verified municipal integration and stable cursor pagination. Frontend cannot supply those server guarantees. No backend edits or new API endpoints in this change.
- Retention deletes evidence/redacts identity/location after 90 days. No UI execution control was enabled and no production/user dataset was touched. Existing backend startup/timer maintenance is pre-existing behavior, not a new frontend trigger.
- Live deployment/persistence/backups/security, full accessibility and real model accuracy remain unverified. No more scored review rounds were run.
