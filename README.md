# SafariDesk

Safari & tour operations for Kenyan operators: quoting, M-Pesa payments, driver
dispatch and safety alerts — one dashboard.

**Stack:** Next.js (App Router) + React + TypeScript + Tailwind v4 + shadcn/ui +
TanStack Query/Zustand + Recharts · FastAPI concierge/AI service · Express API with
cookie auth + RBAC (Phase 7–8) · MSW mocks until the domain backend runs.

## Quick start

```bash
# Frontend (mocks on by default)
cd frontend && npm install && npm run dev        # http://localhost:3000

# Backend API (auth/RBAC; domain routes are mocked)
cd backend && npm install
ADMIN_EMAIL=admin@safaridesk.app ADMIN_PASSWORD=password123 npm run dev   # :3001
npm test                                          # vitest + supertest

# Same backend on Postgres
DATABASE_URL=postgres://… npm run migrate
npm run seed:demo                                 # one demo user per role
TEST_DATABASE_URL=postgres://… npm test           # also runs tests/pg.test.ts

# AI service (Python)
cd ai && python -m uvicorn app:app --reload       # see ai/README
```

Point the frontend at the real API: `NEXT_PUBLIC_USE_MOCKS=false`
`BACKEND_URL=http://127.0.0.1:3001` (same-origin `/api/*` rewrite).

### Demo credentials (dev only)

Password `password123` for all of these; staff sign-ups stay pending until an
admin approves them on **Users → Pending requests**.

| Role | Email | Lands on |
|---|---|---|
| admin / super_admin | `admin@safaridesk.app` (super_admin via invite) | `/dashboard` |
| operations / dispatcher | `ops@safaridesk.app` | `/dispatch` |
| finance | `finance@safaridesk.app` | `/payments` |
| agent | `agent@safaridesk.app` | `/bookings` |
| driver | `driver@safaridesk.app` | `/driver` |
| customer | `amina@example.com` | `/my-trips` |

## Layout

```
frontend/   Next.js app: marketing site, auth pages, operator dashboard (RBAC)
backend/    Express auth/RBAC API + migrations + tests
ai/         Python (FastAPI) concierge + booking parser services
docs/       FRONTEND_GUIDE.md · BACKEND_GUIDE.md · DATABASE_GUIDE.md + source PDFs
```

## Tests & checks

```bash
cd frontend && npm run lint      # palette contrast contracts + tsc
cd backend && npm test            # auth + rbac + permissions sync
```
