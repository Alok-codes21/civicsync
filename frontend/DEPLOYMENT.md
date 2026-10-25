# Integrated hosting preparation

Not deployed or production-ready. Hosting is deferred by the user; hosting account access and final data-persistence choice remain pending. Do not present a static frontend as a working integrated service.

Build from root with `npm ci && npm run build:web`. Start with `npm run start:integrated`. Host-provided PORT is public web listener (0.0.0.0); API_PORT defaults3001 on loopback only. Ports must differ. The wrapper waits for API health, stops the other process when either exits, and forwards termination. For local tests use WEB_HOST=127.0.0.1. API semantics are unchanged.

Leave VITE_API_BASE_URL unset for same-origin /api proxy. It is build-time, not runtime. A separate-origin API needs deliberate HTTPS/CORS/privacy configuration. Direct /detail/ID refresh serves SPA; /api failures remain JSON, not index.html.

SQLite stores credentials, case text and evidence blobs. DB_PATH must use an existing writable directory. Free ephemeral filesystem loses data on restart/redeploy and is suitable only for a clearly labelled synthetic demo with user acceptance. Durable hosting/disk costs and backup route must be verified and approved before provisioning; nothing paid is authorized by these instructions. Do not put actual citizen data in the public prototype.

DEMO_MODE and DEMO_ROUTES are off by default. Enabling them creates publicly-known synthetic accounts/routes; never imply real staff verification. AI model weights are not committed or downloaded by the normal build. Use `npm run start:integrated:ai` to checksum-download the pinned local model and then start the integrated app. This requires outbound access at startup and an 87,333,629-byte model download on a clean filesystem. Existing pinned weights are reused after checksum validation. `AI_DETECTOR=off` still disables it. No paid API or external image upload is involved. The model is now locally executed and upload-to-UI verified; this is not accuracy validation on civic photos. Detector unavailable is not authenticity proof; no auto-rejection. No SMS/email/municipal delivery.

Before sharing any live site: verify HTTPS URL and deployed branch SHA; deep-link refresh, login/signup, canonical create/replay, private evidence denial, repair review, sign-out, mobile UI; determine restart behavior and database persistence. Record actual limitations and rollback path. Avoid main merge; deploy frontend-integration only.
