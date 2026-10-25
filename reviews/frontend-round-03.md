# Frontend review 3 of 8
Reviewed preceding commit d0e5e76 in existing Anveshna conversation.

Fixed verified defects: exact payload/key persisted before complaint creation, actor-scoped in this tab. Ambiguous network failures retain pending request and block new form; retry uses exact key/body. 409 stays unresolved. Definite validation failures allow correction. Selected photos remain in memory until confirmed submission, never falsely persisted.

Text-only drafts save/continue/delete in same tab, scoped by username. No photo/GPS persistence or offline-sync claim. Removed legacy localStorage grievance notification import; grievance action explicitly unavailable and never generates fake acknowledgement/notification.

Tests: lint/build; browser test commits create then drops response, reloads, retries, receives same canonical ID (exactly one create + one replay); draft text restore after reload; direct detail refresh and mobile overflow0. Pending payload includes location when explicitly submitted because replay must be exact; separate text drafts omit GPS.
