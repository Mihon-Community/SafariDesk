# SafariDesk frontend guide

SafariDesk's operator dashboard is a Next.js App Router application. It uses
the Python FastAPI backend for auth, business data, and provider callbacks;
MSW handlers and demo-account shortcuts have been removed.

## Run it

Start PostgreSQL and the Python API using [`BACKEND_GUIDE.md`](BACKEND_GUIDE.md),
then open another PowerShell window:

```powershell
cd C:\Users\Administrator\Desktop\SafariDesk\frontend
npm.cmd install
$env:BACKEND_URL = "http://127.0.0.1:3001"
$env:NEXT_PUBLIC_API_URL = ""
$env:NEXT_PUBLIC_SOCKET_URL = "http://127.0.0.1:3001"
npm.cmd run dev
```

Open `http://localhost:3002/sign-in` and sign in using the configured admin
credentials from `backend/.env`.

## API and cookies

The browser calls same-origin `/api/*` endpoints. Next rewrites those calls to
FastAPI using `BACKEND_URL`, preserving the HttpOnly auth cookies. Next also
rewrites `/ussd` and `/webhook/incoming` for Africa's Talking. The browser does
not call mock handlers. WebSocket/Socket.IO uses
`NEXT_PUBLIC_SOCKET_URL=http://127.0.0.1:3001` in local development.

Route authorization in `src/proxy.ts` is a UI convenience; the API also checks
permissions. Access and refresh credentials are HttpOnly cookies. The client
auth store keeps only the current user object.

## Checks

```powershell
npm.cmd run typecheck
npm.cmd run build
```

See [`BACKEND_GUIDE.md`](BACKEND_GUIDE.md) for full-stack, database, ngrok,
SMS/USSD, and integration test instructions.
