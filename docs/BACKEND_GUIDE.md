# SafariDesk backend and Africa's Talking setup

The production-shaped local stack is **Next.js frontend → Python FastAPI API → PostgreSQL**.
Africa's Talking callbacks use the same public ngrok URL as the website; Next.js
rewrites API and callback paths to FastAPI. Mock Service Worker, demo accounts,
mock API handlers, and the old Express server have been removed. PostgreSQL is
required; the API fails at startup if it is unavailable.

## 1. Start PostgreSQL and the API (Windows PowerShell)

First run only, copy the template and configure the administrator and AT
credentials. Keep `backend/.env` private; it is ignored by Git.

```powershell
cd C:\Users\Administrator\Desktop\SafariDesk\backend
Copy-Item .env.example .env
notepad .env

py -3.14 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\scripts\prepare-postgres.ps1
```

`prepare-postgres.ps1` starts the local Docker PostgreSQL container on
`127.0.0.1:5432`, creates an application role and a separate read-only MCP role,
and writes random local DB passwords/connection URLs into `.env`. It does not
print those passwords. The persistent Docker volume is named
`safaridesk_pgdata_v18`.

In PowerShell window 1, start the API:

```powershell
cd C:\Users\Administrator\Desktop\SafariDesk\backend
.\.venv\Scripts\python.exe -m uvicorn safaridesk.main:socket_app --host 127.0.0.1 --port 3001 --reload --no-access-log
```

The first start applies SQL migrations and bootstraps the one administrator
configured by `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `ADMIN_NAME`. It seeds no
other accounts or business data. Check `http://127.0.0.1:3001/health`; a healthy
response contains `"database":"postgresql"` and `"mockData":false`.

## 2. Start the frontend

In PowerShell window 2:

```powershell
cd C:\Users\Administrator\Desktop\SafariDesk\frontend
npm.cmd install
$env:BACKEND_URL = "http://127.0.0.1:3001"
$env:NEXT_PUBLIC_API_URL = ""
$env:NEXT_PUBLIC_SOCKET_URL = "http://127.0.0.1:3001"
npm.cmd run dev
```

Open `http://localhost:3002/sign-in`. The frontend uses the Python API for all
API requests; no `NEXT_PUBLIC_USE_MOCKS` switch or mock login exists. Sign in
with the configured admin. If port 3002 is busy, stop the other frontend or
change `frontend/package.json`'s dev port and update the callback/tunnel setup.

## 3. Africa's Talking Sandbox settings

Use your **Sandbox** username and API key from the Africa's Talking Sandbox
application. The username is `sandbox`; the live API key is not interchangeable.
The API omits the `from` field for sandbox requests, avoiding sender-ID rejection
(including the previous 402 `InvalidSenderId`) even if `AT_SENDER_ID` is set in
the environment. A sender ID is only sent for a non-sandbox username when
configured.

Set these values in `backend/.env`:

| Setting | Value/purpose |
|---|---|
| `AT_USERNAME` | `sandbox` while testing |
| `AT_API_KEY` | Sandbox API key (never commit it) |
| `AT_SENDER_ID` | Leave empty in Sandbox |
| `AT_TEST_PHONE` | Your test recipient in Kenyan format |
| `AT_ALLOWED_PHONES` | Optional comma-separated allowlist; include the test number if set |
| `AT_USSD_SERVICE_CODE` | The service code configured for your Sandbox USSD application; quote `#` values |
| `WEBHOOK_TOKEN` | Random URL-safe secret with at least 32 bytes of entropy |
| `PUBLIC_BASE_URL` | Current ngrok HTTPS origin, without a trailing slash |
| `PUBLIC_APP_URL` | Same public origin, used in SMS links |

Leave the service code quoted if it contains `#`, e.g. `AT_USSD_SERVICE_CODE="*123#"`.
For a test allowlist, an entry can be `+2547...`, `2547...`, or `07...`; all are
normalized before comparison. If `AT_ALLOWED_PHONES` is empty there is no
number allowlist, so setting it is recommended for testing.

