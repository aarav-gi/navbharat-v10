# NavBharat Naukri — v2 (Security & Data Foundation)

This is a rebuild of the original Express/EJS project onto a modular
architecture with a real database, real authentication, and RBAC. It was
verified logic-by-logic in a sandboxed environment (schema, auth, sessions,
RBAC, posts CRUD, settings, analytics, and the legacy-data migration script
were all executed against real SQLite and passed) — but it has **not** been
run as a live HTTP server yet, since that requires `npm install`, which
needs network access this build environment didn't have. Do that first step
before anything else.

## 1. Setup

```bash
npm install
cp .env.example .env
```

Edit `.env` and set real values for `ADMIN_SECRET_SLUG` and `COOKIE_SECRET`
(the file tells you how to generate strong ones).

## 2. First run

```bash
npm start
```

On first boot the app creates `database/navbharat.sqlite3`, applies the
schema, and seeds the 9 roles and their permissions. The terminal will print
your admin entry URL (`http://localhost:3000/admin/<your-secret-slug>`).

## 3. Create your first admin user

```bash
npm run create-admin
```

You'll be prompted for a username, password, and role. No credentials are
ever hardcoded anywhere in this codebase.

## 4. Migrate your old data (optional, one-time)

If you have the old project's JSON files (`posts.json`, `pending_posts.json`,
`settings.json`, `analytics.json`), point the migration script at that
folder:

```bash
npm run migrate:legacy -- /path/to/old/navbharat-naukri/src/data
```

It takes a backup of the SQLite file first, only ever inserts (never
deletes), skips anything already migrated, and writes a JSON report next to
the database file so you can see exactly what happened.

## What changed from the old version — and why

| Area | Before | Now |
|---|---|---|
| Data store | Flat JSON files, rewritten whole-file on every save | SQLite, normalized tables, indexed, transactional revisions |
| Passwords | Plain SHA-256, no salt | scrypt (memory-hard, salted) — see `src/auth/password.js` |
| Sessions | Static string cookie (`'authenticated_session_verified'`) | Random 256-bit token, DB-backed, hashed at rest, rotates on login, idle + absolute timeout |
| Authorization | None (single hardcoded admin) | 9 roles, 15 granular permissions, enforced server-side on every route |
| CSRF | None | Double-submit cookie token on every state-changing form |
| Secret admin route | Hardcoded fallback in source | Required from environment, validated as URL-safe, generic redirect for anything else under `/admin` |
| Security headers | None | CSP, HSTS (prod), X-Frame-Options, Referrer-Policy, Permissions-Policy, COOP/CORP |
| Rate limiting | None | Named policies per surface (`LOGIN`, `ADMIN`, `PUBLIC_GENERAL`, `PASSWORD_RECOVERY`) |
| Audit trail | None | `audit_logs` + `security_events` tables, visible in the admin panel under **Audit & Security Log** |

## What this build does NOT include yet

The original brief (`ARCHITECTURE.md` / the 40-phase brief) asks for a full
enterprise platform. This pass covers the **security and data foundation**
(Phases 0, 4, 5, 7, 8, 9, 11, 12, 14, 15 partially, 30). Not yet built:

- MFA/WebAuthn (the `users` table has `mfa_enabled`/`mfa_secret` columns
  reserved, but no TOTP/passkey flow is implemented)
- Crawler pipeline integration + review-queue automation (the Python
  crawler scripts from the old project still exist standalone; they aren't
  wired into the new `posts` table or the approval workflow)
- Advanced search, typo tolerance, synonyms
- Trending algorithm
- SEO engine (structured data, sitemaps, canonical/OG tags, programmatic
  category pages)
- Caching layer
- Background job workers
- Automated security/performance test suites
- Organizations/States/Exams as first-class entities (currently just a
  `category` string + `organization` text field on `posts`)

Recommended order for the next pass: SEO engine + sitemaps (biggest ROI for
a jobs site), then search, then crawler integration, then MFA.

## Project layout

```
server.js                     composition root
src/config/                   env-driven config (secret slug, cookie secret, port)
src/database/                 schema.sql, connection.js (applies schema + seeds on boot)
src/auth/                     password hashing, sessions, RBAC middleware
src/security/                 headers, CSRF, rate limits, request sanitization
src/modules/                  posts / settings / analytics / users repositories
src/app/routes/               public.js, auth.js, admin.js
src/app/controllers/          request handlers
src/app/middleware/           audit logging, secret-admin gate
src/views/                    EJS templates (public + admin)
scripts/                      create-admin.js, migrate-legacy-data.js
database/                     SQLite file lives here (gitignored)
```

## Security notes

See `SECURITY.md` for the full rundown of what's implemented and known
limitations to be aware of before going to production.
