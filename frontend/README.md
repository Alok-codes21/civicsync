# Anveshan / CivicSync integrated frontend

This branch preserves the teammate interface and connects it to the existing Express/SQLite backend. It is a local prototype, not a live municipal service. Attribution is in `ATTRIBUTION.md`.

## Run locally

Use Node22 or24. From the repository root:

```sh
npm ci
npm run build:web
npm run start:integrated:ai
```

Open the web port printed by the launcher (default8080). The frontend uses same-origin `/api`; leave `VITE_API_BASE_URL` unset. The enabled-start command downloads/checks the pinned local ONNX weights if missing, then starts the integrated app. No paid API or image transfer to an AI service is used. Without setup, ordinary start reports the detector unavailable. `AI_DETECTOR=off` disables it.

Demo accounts/routes are off by default. Only for an isolated synthetic demonstration, explicitly set `DEMO_MODE=true DEMO_ROUTES=true`; public sample credentials are documented in the root README. Do not use real citizen data. Local data uses SQLite; review storage/backup and90-day retention behavior in the root README before use. For a quick disposable test set `DB_PATH=:memory:` (all data disappears when stopped).

## Verification and boundaries

- `TESTING.md`: browser/API checks and requirements.
- `INTEGRATION-COVERAGE.md` and `ENDPOINT-PARITY.md`: actual workflow coverage, exclusions, payload limits.
- `../docs/DETECTOR-VERIFICATION.md`: actual model execution evidence, not civic-photo accuracy validation.
- `DEPLOYMENT.md`: integrated hosting settings and unresolved persistence/login decisions. Deployment remains deferred, not complete.

The detector is an uncalibrated human-review signal. Real OTP/SMS/municipality/staff verification, account recovery, full Hindi UI and production certification are not supplied by this frontend.
