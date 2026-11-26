# SafariDesk Python API

The API runs on FastAPI and PostgreSQL. It provides cookie-based authentication,
role and permission checks, SafariDesk business resources, Socket.IO, and the
Africa's Talking SMS and USSD callbacks. The backend has no seeded/demo records
or in-memory fallback: PostgreSQL is required at startup.

For the full Windows setup, callback URLs, test results, and recovery steps, see
[`docs/BACKEND_GUIDE.md`](../docs/BACKEND_GUIDE.md).

## Local start (PowerShell)

```powershell
cd C:\Users\Administrator\Desktop\SafariDesk\backend

# First run only: copy .env.example to .env and fill ADMIN_EMAIL,
# ADMIN_PASSWORD, JWT_SECRET, Africa's Talking values, and WEBHOOK_TOKEN.
Copy-Item .env.example .env

py -3.14 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\scripts\prepare-postgres.ps1
.\.venv\Scripts\python.exe -m uvicorn safaridesk.main:socket_app --host 127.0.0.1 --port 3001 --reload --no-access-log
```

`prepare-postgres.ps1` starts the local PostgreSQL container and creates the
application and read-only MCP roles. It fills missing local database passwords
in the ignored `backend/.env`. Starting the API applies SQL migrations and
creates only the configured administrator. Stop it with Ctrl+C.

## Checks

```powershell
cd C:\Users\Administrator\Desktop\SafariDesk\backend
.\.venv\Scripts\python.exe -m pytest tests_python -q
```

Provider tests use a mocked HTTP transport; they do not send messages. Use the
live Sandbox check in `docs/BACKEND_GUIDE.md` for provider acceptance.
