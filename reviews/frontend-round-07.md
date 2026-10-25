# Frontend review 7 of 8
Reviewed preceding 32a5f81 in existing Anveshna conversation.

Deployment preparation, not live deployment: added start:integrated, private API_PORT/public hosting PORT separation, backend readiness, fail-together termination and configurable web binding. Existing backend source/API/auth/schema unchanged. Same-origin production default documented; SPA deep links and API JSON errors remain separate. Root README now accurately describes branch integration instead of claiming no frontend.

Frontend/DEPLOYMENT.md states hosting sign-in, live persistence and storage choice still pending; ephemeral SQLite loses accounts/evidence on restart/redeploy. No paid resource, hosting sign-in, model activation or main merge occurred.

Tests: integrated health200, deep-link HTML200, unknown API JSON404, clean SIGTERM clears both ports. Backend unchanged regression150pass/1optional skip. Prior full frontend suite passes. Final hosting-specific choices and restart/backup validation must be checked on the actual selected host; local preparation does not prove durable deployment.
