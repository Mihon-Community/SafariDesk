# SafariDesk — Operator Dashboard (Next.js)

React admin dashboard for SafariDesk, built on **Next.js 16 (App Router, Turbopack) +
TypeScript + React 19**. Guests and drivers never see it: they use USSD, SMS and
Voice. The dashboard makes a booking visible from quote to payment to dispatch,
and keeps the two high-risk actions (assigning a driver, sending a safety alert)
hard to get wrong.

This is the Phase 1 migration of the earlier Vite app. The previous implementation
is kept at `../frontend-legacy/` until parity is confirmed (it can be deleted once
you are satisfied).

## Stack

| Concern      | Choice                                                        |
| ------------ | ------------------------------------------------------------- |
| Framework    | Next.js App Router + Turbopack, React 19, TypeScript          |
| Data         | TanStack Query only — server data is never copied into Zustand |
| UI state     | Zustand: auth token + tiny UI state                           |
| Styling      | Tailwind CSS v4 (`@tailwindcss/postcss`) + shadcn/ui (Radix)  |
| Charts       | Recharts                                                      |
| Live updates | Socket.IO client                                              |
| Forms        | react-hook-form + Zod (`@hookform/resolvers`)                 |
| Toasts       | sonner                                                        |

## Run it

```bash
cd frontend
npm install

# Backend-free development against MSW mock handlers (seeded demo data):
npm run dev            # uses .env -> NEXT_PUBLIC_USE_MOCKS=true

# Against the real Express backend:
NEXT_PUBLIC_USE_MOCKS=false npm run dev
```

Dev server: http://localhost:3000 → `/sign-in` (demo mocks accept any valid email
with an 8+ character password). Authenticated routes live under `/dashboard`,
`/bookings`, `/dispatch`, `/payments`, `/alerts`, `/rates`, `/feedback`.

### Scripts

| Script              | Purpose                                        |
| ------------------- | ---------------------------------------------- |
| `npm run dev`       | Dev server (Turbopack)                         |
| `npm run build`     | Production build into `.next/`                 |
| `npm run start`     | Serve the production build                     |
| `npm run typecheck` | `tsc --noEmit`                                 |
| `npm run mocks`     | Copy the MSW service worker into `public/`     |

## Environment

Copy `.env.example` to `.env`.

| Variable               | Meaning                                                         |
| ---------------------- | --------------------------------------------------------------- |
| `NEXT_PUBLIC_API_URL`  | API origin. Empty = same origin (Express serves the built app)  |
| `NEXT_PUBLIC_SOCKET_URL` | Socket.IO origin. Empty = same origin                         |
| `NEXT_PUBLIC_USE_MOCKS`| `true` runs MSW handlers instead of a backend (development only)|

Production builds must leave mocks off.

## Structure

```
src/
  app/
    layout.tsx            root layout: metadata, globals.css, <Providers>
    providers.tsx         client bootstrap: QueryClient, toasts, MSW gating
    globals.css           theme tokens (Tailwind v4 @theme)
    (marketing)/          / landing + /parks, /attractions, /about, /contact
    (auth)/               /sign-in, /sign-up, /forgot-password, /reset-password
    (app)/                authenticated shell + dashboard, bookings (list/new/[id]),
                          dispatch, payments, alerts, rates, feedback, users, settings
  components/
    ui/                   shadcn/ui primitives
    AppShell.tsx          sidebar/top bar shell + RequireAuth guard
    MswStarter.tsx        browser-only MSW bootstrap (next/dynamic ssr:false)
    AuthGate.tsx          keeps signed-in users off auth pages
    StatusBadge.tsx, Money.tsx, ConflictAlert.tsx, PhoneInput.tsx, States.tsx, PageHeader.tsx
  views/                  page implementations (client components)
  lib/                    api.ts (JWT client), socket.ts, types.ts, format.ts, cn.ts
  hooks/                  useBookings, useQuote, useRealtime, useDrivers, usePayments
  store/auth.ts           token + user (guarded for SSR)
  mocks/                  MSW handlers seeded from the database guide's demo data
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

## Notes and conventions

- `(app)` routes are `force-dynamic`: their data comes from the API (or MSW) on
  the client, so they must not be prerendered at build time.
- Loading, empty and error states on every list; responsive down to 390px.
- AI alert text is always a draft: send stays disabled until the operator checks
  the reviewed message in the confirm dialog.
- HTTP 409 shows `ConflictAlert` with the clashing booking, never a generic error.

## Theming (Phase 2)

Six palettes × light/dark + System mode:

1. **Savannah** (default) — golden grass, warm amber
2. **Maasai Mara** — red ochre / shuka red
3. **Serengeti Dusk** — sunset orange into violet
4. **Kilimanjaro** — glacier blue and slate
5. **Diani Coast** — turquoise and sand
6. **Rainforest** — deep Kakamega greens

`next-themes` owns the mode (`.dark` class, System aware); the palette lives in
`store/theme.ts` (`[data-theme]` attribute, persisted in localStorage). Tokens are
generated in `app/globals.css` as `[data-theme="…"]` blocks; every theme/mode pair is
verified for WCAG AA contrast, and chart series read `--chart-1 … --chart-5`.
`prefers-reduced-motion` and `prefers-contrast` are respected globally.

## Roadmap (UI overhaul prompt)

~~Phase 2 theming~~ done · Phase 3 3D landing page ·
Phase 4 responsive system 320px→4K · Phase 5 smart charts/tables (TanStack Table) ·
Phase 6 motion · Phase 7 auth (cookies, refresh, reset) · Phase 8 RBAC · Phase 9 guides.
