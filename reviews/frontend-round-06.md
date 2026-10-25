# Frontend review 6 of 8
Reviewed a650f89 in existing Anveshna conversation.

Fixed verified outliving-session handlers: intake and failed-photo retries check identity generation between async steps and stop old-session UI updates. Started requests cannot be undone; unsent files stop. Manual case/queue mutations use immediate locks in addition to disabled busy buttons. Failed refresh explicitly marks old data stale, overview has refresh control.

Blocked storage no longer crashes API import/auth. Memory-only bearer fallback visibly disclosed; intake fails closed before sending unless recovery storage writes successfully. Corrupt pending record blocks new create rather than silently dropping ambiguous state.

Committed reproducible playwright-core dependency, test command and CHROME_PATH, Node/port/in-memory instructions. npm ci + integration suite passed (storage, actor isolation/exact replay, civic dates, session expiry, dropped committed response, drafts, reviewer/public privacy, labelled mobile create). lint/build clean. Browser binary is a documented prerequisite, not bundled.

npm audit found old Router advisories; updated frontend dependency to patched 7.18.2 and audit reports zero. Backend untouched; no detector enablement or authenticity claim.
