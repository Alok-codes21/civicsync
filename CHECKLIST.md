# Original 29 unsolved/partial items - verified local backend scope

66 automated tests pass, including real HTTP workflows, migration/restart, image similarity, offline retry, privacy and metric calculations. Separate optional-model HTTP smoke test also passes (synthetic fixture only, not accuracy evaluation). This does not validate a live deployment, frontend or physical municipal work. D = implemented prototype workflow; P = partial protection with stated gap; N = not implemented. Original #25 tracking is retained, not counted below.

| Original item | State | Implemented / remaining |
|---|---|---|
| 1 AI-generated images | P | Checksum-pinned Apache-2.0 ViT ONNX on local CPU, review-only uncalibrated score. One command: `npm run setup:detector` (downloads + SHA-256 check); ON automatically when weights exist, `not_connected` otherwise, `AI_DETECTOR=off` disables. Flag for human review only, never auto-reject. Labelled-data evaluation command added with consent/provenance, both-class, duplicate and unavailable-model guards. No civic-photo accuracy validation. |
| 2 Fake/wrong GPS | P | Coordinate validation, accuracy/mismatch flags. Client GPS can still be spoofed. |
| 3 Old/reused photos | P | Server receive time, exact SHA reuse and reported capture-age flags. Decoded-image dHash flags some resized/recompressed copies. Flat-image guard, capped search window. No trusted timestamp or reliable arbitrary edit/crop matching. |
| 4 Duplicate complaints | D | Nearby same category/ward candidates and reviewer-confirmed common issue IDs; preserves reports. |
| 5 Deliberately false reports | P | Evidence review, site-visit/reupload decisions; no independent physical truth. |
| 6 False closure | D | Direct resolution blocked; before/after repair submission then separate approval. Physical truth remains human responsibility. |
| 7 Independent verification | D | Owner or reviewer approval; repair submitter cannot approve their own work. |
| 8 Tampered evidence | P | Stored hashes/private access and review. No edit or forged-capture detector. |
| 9 Recurring issues | D | Reopen cycles, related historical candidates and recurrence counts. |
| 10 Citizen disputes | D | Owner-only reopen, resolved-state guard, reason, new deadline and escalation cycle. |
| 11 Proof of actual work | P | Required before/after bytes, server record, submitter and audit. Capture/work claims not attested. |
| 12 Wrong jurisdiction | P | Ward+category config and unknown-jurisdiction review. 94/100 Ghaziabad ward polygons from 2021-22 SBM, unverified hint only; no official current boundaries or verified officer registry. Official-list-derived AE hints cover 100 wards; JE hints 56. Source A/ए numbering alignment and freshness unverified, 31 wards have multiple zone entries; no automatic routing. |
| 13 Handoff delays | D | Pending transfer and target acceptance; old owner retained meanwhile. Does not guarantee response. |
| 14 Deadline misses | P | L3 bug fixed, independent overdue calculation. Cannot guarantee repairs happen. |
| 15 Escalation failures | P | Idempotent internal L1-L3 tasks and receipt. Real authority delivery/hierarchy pending. |
| 16 Unjustified extensions | D | Reason + separate supervisor approval; original SLA kept; no direct client deadline edit. |
| 17 Fair officer metrics | P | Workload, severity, reopen, original SLA and no speed ranking. Correct even-sample median and matured-SLA denominator (includes unresolved cases). No validated risk-adjusted score. |
| 18 Audit trail | D | Transactional actor/time/before-after hash chain, SQL no-update/delete triggers. No external anchor. |
| 19 Issue clustering | D | Reviewed links to common issue ID with no deletion of citizen reports. |
| 20 Severity | P | Hazard-code rules, enum checks, supervisor review. Reported danger still needs verification. |
| 21 Hotspots | P | 150m category-specific connected-component clusters, 90-day window, >=3 unique issues. Rounded centres; threshold, chaining and reporting bias not validated. |
| 22 Predictive maintenance | P | New history-risk endpoint labels review tiers from repeated unique issues, recurrences and overdue cases. Explicitly untrained/unvalidated, probability null. Asset/history data and prospective evaluation remain pending. |
| 23 Explainability | D | Human-readable reason codes and audit reasons; no fabricated AI outputs. |
| 24 Uncertainty | D | Unknown evidence/confidence -> human review; no automatic rejection. |
| 26 Language/accessibility | P | Common Hindi/English API errors, acknowledgements and string endpoint; explicit English fallback. Regional languages and UI accessibility/translation untested. |
| 27 Digital exclusion | P | Authorized assisted intake can create unclaimed records; offline channel plus idempotent retry contract. Actual offline client, safe claiming and real IVR/SMS pending. |
| 28 Privacy | P | Public reads redact location/PII/notes; evidence access-controlled. Demo accounts off by default, loopback bind, closed CORS, no-store, redacted new audit snapshots, 90-day old-resolved evidence/PII sweep. Existing demo identities, legacy audit/backups, active-data retention, encryption, quotas and deployment remain blockers. |
| 29 Fair comparison | P | Sample sizes, mix, original SLA and no unsupported ranking. Category+severity standardized SLA rate only with >=10 matured cases in every reference stratum; otherwise null. No ranking; validated benchmark/confounder adjustment pending. |
| 30 Public impact | P | Resolution/reopen/unique issue metrics and reported loss observations. Strict litres/hours/INR units. No baseline/control/causal reduction proven. |

Count: 11 implemented prototype workflows, 18 partial, 0 wholly absent locally. This includes an explicitly untrained #22 heuristic, not completed predictive maintenance. This is not 29 fully solved real-world problems. Phone number is saved (format-checked, unverified, staff-only); OTP/SMS was removed.
