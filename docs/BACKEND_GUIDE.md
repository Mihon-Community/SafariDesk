# SafariDesk — Backend Guide

Express 5 + TypeScript API. Phase 7 added cookie-session auth; Phase 8 added RBAC and user
management. This guide supersedes the PDF version.

## Run & test

```bash
cd backend
npm install
ADMIN_EMAIL=admin@safaridesk.app ADMIN_PASSWORD=password123 npm run dev   # :3001
npm run typecheck && npm test      # vitest + supertest, memory store
```

Without `DATABASE_URL` the auth store is in-memory (resets on restart). With it, apply
`migrations/*.sql` in order against Postgres.

## Auth flow

```
sign-up ──► users(role=customer)                          (public, lowest role)
invite  ──► invites(token hash) ──email/SMS──► accept-invite ──► staff account

sign-in ──► verify bcrypt ──► access JWT (sd_access, 15m, Path=/)
                       └────► refresh token (sd_refresh, Path=/api/auth, sha256 at rest)

/api/* call ──401──► POST /auth/refresh ──► rotate in same family, old token revoked
                                   └──replayed old token──► revoke whole family (reuse)

sign-out ──► revoke session ──► clear both cookies
forgot ──► single-use reset token (hashed, 30 min) ──► reset-password ──► revoke all sessions
```

Refresh tokens are `randomBytes(32).toString("base64url")`, stored only as sha256 with a
`family_id`; the lookup for reuse detection must include **revoked** rows
(`findSessionIncludingRevoked`). Access tokens are stateless JWTs (`sub`, `role`,
`type:"access"`).

## Cookies & hardening

| Setting        | Value                                                                        |
| -------------- | ---------------------------------------------------------------------------- |
| `sd_access`  | `HttpOnly; SameSite=Lax; Secure` in prod; `Path=/`; ~15 min              |
| `sd_refresh` | same, but `Path=/api/auth`; 30 days, rotated on every use                  |
| helmet         | enabled                                                                      |
| CORS           | explicit allow-list (`CORS_ORIGINS`) with `credentials: true`            |
| Body cap       | 32 kb JSON                                                                   |
| Rate limit     | `/api/auth`, `AUTH_RATE_LIMIT`/min per IP (default 30)                   |
| Lockout        | `MAX_FAILED_ATTEMPTS` (5) ⇒ `LOCKOUT_MINUTES` (15) lock                 |
| Hashing        | bcrypt, `BCRYPT_ROUNDS` (12)                                               |
| Logging        | pino JSON; authorization/cookie/password/token redacted; audit row per event |

Never log tokens or passwords; `forgot-password` always answers `200 {ok:true}` so it
cannot enumerate accounts.

## RBAC middleware

```ts
router.get("/", requireAuth(service), requirePermission("users:read"), handler);
router.patch("/:id", requireAuth(service), requirePermission("users:manage"), handler);
```

`requireAuth` populates `req.user`; a missing permission responds
`403 {"error":"Missing permission users:manage.","code":"FORBIDDEN"}`.

### Permissions table

| Permission                        | super_admin | admin   | operations | dispatcher | finance | agent   | driver    | customer |
| --------------------------------- | ----------- | ------- | ---------- | ---------- | ------- | ------- | --------- | -------- |
| bookings:read / write             | ✓          | ✓      | ✓ / ✓    | ✓ / –    | ✓ / – | ✓ / ✓ | ✓ / –   | ✓ / –  |
| dispatch:read / write             | ✓          | ✓      | ✓ / ✓    | ✓ / ✓    | – / – | – / – | ✓ / –   | – / –  |
| drivers / vehicles                | ✓          | ✓      | ✓         | ✓         | –      | –      | read      | –       |
| payments:read                     | ✓          | ✓      | ✓         | ✓         | ✓      | –      | –        | ✓       |
| payments:mark / refund            | ✓          | ✓      | –         | –         | ✓      | –      | –        | –       |
| rates:read / write                | ✓ / ✓     | ✓ / ✓ | –         | –         | ✓ / – | ✓ / – | –        | –       |
| feedback:read / write             | ✓ / ✓     | ✓ / ✓ | ✓ / –    | – / –    | ✓ / – | ✓ / ✓ | – / –   | – / ✓  |
| alerts:read / write               | ✓          | ✓      | ✓         | ✓         | –      | –      | –        | –       |
| reports:read                      | ✓          | ✓      | ✓         | –         | ✓      | –      | –        | –       |
| users:read / manage, invites:send | ✓          | ✓      | –         | –         | –      | –      | –        | –       |
| audit:read, settings:manage       | ✓          | –      | –         | –         | –      | –      | –        | –       |
| concierge:use, itinerary:read     | ✓          | ✓      | itinerary  | itinerary  | –      | ✓      | itinerary | ✓       |

