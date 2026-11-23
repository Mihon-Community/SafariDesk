# SafariDesk — Operator Dashboard (frontend)

React admin dashboard for SafariDesk. Guests and drivers never see it: they use
USSD, SMS and Voice. The dashboard makes a booking visible from quote to payment
to dispatch, and keeps the two high-risk actions (assigning a driver, sending a
safety alert) hard to get wrong.

## Stack

| Concern        | Choice                                            |
| -------------- | ------------------------------------------------- |
| App            | React 18 + Vite + TypeScript (no SSR, not Next.js) |
| Routing        | React Router with a protected-route wrapper       |
| Server data    | TanStack Query only — never copied into Zustand   |
| UI state       | Zustand: auth token + tiny UI state               |
| Styling        | Tailwind CSS v4 + shadcn/ui (Radix primitives)    |
| Charts         | Recharts                                          |
| Live updates   | Socket.IO client                                  |
| Forms          | react-hook-form + Zod (`@hookform/resolvers`)     |
| Toasts         | sonner                                            |

## Run it

```bash
cd frontend
npm install

# Backend-free development against MSW mock handlers (seeded demo data):
npm run dev            # uses .env -> VITE_USE_MOCKS=true

# Against the real Express backend (http://localhost:3000):
VITE_USE_MOCKS=false npm run dev
```

`vite dev` proxies `/api` and `/socket.io` (with websockets) to
`VITE_PROXY_TARGET`, default `http://localhost:3000`.

### Scripts

| Script               | Purpose                                        |
| -------------------- | ---------------------------------------------- |
| `npm run dev`        | Dev server on :5173 with API/socket proxy      |
| `npm run build`      | Type-check, then production build into `dist/` |
| `npm run preview`    | Preview the production build                   |
| `npm run typecheck`  | `tsc --noEmit`                                 |
| `npm run mocks`      | Copy the MSW service worker into `public/`     |

## Environment

Copy `.env.example` to `.env` for local development.

| Variable             | Meaning                                                       |
| -------------------- | ------------------------------------------------------------- |
| `VITE_API_URL`       | API origin. Empty = same origin (proxy in dev, backend in prod) |
| `VITE_USE_MOCKS`     | `true` runs MSW handlers instead of a backend (dev only)      |
| `VITE_PROXY_TARGET`  | Dev proxy target for `/api` and `/socket.io` (default :3000)  |

Production: the Vite build output is served by the Express container at `/`.
Builds must be made with `VITE_USE_MOCKS=false` (or unset).

## Structure

```
src/
  main.tsx            app bootstrap: MSW (optional), QueryClient, Router
  App.tsx             renders routes
  routes.tsx          route table + RequireAuth guard
  lib/                api.ts (JWT client + ApiError), socket.ts (event names),
                      types.ts (shared API contract), format.ts, cn.ts
  store/auth.ts       token + user in localStorage (Zustand)
  hooks/              useBookings, useQuote (debounced live quote),
                      useRealtime (socket -> query invalidation + toasts),
                      useDrivers, usePayments
  components/
    ui/               shadcn/ui primitives (button, card, dialog, select,
                      table, tabs, badge, skeleton, input, textarea, label, alert)
    Layout.tsx        sidebar shell, mobile drawer, Toaster, useRealtime()
    StatusBadge.tsx   one colour per booking status
    Money.tsx         single KES formatter
    ConflictAlert.tsx HTTP 409 assignment conflict with the clashing booking
    PhoneInput.tsx    accepts 07../+254.., reports +254 E.164
    States.tsx        skeleton / error / empty states
  pages/              Login, Dashboard, Bookings, NewBooking, BookingDetail,
                      Dispatch, Payments, Alerts, Rates, Feedback
  mocks/              MSW handlers seeded from the database guide's demo data
```

## API contract used

`POST /api/auth/login` · `GET/POST/PATCH /api/bookings[/:id]` ·
`POST /api/bookings/:id/pay` · `POST /api/bookings/:id/mark-paid` ·
`POST /api/bookings/:id/assign` (409 carries the clashing booking) ·
`POST /api/quotes` · `GET /api/drivers` · `GET /api/vehicles` ·
`GET /api/payments/reconciliation` · `POST /api/alerts` · `GET /api/alerts` ·
`POST /api/ai/draft-alert` · `GET /api/analytics/summary` · `GET /api/feedback` ·
`GET/PATCH /api/rates/*` · `POST /api/assignments/:id/resend`

Socket events: `booking:created`, `booking:updated`, `payment:received`,
`assignment:updated`, `alert:delivery`.

Money is integer KES everywhere; phones are E.164 (`+254...`) and masked to the
last three digits in lists.

## Conventions

- Loading, empty and error states on every list — no blank screens.
- Responsive down to 390px; tables scroll horizontally inside their container.
- AI alert text is always a draft: send stays disabled until the operator has
  checked the reviewed message in the confirm dialog.
- Server messages surface as toasts; HTTP 409 gets `ConflictAlert`, never a
  generic error.