Create a token locally (do not paste it into chat or source control):

```powershell
py -c "import secrets; print(secrets.token_urlsafe(32))"
```

## 4. Expose the site and API through ngrok

Keep the frontend and API running. In PowerShell window 3:

```powershell
cd C:\Users\Administrator\Desktop\SafariDesk\backend
.\scripts\start-ngrok.ps1
```

The script forwards ngrok to **Next.js on port 3002**. Next rewrites `/api/*`,
`/ussd`, and `/webhook/incoming` to FastAPI on port 3001. Copy the current
`https://…` forwarding origin into both `PUBLIC_BASE_URL` and `PUBLIC_APP_URL`
in `backend/.env`, then restart the API so it loads the updated settings. If
ngrok issues a new URL after restart, update `.env` and the Africa's Talking
callback URLs again. The Next.js development config allows HMR from
`*.ngrok-free.dev`; this is enabled only when running `next dev`.

In the Africa's Talking Sandbox app, configure POST, URL-encoded callbacks:

```text
USSD:              https://<ngrok-host>/api/webhooks/africastalking/ussd?token=<WEBHOOK_TOKEN>
Incoming SMS:      https://<ngrok-host>/webhook/incoming?token=<WEBHOOK_TOKEN>
SMS delivery:      https://<ngrok-host>/api/webhooks/africastalking/sms-status?token=<WEBHOOK_TOKEN>
```

Replace placeholders locally; do not check the real callback token into source
control. All three callbacks require the query token. The ngrok tunnel forwards
requests without injecting authentication headers. The USSD route also checks
the configured service code and an allowlisted phone when an allowlist is set.
Uvicorn redacts callback query strings from access logs, and Next.js dev logging
ignores callback requests, so the shared token is not copied into routine logs.
After rotating `WEBHOOK_TOKEN`, update all callback URLs in the Africa's Talking
Sandbox app before testing again.

To print the current callback URLs on your own terminal after a token or ngrok
URL change, run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\show-at-callbacks.ps1
```

The output contains the webhook secret. Paste each URL into the matching
Sandbox callback setting; do not paste the output into chat or screenshots.

## 5. Verify SMS from the website and Sandbox

1. Open `http://localhost:3002/users` and sign in as the configured admin.
2. Click **Invite staff**, enter a test email, staff role, and the number from
   `AT_TEST_PHONE`, then submit.
3. The UI reports whether Africa's Talking accepted the message. The API's
   Sandbox response `providerStatusCode: 101` means Africa's Talking marked it
   sent to the Sandbox simulator; it does not mean a handset received it.
4. Open the Africa's Talking Sandbox SMS simulator/inbox and check the message
   there. Sandbox SMS is displayed in the simulator rather than delivered to a
   real phone. The invite itself is stored in PostgreSQL even if sending fails;
   the UI must say that no SMS was sent when the provider rejects it.

SMS is also sent for staff invitations/resets and other configured
notifications when a phone number is present. `AT_SENDER_ID` is intentionally
omitted in Sandbox. The backend keeps provider HTTP status and AT recipient
status in the response so a rejection can be diagnosed instead of shown as a
false success.

