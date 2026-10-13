# Assisted/offline intake contract

An authorized intake desk can buffer a text-only complaint on its own device and send it when connected. No image or GPS is required. This repository is API-only; it does not include an offline browser/mobile client.

1. Keep buffered personal data encrypted on the desk device with an operator-approved policy. Do not use shared browser localStorage for real citizen records.
2. Generate one random Idempotency-Key per complaint and persist it with the exact payload. A retry must send the same JSON body in the same key order. The current digest uses JSON serialization; it is not a semantic-JSON comparison.
3. Authenticate as an intake account and POST /api/complaints with channel offline, language en/hi, title, description, category and ward. Omit citizenUsername when the citizen has no account.
4. A 201 response returns acknowledgementNumber. An identical retry returns the original number with replayed true. Different data under that key returns 409; do not silently create a new complaint to hide a conflict.
5. The desk actor can retrieve its unclaimed complaint. Other unrelated citizens cannot. Unclaimed accounts have random inaccessible passwords and no automatic public claiming endpoint. A safe identity-checked claiming flow remains pending.
6. Delete the queued device payload after a confirmed acknowledgement according to the desk's policy. Do not claim SMS delivery, telephone integration or citizen ownership verification.

CORS_ORIGINS must name the actual frontend origin. Idempotency-Key is included in allowed request headers for permitted origins. The backend binds to loopback by default; deployment requires separate TLS, access, backup and operator controls.
