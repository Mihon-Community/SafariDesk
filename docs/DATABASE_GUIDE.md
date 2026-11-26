# SafariDesk PostgreSQL guide

The Python API and PostgreSQL MCP server use the same local PostgreSQL 18
database (`safaridesk`). There is no memory store or mock database. Startup
migrations seed only the fixed public destination directory, not demo business
transactions.

## Local database

See [`BACKEND_GUIDE.md`](BACKEND_GUIDE.md) for the PowerShell setup. The
`backend/scripts/prepare-postgres.ps1` script starts Docker Compose, creates
separate application and read-only MCP roles, and fills missing DB credentials
in the ignored `backend/.env`. PostgreSQL binds to `127.0.0.1:5432`; its data is
kept in the Docker volume `safaridesk_pgdata_v18`.

The backend reads `DATABASE_URL` as the application role. The MCP launcher reads
`MCP_DATABASE_URL` as `safaridesk_mcp`, whose grants allow inspection and SELECT
queries without data or schema mutation.

## Tables

`001_core.sql` creates auth/session/audit tables: `users`, `refresh_tokens`,
`password_resets`, `invites`, `audit_log`, and migration bookkeeping.
`002_business.sql` creates `business_records`, a JSONB-backed table used by the
API for booking, fleet, rates, payments, alerts, analytics and other resource
collections. `003_africastalking.sql` creates `sms_messages`, `sms_inbound`,
`sms_opt_outs`, and `ussd_sessions` for provider status, deduplication, opt-out,
and multi-turn USSD state. `004_destination_catalog.sql` inserts the initial
real-world park/reserve names used by Rates and the USSD destination menu.

Only the configured first administrator is created automatically. Migration
`004_destination_catalog.sql` adds four real destination names so the Rates page
and USSD are usable on first run; it adds no packages, prices, availability,
customers, drivers, bookings, or demo staff. Create operational records through
the admin UI or normal signup/invite workflows.

## Check the database

```powershell
cd C:\Users\Administrator\Desktop\SafariDesk\backend
docker compose ps
docker exec safaridesk-postgres pg_isready -U postgres -d safaridesk
```

The API health endpoint verifies an actual PostgreSQL connection:
`http://127.0.0.1:3001/health`.
