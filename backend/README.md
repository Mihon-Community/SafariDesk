# SafariDesk API — auth service (Phase 7)

Express 5 + TypeScript authentication for the operator dashboard. Sessions use
**httpOnly cookies**: a 15-minute access JWT (`sd_access`, path `/`) and a
rotating refresh token (`sd_refresh`, path `/api/auth`).

## Run

```bash
cd backend
npm install
ADMIN_EMAIL=admin@safaridesk.app ADMIN_PASSWORD=password123 npm run dev   # :3001
```

Without `DATABASE_URL` the auth store is **in-memory** (resets on restart) so
local dev and tests need nothing else. Set `DATABASE_URL` to use Postgres with
the schema in `migrations/004_auth.sql`.

Tests: `npm test` (vitest + supertest, memory store, no DB required).

## Endpoints (mounted under `/api/auth`)

| Method & path | Purpose |
|---|---|
| `POST /sign-up` | zod-validated, bcrypt-hashed; public signup is always `customer` |
| `POST /sign-in` | verifies credentials, sets both cookies, returns `{user, expiresAt}` |
| `POST /refresh` | rotates the refresh token inside its family; reuse revokes the whole family |
| `POST /sign-out` | revokes the session, clears both cookies |
| `GET /me` | current user from the access cookie (or `Authorization: Bearer`) |
| `POST /forgot-password` | always `200 {ok:true}` (no account enumeration); issues a single-use token |
| `POST /reset-password` | consumes the token once, revokes all sessions |
| `POST /invite` | admin only; staff roles arrive by invite |
| `POST /accept-invite` | turns an invite into an active staff account |

## Security controls

- bcrypt cost from `BCRYPT_ROUNDS`; only password hashes at rest.
- Refresh tokens are random 256-bit values stored as sha256; replay detection
  revokes the token family.
- Lockout after `MAX_FAILED_ATTEMPTS` (5) failed sign-ins for `LOCKOUT_MINUTES`.
- Rate limit on `/api/auth` (`AUTH_RATE_LIMIT`, default 30/min per IP).
- helmet + CORS allow-list with credentials; JSON body capped at 32kb.
- pino logging with redaction of authorization/cookie/password/token fields;
  every auth event writes an `audit_log` row.

## Environment

| Variable | Default | Notes |
|---|---|---|
| `PORT` | `3001` | |
| `DATABASE_URL` | unset | unset ⇒ memory store |
| `JWT_SECRET` | dev placeholder | set in production |
| `ACCESS_TTL_SECONDS` | `900` | 15 minutes |
| `REFRESH_TTL_SECONDS` | `2592000` | 30 days |
| `COOKIE_SECURE` | `false` | `true` in production (HTTPS) |
| `CORS_ORIGINS` | `http://localhost:3000` | comma-separated |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | unset | seeds the first admin on boot |

The Next.js app proxies `/api/*` to this server when `BACKEND_URL` is set, so
cookies stay same-origin (see frontend `next.config.ts`).
