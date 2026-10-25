# Frontend integration tests
Node 22 or 24 is required by the backend. From repository root:

```
npm ci
npm --prefix frontend ci
npm --prefix frontend run build
npm --prefix frontend run test:integration
```

The integration tests use playwright-core and an installed Chrome/Chromium executable. Set CHROME_PATH to its absolute path. Default is /usr/bin/google-chrome-stable. No browser download or account login occurs. Ports 3001 and 4177 must be free. Each test starts a throwaway in-memory backend with explicit DEMO_MODE/DEMO_ROUTES, then kills it; it must never target a deployed database. Demo credentials are for synthetic local tests only. Tests require root dependencies (sharp, SQLite, backend server).

Test coverage includes date boundaries, session expiry/re-login, lost committed create response/reload/idempotent replay, same-tab text drafts, reviewer evidence decisions, public detail privacy, labelled mobile create/detail refresh. Test images are synthetic solid colors, not authenticity evaluations. Optional ONNX inference remains skipped when model weights are absent; these frontend tests do not enable/download it.

`npm --prefix frontend run test:hosting` checks integrated launcher health/deep-link/API404/SIGTERM, invalid/colliding port configuration, backend startup failure, web bind failure and absence of leftover API listeners. It does not certify every host's restart/signal/readiness behavior. The integration command also checks 105-report pagination, local cleanup failures after confirmed create, and failed queue load vs empty results.
