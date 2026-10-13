# Original 29 unsolved/partial items - verified local backend scope

22 automated tests pass: 21 real HTTP workflow tests plus legacy migration/restart test. This does not validate a live deployment, frontend or physical municipal work. D = implemented prototype workflow; P = partial protection with stated gap; N = not implemented. Original #25 tracking is retained, not counted below.

| Original item | State | Implemented / remaining |
|---|---|---|
| 1 AI-generated images | P | Review reasons, null confidence, detector unavailable. No real detector. |
| 2 Fake/wrong GPS | P | Coordinate validation, accuracy/mismatch flags. Client GPS can still be spoofed. |
| 3 Old/reused photos | P | Server receive time, exact SHA reuse and reported capture-age flags. No trusted timestamp/perceptual matching. |
| 4 Duplicate complaints | D | Nearby same category/ward candidates and reviewer-confirmed common issue IDs; preserves reports. |
| 5 Deliberately false reports | P | Evidence review, site-visit/reupload decisions; no independent physical truth. |
| 6 False closure | D | Direct resolution blocked; before/after repair submission then separate approval. Physical truth remains human responsibility. |
| 7 Independent verification | D | Owner or reviewer approval; repair submitter cannot approve their own work. |
| 8 Tampered evidence | P | Stored hashes/private access and review. No edit or forged-capture detector. |
| 9 Recurring issues | D | Reopen cycles, related historical candidates and recurrence counts. |
| 10 Citizen disputes | D | Owner-only reopen, resolved-state guard, reason, new deadline and escalation cycle. |
| 11 Proof of actual work | P | Required before/after bytes, server record, submitter and audit. Capture/work claims not attested. |
| 12 Wrong jurisdiction | P | Ward+category config and unknown-jurisdiction review. Demo routes, no official boundaries/municipal verification. |
| 13 Handoff delays | D | Pending transfer and target acceptance; old owner retained meanwhile. Does not guarantee response. |
| 14 Deadline misses | P | L3 bug fixed, independent overdue calculation. Cannot guarantee repairs happen. |
| 15 Escalation failures | P | Idempotent internal L1-L3 tasks and receipt. Real authority delivery/hierarchy pending. |
| 16 Unjustified extensions | D | Reason + separate supervisor approval; original SLA kept; no direct client deadline edit. |
| 17 Fair officer metrics | P | Workload, severity, reopen, original SLA and no speed ranking. Risk-adjusted score not validated. |
| 18 Audit trail | D | Transactional actor/time/before-after hash chain, SQL no-update/delete triggers. No external anchor. |
| 19 Issue clustering | D | Reviewed links to common issue ID with no deletion of citizen reports. |
| 20 Severity | P | Hazard-code rules, enum checks, supervisor review. Reported danger still needs verification. |
| 21 Hotspots | P | Approximate grid counts/recurrences, maintenance-review flags. Grid boundaries and threshold not validated. |
| 22 Predictive maintenance | N | Explicitly not trained. Heuristic counts are not predictions. Needs real historical data and evaluation. |
| 23 Explainability | D | Human-readable reason codes and audit reasons; no fabricated AI outputs. |
| 24 Uncertainty | D | Unknown evidence/confidence -> human review; no automatic rejection. |
| 26 Language/accessibility | P | Hindi/English Unicode content, small paginated responses, no image requirement. UI accessibility/translation untested. |
| 27 Digital exclusion | P | Authorized assisted phone/desk intake for existing citizen account. Real IVR/SMS/offline intake and unclaimed accounts pending. |
| 28 Privacy | P | Public reads redact location/PII/notes; evidence access-controlled. Public demo passwords and deployment/retention/encryption remain production blockers. |
| 29 Fair comparison | P | Sample sizes, mix, original SLA and no unsupported ranking. Proper adjustment/valid benchmark pending. |
| 30 Public impact | P | Resolution/reopen/unique issue metrics and reported loss observations. No baseline/control/causal reduction proven. |

Count: 11 implemented prototype workflows, 17 partial, 1 not implemented. This is not 29 fully solved real-world problems. SMS OTP and Aadhaar are also explicitly not connected, not silently stubbed as successful.
