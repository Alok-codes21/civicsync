# Integrated hosting preparation

Not deployed or production-ready. Hosting account access and final hosting/data-persistence choice remain pending. Do not present a static frontend as a working integrated service.

Build from root with `npm ci && npm run build:web`. Start with `npm run start:integrated`. Host-provided PORT is public web listener (0.0.0.0); API_PORT defaults3001 on loopback only. Ports must differ. The wrapper waits for API health, stops the other process when either exits, and forwards termination. For local tests use WEB_HOST=127.0.0.1. API semantics are unchanged.

Leave VITE_API_BASE_URL unset for same-origin /api proxy. It is build-time, not runtime. A separate-origin API needs deliberate HTTPS/CORS/privacy configuration. Direct /detail/ID refresh serves SPA; /api failures remain JSON, not index.html.

SQLite stores credentials, case text and evidence blobs. DB_PATH must use an existing writable directory. Free ephemeral filesystem loses data on restart/redeploy and is suitable only for a clearly labelled synthetic demo with user acceptance. Durable hosting/disk costs and backup route must be verified and approved before provisioning; nothing paid is authorized by these instructions. Do not put actual citizen data in the public prototype.

DEMO_MODE and DEMO_ROUTES are off by default. Enabling them creates publicly-known synthetic accounts/routes; never imply real staff verification. AI model is not bundled/downloaded by build. Detector unavailable is not authenticity proof; no auto-rejection. No SMS/email/municipal delivery.

Before sharing any live site: verify HTTPS URL and deployed branch SHA; deep-link refresh, login/signup, canonical create/replay, private evidence denial, repair review, sign-out, mobile UI; determine restart behavior and database persistence. Record actual limitations and rollback path. Avoid main merge; deploy frontend-integration only.
