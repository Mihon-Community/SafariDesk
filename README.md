# SafariDesk

Safari and tour operations software for Kenyan operators: bookings, payments,
driver dispatch, guest safety, and Africa's Talking SMS/USSD.

## Stack

- Frontend: Next.js, React, TypeScript, Tailwind CSS.
- API: Python FastAPI with Socket.IO.
- Database: PostgreSQL; no mock data or in-memory fallback.
- Messaging: Africa's Talking Sandbox or production API.

## Start locally

Follow [`docs/BACKEND_GUIDE.md`](docs/BACKEND_GUIDE.md) for PostgreSQL, Python,
frontend, Africa's Talking callbacks, ngrok, MCP, and test instructions.

Typical local URLs:

- Frontend: `http://localhost:3002`
- Python API: `http://127.0.0.1:3001`
- PostgreSQL: `127.0.0.1:5432`
- Health check: `http://127.0.0.1:3001/health`

## Checks

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest tests_python -q

cd ..\frontend
npm.cmd run typecheck
npm.cmd run build
```
