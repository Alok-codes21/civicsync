# Frontend and backend coverage after 16 review rounds

The frontend uses the existing backend; server business logic, endpoints and schema are unchanged. This is local prototype coverage, not production certification or a claim that every optional API parameter has a polished screen.

## Connected workflows
- Login, citizen signup, logout and session expiry; tab-scoped draft/recovery with stable intake replay.
- Citizen and assisted intake: canonical complaint acknowledgement, channel/language/citizen metadata, photos and failed-photo retry. An unclaimed assisted account is not a verified/recoverable citizen login.
- Private/public complaint lists, pagination, detail and deep-link refresh. Public counts explicitly describe loaded pages, not authoritative global metrics.
- Staff acceptance, status/progress, before/after evidence, repair review, approve/dispute/reopen, evidence scope, transfers/extensions and supervisor escalation acceptance.
- Supervisor priority, route configuration (replacement warning and confirmation), assigned staff contact lookup, impact observation; backend permissions remain authoritative.
- Related candidate lookup and reviewer/supervisor issue linking, preserving complaint records.
- Service capability/privacy/translation/charter/jurisdiction notices; citizen contact update is unverified, no OTP/SMS.
- Locality/coordinate lookup and role-gated officer hints, never automatic municipal assignment.
- Public stats/comparison and supervisor audit/workload/hotspot/risk/impact results display the returned data and caveats.

## Deliberate exclusions and limits
- Destructive POST /privacy/retention is not exposed as an automatic or ordinary UI action. Operators must review privacy policy/backups before executing it separately. Arbitrary event creation returns410 and is not offered.
- Backend list q/status parameters do not have a server-wide search form; existing screens filter loaded results. Offset pagination can shift during concurrent inserts. A refresh restarts the loaded list.
- Service/metrics/reference panels are compact backend-result views, not fully designed analytics reports. No full Hindi UI, verified boundary/account mapping, actual municipality, OTP or SMS connection is implied.
- No model weights enabled, deployed host tested, production security/accessibility audit performed, or real citizen data used. Static test images do not evaluate the detector.
- Local tests cover one or more examples of the connected workflows, not every role/state/concurrency combination. Impact has no server idempotency support: synchronous UI locks prevent rapid duplicate clicks but a lost successful response still needs operator reconciliation before retry.
- Housing/storage/login approvals remain separate. SQLite durability, backups and production operation must be proven on the selected host before sharing it as live.
