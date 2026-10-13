# Indian mobile OTP verification

Aadhaar is out of scope at the user's request. This feature verifies possession of a mobile number, not legal identity, complaint truth or citizenship. It attaches a verified number to an already logged-in claimed citizen account. It does not yet provide phone-only registration/login, account recovery or a safe claiming flow for unclaimed assisted reports.

## Local flow

- POST /api/phone/otp/request with bearer login and {phone,consent:true}. Accepts Indian 10-digit mobile numbers or +91 form, normalizes to +91 E.164.
- POST /api/phone/otp/verify with {challengeId,code}. Code is a string of 6 digits.
- GET /api/phone/status returns masked phone, real phoneVerified flag and verification timestamp.
- Cryptographic random code; HMAC-SHA256 digest stored, no plaintext OTP in DB. SMS mode needs a persistent private >=32-byte pepper.
- Expiry 5 minutes, max 5 wrong attempts, single-use, new request supersedes previous active challenges. Resend cooldown 60 seconds per account.
- 5 requests/hour per account, number and connection IP; 20 verification attempts/hour per account/IP. Counters are stored in SQLite, survive restarts, and do not trust X-Forwarded-For.
- Sender rejection/errors and a 15-second response timeout fail closed. A timed-out provider may still deliver a late SMS, but its challenge is unusable. Provider acceptance is NOT proof of delivery; real flag changes only after the correct code is consumed.
- Verified phone numbers are unique across accounts; number-change verification keeps old verified number until new verification succeeds. Numbers/OTP challenge rows are private database data, never public complaint fields.
- Rate data older than one hour and challenge rows older than expiry+24 hours are cleaned on OTP operations. This is local abuse protection, not a complete public-service fraud shield.

## Modes

Default PHONE_OTP_MODE=disabled returns 503, no SMS.

PHONE_OTP_MODE=dev writes random codes to the LOCAL SERVER CONSOLE only. Codes are not returned in API responses and successful dev tests NEVER write a phone or set phoneVerified=true. Console codes are development data only; do not deploy this mode publicly or mislabel it as mobile verification.

PHONE_OTP_MODE=sms requires PHONE_OTP_PEPPER and PHONE_OTP_SENDER_MODULE. The latter is an operator-selected local CommonJS adapter exporting async send({to,code,expiresSeconds,challengeId}). It must return {accepted:true} only after the provider accepts the submission. It must use an approved transactional template and no secret logging. Never inject a mock adapter in a real deployment. Credentials belong in a server secret manager/environment, never this repository. No provider adapter credentials/account were created and no real SMS was sent in this task.

Before activating SMS: choose provider/route, confirm current charges and India availability, register the required sender/template/entity for domestic DLT routes, fund/approve any spending, provision server secrets securely, implement and review adapter error/timeout handling, test only consenting controlled recipients, then test delivery and real flag end-to-end. Add frontend OTP screens and public-service CAPTCHA/abuse/monitoring controls separately.

## Provider findings checked 13 October 2026

1. Firebase: official limits say verification SMS is Blaze-only; pricing says phone auth is billed per SMS. Fictional test numbers are useful for development, not real verification. Not a free production SMS path. Firebase Phone Auth is managed challenge/verification, not a simple sender for this local generated-code interface; selecting it requires a separate server ID-token validation integration.
   https://firebase.google.com/docs/auth/limits
   https://firebase.google.com/pricing

2. Twilio: official trial documentation currently describes 30 days, 100 SMS units and 40 successful Verify units. Up to 5 preverified recipients, sign-up-country restriction, selected-country eligibility, provider test templates only. India is listed in the current supported trial countries, but specific signup eligibility and actual delivery still require checking; not promised here. This is a limited pilot, not free unlimited service. Twilio Verify generates/checks its own OTP, so integrating Verify needs a managed-provider challenge/check adapter, not pretending its code is this local code. Custom sender SMS generally requires a suitable non-trial messaging path.
   https://www.twilio.com/docs/usage/trials
   https://www.twilio.com/docs/usage/trials/try-out-verify

3. Twilio India route guidance: international gateway has no DLT registration per Twilio and uses ILDO short codes. Domestic gateway needs company/Sender ID DLT registration before Twilio submission. Approved DLT use case/templates and sender requirements depend on route; confirm the exact chosen product before launch. No claim that every international provider/product is exempt.
   https://www.twilio.com/en-us/guidelines/in/sms

4. Supabase: phone authentication requires a separate SMS provider (examples include Twilio, MessageBird, Vonage, TextLocal). Its docs flag SMS costs and India's TRAI DLT rules. A free auth plan is not free delivered SMS.
   https://supabase.com/docs/guides/auth/phone-login
   https://supabase.com/pricing

No verified unlimited free production Indian SMS path was found in these checked services. Choose a restricted consenting-number trial for a demo only if available, or a paid provider/domestic DLT path for real citizens. No provider setup is authorized merely by the local code or Git push approval.