The frontend mirror lives in `frontend/src/lib/permissions.ts`;
`backend/tests/permissions.sync.test.ts` imports both and fails on drift.

## Endpoints (all under `/api`)

### Auth

| Endpoint                       | Body                      | Success                                     | Errors                                            |
| ------------------------------ | ------------------------- | ------------------------------------------- | ------------------------------------------------- |
| `POST /auth/sign-up`         | `{name,email,password}` | `201 {user}`                              | 400 VALIDATION, 409 EMAIL_TAKEN                   |
| `POST /auth/sign-in`         | `{email,password}`      | `200 {user, expiresAt}` + cookies         | 401 BAD_CREDENTIALS, 423 LOCKED, 429 RATE_LIMITED |
| `POST /auth/refresh`         | — (cookie)               | `200 {user, expiresAt}` + rotated cookies | 401 INVALID_REFRESH, SESSION_REUSED               |
| `POST /auth/sign-out`        | —                        | `200 {ok:true}`, cookies cleared          | —                                                |
| `GET /auth/me`               | —                        | `200 {user}`                              | 401 UNAUTHENTICATED                               |
| `POST /auth/forgot-password` | `{email}`               | always `200 {ok:true}`                    | 429                                               |
| `POST /auth/reset-password`  | `{token,newPassword}`   | `200 {ok:true}`                           | 400 INVALID_TOKEN                                 |
| `POST /auth/invite`          | `{email,role}` (admin)  | `201 {ok:true}`                           | 403 FORBIDDEN                                     |
| `POST /auth/accept-invite`   | `{token,name,password}` | `201 {user}`                              | 400 INVALID_INVITE                                |

### Users (RBAC)

| Endpoint                           | Guard            | Body → response                                                                                                     |
| ---------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------- |
| `GET /users`                     | `users:read`   | `{users:[{id,name,email,role,status,lastLoginAt,createdAt}]}`                                                      |
| `PATCH /users/:id`               | `users:manage` | `{role?,status?}` → `{user}`; self-change refused (400 CANNOT_*), super_admin grant → 403 SUPER_ADMIN_REQUIRED |
| `POST /users/:id/password-reset` | `users:manage` | issues a single-use link → `{ok:true}`                                                                            |

Sign-in example:

```bash
curl -c jar.txt -X POST http://127.0.0.1:3001/api/auth/sign-in \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@safaridesk.app","password":"password123"}'
curl -b jar.txt http://127.0.0.1:3001/api/auth/me
```

(On Windows pass a native path like `-c C:/…/jar.txt`: MSYS `/tmp/...` paths silently miss.)

## Tests

`tests/auth.test.ts` (15 cases: cookies, wrong password, lockout threshold, rotation +
replay reuse, sign-out clearing, duplicate sign-up, reset single-use, invite accept,
admin-only guard, rate limiting) and `tests/rbac.test.ts` (permission map, 403 body,
role/status updates, self-lockout, super-admin grant, reset). `tests/permissions.sync.test.ts`
keeps the frontend mirror honest. Suites raise `AUTH_RATE_LIMIT` and track the mutable
admin password between cases.
