# SafariDesk frontend

SafariDesk's Next.js dashboard talks to the Python FastAPI backend. Mock
Service Worker data and demo logins have been removed.

## Run locally (Windows PowerShell)

Start PostgreSQL and the backend using [`docs/BACKEND_GUIDE.md`](../docs/BACKEND_GUIDE.md),
then in another PowerShell window:

```powershell
cd C:\Users\Administrator\Desktop\SafariDesk\frontend
npm.cmd install
$env:BACKEND_URL = "http://127.0.0.1:3001"
$env:NEXT_PUBLIC_API_URL = ""
$env:NEXT_PUBLIC_SOCKET_URL = "http://127.0.0.1:3001"
npm.cmd run dev
```

Open `http://localhost:3002/sign-in` and use the administrator configured in
`backend/.env`. Next.js proxies the same-origin `/api/*` and provider callback
routes to FastAPI so browser cookies remain same-origin.

## Checks

```powershell
npm.cmd run typecheck
npm.cmd run build
```

`npm.cmd run dev` uses port 3002. The backend listens on 3001; don't point
`BACKEND_URL` to the frontend port.
