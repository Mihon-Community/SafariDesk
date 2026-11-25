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
| `CORS_ORIGINS` | `http://localhost:3000,http://localhost:3002` | comma-separated |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | unset | seeds the first admin on boot |

The Next.js app proxies `/api/*` to this server when `BACKEND_URL` is set, so
cookies stay same-origin (see frontend `next.config.ts`).

## Africa's Talking (SMS first, USSD optional)

The backend uses the official `africastalking` Node SDK for outbound messages.
It can also receive incoming SMS, process `HELP`, `BOOK`, `STOP`, and `START`,
and accept delivery reports. `BOOK` currently sends a SafariDesk browsing link;
it does not create a booking. Auth SMS notifications are sent for password
resets, staff invitations, and staff request decisions when that account has a
phone number. USSD provides an informational menu and is optional.

Copy `.env.example` to `.env`, then set the credentials and URLs in your local
file. Keep `AT_USERNAME=sandbox` while developing. Do not put real credentials
in source control or paste them into support requests. Generate the webhook
token locally:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Set `WEBHOOK_TOKEN` to that output and `AT_TEST_PHONE` to your own Kenyan
E.164 number. `AT_ALLOWED_PHONES` can further restrict callback senders and
outbound recipients; it is a comma-separated list of `+254...` numbers. Leave
`AT_SENDER_ID` blank until your sender ID is registered. `PUBLIC_APP_URL`
builds links in SMS. For a public callback, set `PUBLIC_BASE_URL` to the HTTPS
origin ngrok gives you. `AT_USSD_SERVICE_CODE` is only needed when a USSD
service code has been provisioned for the account; quote the value in `.env`
because dotenv treats an unquoted `#` as a comment (for example,
`AT_USSD_SERVICE_CODE="*123#"`).

### Callbacks to configure in Africa's Talking

Use `POST` and URL-encoded form callbacks:

| Purpose | Callback URL |
|---|---|
| Incoming SMS | `PUBLIC_BASE_URL/webhook/incoming?token=WEBHOOK_TOKEN` |
| USSD | `PUBLIC_BASE_URL/ussd?token=WEBHOOK_TOKEN` |
| SMS delivery reports | `PUBLIC_BASE_URL/api/webhooks/africastalking/sms-status?token=WEBHOOK_TOKEN` |

Incoming SMS and USSD always use the query token. When using the tunnel helper
below, the delivery-report URL may omit the query token because ngrok injects
the header only on that API path; without that policy, include the query token
there too. Set the callback destinations in the matching Africa's Talking
product configuration. The receiving code requires an HTTPS public origin for
the tunnel, validates every field, limits body size and rate, stores callback
IDs before replying, and suppresses repeat replies when AT retries an SMS.

The preferred helper below forwards ngrok directly to the backend on port
3001. If you already have a separate agent forwarding to `localhost:8000`, you
can instead use this loopback bridge to pass only the three authenticated
callback paths through to the backend:

```powershell
cd C:\Users\Administrator\Desktop\SafariDesk\backend
npm run callback-bridge
```

Keep it and the backend running while AT sends callbacks. It binds only to
loopback and does not log callback URLs, query tokens, headers, or bodies.

Run the tunnel in a separate PowerShell window from the backend directory:

```powershell
cd C:\Users\Administrator\Desktop\SafariDesk\backend
.\scripts\start-ngrok.ps1
```

Install and authenticate the ngrok CLI first if `ngrok` is not on PATH. The
script reads `PUBLIC_BASE_URL` and `WEBHOOK_TOKEN` from `backend/.env`, writes a
temporary local policy file, and removes it when ngrok exits. It forwards to
port 3001. The policy's header action is limited to
`/api/webhooks/africastalking/`; it does not attach that header to other paths.

### Persistence, delivery and tests

With `DATABASE_URL`, run `npm run migrate` before starting the backend;
migration `007_africastalking.sql` adds phone fields and durable inbound SMS,
opt-out, USSD session, and delivery status records. Without Postgres these use
memory and reset on restart. Provider `Sent` means accepted for processing;
the delivery-report callback records the later handset outcome. Automated tests
mock the provider and never send real messages. Run `npm test` and
`npm run typecheck` from `backend`.

To run the frontend against this API rather than its default mock service,
start a second PowerShell window:

```powershell
cd C:\Users\Administrator\Desktop\SafariDesk\frontend
$env:NEXT_PUBLIC_USE_MOCKS = "false"
$env:BACKEND_URL = "http://localhost:3001"
npm run dev   # frontend listens on :3002
```

Africa's Talking must enable the SMS product and configure the callback URLs.
Two-way SMS and USSD shortcodes/service codes may require account approval or
provisioning. Sender IDs also require registration; see the
[Kenya sender ID setup guide](https://help.africastalking.com/en/articles/407085-how-do-i-set-up-my-sender-id-in-kenya-or-uganda).
