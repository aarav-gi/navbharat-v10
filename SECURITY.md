# SECURITY.md

## Implemented

- **Passwords**: scrypt (N=16384, r=8, p=1, 64-byte output), unique random
  16-byte salt per password, timing-safe comparison. Never SHA-256, never a
  custom algorithm. See `src/auth/password.js`.
- **Sessions**: 256-bit random token in an `httpOnly`, `SameSite=Strict`,
  signed cookie (`Secure` in production). Only the SHA-256 hash of the token
  is stored server-side. Sessions rotate on every successful login, expire
  after 8 hours absolute / 30 minutes idle, and can be invalidated on logout.
- **CSRF**: double-submit cookie pattern on every state-changing admin
  request, verified with a timing-safe comparison.
- **RBAC**: 9 roles, 15 granular permissions, enforced in route middleware
  (`src/auth/rbac.js`) — never only in the UI.
- **Secret admin entry**: the admin path segment comes from
  `ADMIN_SECRET_SLUG` in the environment, validated as a URL-safe opaque
  string. Anything under `/admin` that isn't the configured secret path
  receives the same generic redirect a nonexistent route would, so probing
  can't confirm the admin panel exists. This is a defense-in-depth layer,
  **not** a substitute for authentication — real auth still gates every
  admin action even if someone finds the path.
- **Headers**: CSP, `X-Content-Type-Options: nosniff`, `X-Frame-Options:
  SAMEORIGIN`, `Referrer-Policy`, `Permissions-Policy`,
  `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`, HSTS in
  production.
- **Rate limiting**: separate policies for login (8/15min), admin actions
  (200/min), and public browsing (120/min), all logged to
  `security_events` on trip.
- **Input handling**: prototype-pollution keys (`__proto__`, `constructor`,
  `prototype`) are stripped from body/query/params before they reach any
  handler. Body size capped at 2MB.
- **Audit logging**: every login attempt (success/failure/lockout), post
  create/edit/publish/delete/approve/reject, and settings/ads change is
  recorded with the acting user, action, entity, and a hashed IP — visible
  in-app under Audit & Security Log.
- **Account lockout**: exponential backoff lockout after 4 failed logins
  (doubling minutes, capped at 60), tracked per account.
- **Login timing**: a failed lookup for a non-existent username still runs a
  dummy password verification so response timing doesn't reveal which
  usernames exist.

## Known limitations / next steps

- **No MFA yet.** `users.mfa_enabled` / `users.mfa_secret` columns exist but
  no TOTP or WebAuthn flow is wired up. Don't set `mfa_enabled = 1` — it's
  not read anywhere yet.
- **CSP allows `'unsafe-inline'`** for styles and Tailwind's CDN script,
  because the current templates load Tailwind via its CDN build and use
  inline `<style>`/`style=""` in a few places. Tightening this requires
  moving to a compiled Tailwind stylesheet — recommended before a serious
  production launch.
- **Single-process session cleanup.** Expired sessions are swept every 15
  minutes via `setInterval`. Fine for one instance; if you scale to multiple
  processes/containers, move this to a proper cron/worker instead so it
  doesn't run redundantly in every process (harmless, just wasteful).
- **No WAF-grade bot/abuse detection.** Rate limiting covers volumetric
  abuse; there's no behavioral bot-detection layer yet (Phase 13 from the
  original brief).
- **File uploads aren't implemented in this pass** (no media module yet), so
  there's nothing to validate there — but when that module is built, treat
  Phase 29 of the original brief (MIME/extension validation, quarantine,
  never trusting original filenames) as required, not optional.
- **This build has not been run as a live server** in the environment it was
  built in (no npm registry access there). Run `npm install && npm start`
  in your own environment and verify before deploying.

## Reporting

If you find a vulnerability in your deployment of this app, treat it the
same as you would any other production incident: rotate `COOKIE_SECRET` and
`ADMIN_SECRET_SLUG`, invalidate sessions (`DELETE FROM sessions;`), and
review `audit_logs` / `security_events` for the affected window before
resuming normal operation.
