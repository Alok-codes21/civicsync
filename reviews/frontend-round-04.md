# Frontend review 4 of 8
Reviewed preceding commit 1c84f597 in existing Anveshna conversation.

Fixed verified evidence-review enum mismatch: sends accepted_for_work/needs_reupload/needs_site_visit, matching existing server contract. Fixed public-detail crash: absent user and absent author compared equal, then code dereferenced null user.username. Public owner now requires an authenticated user. Browser regression actually opens public detail after staff sign-out and asserts privacy UI (not just absence on blank page).

Capture session creation disabled while pending. ISO expiresAt parsing retained (server returns ISO, not epoch). Client-declared capture labels explicit. Routing Review cannot accept an unconfigured assignment; extension datetime validated before action. Intake no longer queries staff-only queue endpoint.

Rejected reviewer false positives: supervisor self-approval and reviewer self-verification are already checked server-side and in UI; identity change already keys/remounts CaseDetail and cancels live blob population. No backend changes.

Validation: clean lint/build, reviewer needs_reupload stored and displayed; public detail no private evidence/actions; full repair lifecycle and mobile overflow0. Actual model inference unverified; flag-only semantics unchanged.
