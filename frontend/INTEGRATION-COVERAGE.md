# Frontend and backend coverage after 16 review rounds and parity audit

The frontend uses the existing backend; server business logic, endpoints and schema are unchanged. This is local prototype coverage, not production certification or a claim that every optional API parameter has a polished screen.

See `ENDPOINT-PARITY.md` for every registered route and explicit parameter/permission boundaries. The later audit found genuine gaps missed by the earlier endpoint summary: hazard input and routing-state reachability, plus dropped response fields.

## Connected workflows
- Login, citizen signup, logout and session expiry; tab-scoped draft/recovery with stable intake replay.
- User-reported hazards reach backend severity/deadline logic and survive text drafts/exact replay.
- Citizen and assisted intake: canonical complaint acknowledgement, channel/language/citizen metadata, photos and failed-photo retry. An unclaimed assisted account is not a verified/recoverable citizen login.
- Private/public complaint lists, pagination, detail and deep-link refresh. Public counts explicitly describe loaded pages, not authoritative global metrics.
- Staff acceptance, status/progress, before/after evidence, repair review, approve/dispute/reopen, evidence scope, transfers/extensions and supervisor escalation acceptance.
- Supervisor routing application on any non-resolved case requires explicit assignment-reset confirmation. Private assessment/review history, latest upload signals and acknowledgement routing/candidate receipts are readable.
- Supervisor priority, route configuration (replacement warning and confirmation), assigned staff contact lookup, impact observation; backend permissions remain authoritative.
- Related candidate lookup and reviewer/supervisor issue linking, preserving complaint records.
- Service capability/privacy/translation/charter/jurisdiction notices; citizen contact update is unverified, no OTP/SMS.
- Locality/coordinate lookup and role-gated officer hints, never automatic municipal assignment.
- Public stats/comparison and supervisor audit/workload/hotspot/risk/impact results display the returned data and caveats.

## Deliberate exclusions and limits
- Destructive POST /privacy/retention is not exposed as an automatic or ordinary UI action. Operators must review privacy policy/backups before executing it separately. Arbitrary event creation returns410 and is not offered.
- Backend list q/status parameters have a separate server-wide search form for citizen/public lists, with pagination and applied filter labels. Existing loaded-list title filtering remains separate. Offset pagination can shift during concurrent inserts. A refresh restarts the loaded list.
- Service/metrics/reference panels are structured readable backend-result views, not fully designed analytics reports. No full Hindi UI, verified boundary/account mapping, actual municipality, OTP or SMS connection is implied.
- Pinned model weights are now installed and real local inference/upload-to-UI execution is verified. Weights are not committed; new checkouts must run setup. See `../docs/DETECTOR-VERIFICATION.md`. No deployed host, civic-photo accuracy, production security/accessibility audit or real citizen data evaluation is verified.
- Local tests cover one or more examples of the connected workflows, not every role/state/concurrency combination. Impact has no server idempotency support: synchronous UI locks prevent rapid duplicate clicks but a lost successful response still needs operator reconciliation before retry.
- Housing/storage/login approvals remain separate. SQLite durability, backups and production operation must be proven on the selected host before sharing it as live.