Latest website check (26 Nov 2026): Playwright submitted one staff invite to
the configured allowlisted Sandbox number. The invite API returned HTTP 201;
Africa's Talking returned HTTP 201, recipient status `Success`, and code `101`
(no `402` sender rejection). The invite SMS then appeared in the Africa's
Talking simulator's Messages inbox. The Sandbox Outbox and our delivery-report
record later showed `Failed` / `DeliveryFailure` for the same test recipient.
Those observations conflict: the message was visible in the simulator, while
the final delivery report says delivery failed. Treat the simulator inbox as
proof that the SMS content reached the Sandbox simulator, but do not treat this
as proof of handset delivery or as a successful final delivery receipt. Africa's
Talking documents `DeliveryFailure` in Sandbox as the simulator being logged
out or unreachable; see its [delivery failure
guide](https://help.africastalking.com/en/articles/742491-why-did-my-messages-fail).
The one-time test invite row was removed from PostgreSQL after checking the
message; the SMS delivery audit row remains.

## 6. Verify USSD

In Africa's Talking Sandbox USSD simulator, select the configured USSD service
code and an allowed Kenyan test number. Expected menu:

```text
CON SafariDesk
1. Browse safari options
2. Booking help
0. Exit
```

Reply `1`, `2`, or `0` to complete a menu path. The API stores the session state
in PostgreSQL; `1` responds with the public `/parks` link and `2` returns the
booking-help message. Verified on 26 Nov 2026 through the Africa's Talking
simulator using the configured Sandbox service code: the menu appeared and
reply `1` returned the SafariDesk parks link. If the simulator says the service
is unavailable, check the configured service code, callback URL, test number
allowlist, and that the local servers and ngrok tunnel are running.

The public ngrok callback can also be checked without the simulator by POSTing
URL-encoded `sessionId`, `serviceCode`, `phoneNumber`, and `text` fields to the
USSD URL above. Start with blank `text`, then post the same `sessionId` with
`text=1`. It should return HTTP 200 and then an `END` response. Do not include
the webhook token in screenshots or logs.

For a guarded repeatable public round-trip, run this only after approving the
transfer of `WEBHOOK_TOKEN` and `AT_TEST_PHONE` through ngrok:

```powershell
.\.venv\Scripts\python.exe scripts/verify_public_ussd.py --confirm-secrets-through-ngrok
```

The script reads values from `backend/.env`, prints only statuses and response
types, sends an initial menu request followed by reply `1`, and posts a fake
delivery report for a nonexistent message ID. It verifies the public
application routes, not callbacks originating from Africa's Talking.

Local authenticated callback smoke check (does not send data outside localhost):

```powershell
cd C:\Users\Administrator\Desktop\SafariDesk\backend
.\.venv\Scripts\python.exe scripts/verify_local_callbacks.py
```

It verifies PostgreSQL health, a `CON` then `END` USSD session, 401 for
unauthenticated USSD and header-only delivery reports, and 200 for a delivery
report with the query token. The public route protection check sends no
credentials or phone number and should return 401:

```powershell
.\.venv\Scripts\python.exe scripts/verify_public_route_protection.py
```

The callback URLs were saved in the Sandbox and read back against the generated
local URLs. The USSD simulator test above exercises an Africa's Talking-originated
session. An inbound SMS initiated from the simulator has not been separately
verified; the website invite flow verifies outbound SMS.

## 7. PostgreSQL MCP

The workspace MCP configuration is `.vscode/mcp.json`. `safaridesk-postgres`
starts `backend/scripts/start-postgres-mcp.ps1` and connects with the dedicated
`safaridesk_mcp` role, which has read-only database access. To install the MCP
package if it is absent:

```powershell
cd C:\Users\Administrator\Desktop\SafariDesk\backend
npm.cmd install --prefix mcp
```

Reload the MCP server in the editor and connect to `safaridesk-postgres`. The
MCP service queries the same `safaridesk` PostgreSQL database as the API; its
role cannot insert, update, delete, or alter schema.

MCP verification (26 Nov 2026): started the configured server, listed the
`safaridesk_local` profile, connected to `safaridesk`, and ran a read-only query.
It reported database `safaridesk`, role `safaridesk_mcp`, and 203 visible tables.

## 8. Automated checks and observed verification

Run from the repository root:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest tests_python -q

cd ..\frontend
npm.cmd run typecheck
npm.cmd run build
```

The Python suite covers auth, permissions, business API contracts, SMS
provider response handling, callback authentication, and USSD sessions. It
uses a mocked provider transport and does not send SMS. Browser verification
with Playwright confirmed sign-in, PostgreSQL-backed page data, navigation across
the authenticated pages, and one staff invitation. Africa's Talking accepted
the invite request with HTTP 201 and recipient status `Success` / code `101`; no
402 sender error occurred. The invite text appeared in the Sandbox simulator's
Messages inbox. The Outbox and persisted DLR later reported `Failed` /
`DeliveryFailure` for that recipient, so the simulator observation and final
provider status conflict. The Sandbox test confirms the invitation content can
appear in the simulator; it does not establish delivery to a real handset.
Africa's Talking documents `101` as initial provider acceptance and
`DeliveryFailure` as an async final failure, which in Sandbox can happen when
the simulator is logged out or unreachable. See [Sandbox setup and simulator
behavior](https://help.africastalking.com/en/articles/1170660-how-do-i-get-started-on-the-africa-s-talking-sandbox),
[Sandbox vs. live](https://help.africastalking.com/en/articles/2189460-what-are-the-sandbox-and-the-live-environments),
[SMS delivery failure reasons](https://help.africastalking.com/en/articles/742491-why-did-my-messages-fail),
and [SMS status codes](https://help.africastalking.com/en/articles/16150386-messaging-error-codes).

Checks run for this migration: Python `pytest` (29 passed), frontend
`npm.cmd run lint`, `npm.cmd run typecheck`, and `npm.cmd run build` all passed.

Playwright loaded all eleven signed-in routes (`/dashboard`, `/bookings`,
`/bookings/new`, `/dispatch`, `/payments`, `/alerts`, `/rates`, `/feedback`,
`/users`, `/driver`, `/my-trips`) without a loading or view-not-found state;
the API requests observed for those views returned HTTP 200. Ngrok MCP confirmed
the public endpoint forwarded to port 3002 with no traffic policy. Public
unauthenticated USSD and delivery-report requests returned 401. The authenticated
public route round-trip passed the guarded check below. The Sandbox callback
settings were read back, and the provider simulator completed the USSD menu flow.

Public-route recheck (26 Nov 2026): Playwright's fresh browser context first
showed ngrok's free-tier `ERR_NGROK_6024` visit warning. After clicking **Visit
Site**, the public sign-in page rendered with zero console errors. A token-free
POST to the public USSD callback returned HTTP 401 and `END Invalid callback
authentication`, confirming that ngrok -> Next.js -> FastAPI reaches the callback
route and no longer returns 404. No callback token or test phone was sent in
this check. The interstitial applies to browser GETs; Africa's Talking callbacks
are POST requests.

Authenticated public USSD recheck (26 Nov 2026): the guarded script sent the
configured test phone and webhook token through ngrok. The initial menu returned
HTTP 200 with `CON`; replying `1` returned HTTP 200 with `END`; the SMS delivery
report route returned HTTP 200 for a fake, nonexistent message ID. Neither secret
value was printed. This confirms the public callback round-trip. The actual
Sandbox USSD simulator also invoked the saved callback and rendered its menu;
reply `1` returned the parks link. The saved USSD, outgoing SMS delivery, and
incoming SMS callback URLs were read back and matched the local configuration.

## Troubleshooting

| Symptom | Check |
|---|---|
| API says Postgres unavailable | `docker ps`; run `scripts/prepare-postgres.ps1`; confirm `.env` `DATABASE_URL` |
| Browser stuck at “Checking your session” | API must be healthy on 3001; frontend `BACKEND_URL` must target it; inspect browser Network for `/api/auth/me` |
| SMS says `402` / `InvalidSenderId` | Ensure `AT_USERNAME=sandbox` and use the Sandbox key; the Sandbox code omits the sender field. Restart the API |
| SMS says provider rejected it | Check the returned HTTP status and provider status code, Sandbox API key, allowed recipient, and Sandbox balance/limits |
| Invite says SMS accepted but no handset message | Check the Africa's Talking Sandbox simulator inbox; Sandbox does not deliver to a phone |
| USSD or SMS report returns 401 | Check the callback URL query token matches `WEBHOOK_TOKEN` |
| USSD returns 403 | Check service code and `AT_ALLOWED_PHONES` |
| ngrok callback returns 404 | Confirm the ngrok endpoint forwards to port 3002 and that the frontend rewrites the callback path to port 3001 |
| Old process owns a port | `Get-NetTCPConnection -LocalPort 3001,3002 -State Listen` then inspect the owning PID before stopping it |
