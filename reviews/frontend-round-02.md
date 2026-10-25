# Frontend review 2 of 8
Review: existing Anveshna conversation, preceding commit 2794455.

Verified and fixed:
- Auth failure clears the current session, not a newer session belonging to another request token. Private lists/queues and successful-submission state are cleared when identity changes.
- Refresh generations ignore older list responses. Case detail remounts on identity/route change and ignores superseded loads. Late evidence blob responses revoke their URLs.
- Failed photos are retained by filename and retry separately from the already-created complaint; uploads continue after an individual failure. Files remain only in memory while this page is open.
- Actual backend display name and role replace hardcoded officer identity. Review reason codes use readable expandable labels.

Rejected/qualified:
- Initial /me cannot race with form sign-in here: workspace blocks until session restoration completes. Other request races were real.
- live_camera is a valid backend enum (server/evidence-trust.cjs). A session does not prove authenticity; existing notice retained.
- Stable idempotency key within mounted form exists; cross-remount ambiguous-response recovery remains for round 3.

Validation: frontend lint/build; actual browser session-expiry→citizen re-login test; officer accept→progress→repair→citizen approval→reopen; dark/mobile zero horizontal overflow. Detector inference still not enabled/tested. No production readiness claim.
