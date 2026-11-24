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

## Landing page (Phase 3)

`/(marketing)` renders the public site:

- **Hero** (`components/landing/Hero.tsx`) — full-viewport React Three Fiber savannah
  (low-poly ground, acacia silhouettes, low sun, drifting dust, pointer parallax,
  DPR capped at 1.5, render loop paused off-screen). Falls back to the static
  photograph when WebGL is unavailable or `prefers-reduced-motion` is set.
- **Sections** (`components/landing/sections.tsx`) — trust bar with animated
  counters, featured parks, attractions gallery, how-it-works timeline, AI
  itinerary teaser, testimonials, pricing, FAQ accordion, CTA band, footer.
  Scroll reveals use `motion` with a `useReducedMotion` guard.
- **Images** — royalty-free files fetched from Wikimedia Commons into
  `public/images/{hero,parks,attractions}/`; sources, authors and licences are
  recorded in `public/images/CREDITS.md` (never hotlinked).
- `/parks` and `/attractions` render the matching sections standalone.

## Responsive layout system (Phase 4)

- **Breakpoints**: Tailwind defaults plus `3xl` (1920px) and `4xl` (2560px); the root font
  scales to 18px/20px on large screens so a dashboard stays legible from a couch.
- **App shell** (`components/AppShell.tsx`): sidebar that collapses to icons on `md`
  (persisted in localStorage, hydrated after mount to avoid hydration mismatches), off-canvas
  drawer with swipe-to-close on phones, sticky top bar with ⌘K command palette
  (`components/CommandPalette.tsx`), notifications menu fed by `/api/alerts`, theme switcher
  and user menu; a bottom tab bar covers the five most-used routes below `md`.
- **Grids**: dashboard KPI cards go 1 → 2 (`sm`) → 4 (`lg`) → 6 (`3xl`); chart panels
  1 → 2 → 3. Content is capped at 72rem except the dashboard, which widens at 3xl/4xl.
- **Tables**: `.rtable` renders a sticky-header, horizontally scrolling table with a pinned
  first column above `md`, and stacked labelled cards below it (used on Bookings, Payments,
  BookingDetail, Rates and Feedback).
- **Forms**: single column on phones, two columns from `sm`/`lg`, sticky action bar on mobile.
- **Container queries**: card grids (parks, attractions) adapt to their slot via
  `@min-[…]` container variants rather than the viewport.
- **Touch/a11y**: 44px targets on coarse pointers, visible focus rings everywhere.

Verified at 360×800, 390×844, 768×1024, 1280×800, 1440×900 and 1920×1080 with zero
horizontal overflow; KPI rows measured 1 column at 360px and 6 at 1920px.

## Cards, charts and tables (Phase 5)

- **KPI cards** (`components/KpiCard.tsx`): icon, eased count-up value (skipped under
  `prefers-reduced-motion`), delta badge with colour + text, sparkline and a tooltip.
- **Charts** (`components/charts/`) all read theme colours through `--chart-*` /
  `--color-*` CSS vars and ship an accessible `<details>` data-table fallback:
  - Revenue area chart with **7D/30D/90D/YTD selector**, previous-period dashed line,
    brush zoom, CSV export and abbreviated axis numbers.
  - Status donut (centre total), bookings-by-park horizontal bars, payments-by-method
    stacked bars, per-driver utilisation radials, 8-week occupancy heatmap.
  - Demand forecast with the AI **dashed forecast line + shaded confidence band**.
- **AI features are served by Python**: `/api/ai/*` proxies to the FastAPI sidecar in
  `../ai` (`uvicorn app:app --port 8001`, see `../ai/README.md`). Payments shows an
  anomaly panel (duplicate M-Pesa refs / conflicting amounts); Feedback shows a
  sentiment trend. MSW stand-ins keep those two screens demonstrable without the
  sidecar running.
- **Data table** (`components/DataTable.tsx`, TanStack Table): sorting, global search,
  column visibility, density toggle, row selection with bulk confirm/cancel, CSV export,
  pagination and a persisted view (`localStorage:datatable:<id>`). Bookings uses it on
  `md+` and the stacked-card table below.

## Animation and motion (Phase 6)

- **Page transitions**: `components/motion/RouteTransition.tsx` wraps the `(app)`
  page content in `motion` + `AnimatePresence` — 180ms fade/slide on enter, short
  fade on exit, shell stays mounted. Default mode is used deliberately:
  `mode="popLayout"` reparents the outgoing page and broke client rendering of
  data-heavy routes.
- **Staggered reveals**: `components/motion/Stagger.tsx` (JS variants) for KPI
  cards and a `.stagger-motion > *` CSS stagger for chart grids; both run once on
  first load and animate only `transform`/`opacity`.
- **Micro-interactions**: buttons scale to 97% on press (`motion-safe:active:scale`),
  sonner toasts slide in via `.toast-slide`, sidebar width/padding tween 200ms,
  mobile drawer slides in with a backdrop fade, and theme/palette changes crossfade
  through a temporary `.theme-crossfade` class applied by `ThemeProvider`
  (mutation observer compares values so it cannot loop).
- **Reduced motion**: every animation above is gated — JS components use
  `useReducedMotion()` from `motion/react`; CSS uses `@media
  (prefers-reduced-motion: no-preference)` / `motion-safe:` / `motion-reduce:`.
  Verified with emulated reduce: KPIs/charts render instantly, `animation-name: none`.

## Authentication (Phase 7)

- **Cookies, not localStorage.** `lib/api.ts` sends `credentials: "include"`; the
  server sets httpOnly `sd_access` / `sd_refresh` cookies (`backend/src/routes/auth.ts`).
  The store keeps only the user object.
- **Silent refresh**: a 401 on any non-auth call triggers one shared in-flight
  `POST /api/auth/refresh`; the request is retried once. If refresh fails the
  session is cleared.
- **Route protection**: `proxy.ts` redirects unauthenticated visitors from
  `/dashboard`, `/bookings`, `/dispatch`, `/payments`, `/alerts`, `/rates`,
  `/feedback`, `/users`, `/settings` to `/sign-in?next=…`, and signed-in users
  away from auth pages. `RequireAuth`/`AuthGate` are the client-side companions.
- **Auth pages** (`components/auth/AuthLayout.tsx`): split-screen park-photo layout,
  stacked on mobile; Form + zod, password strength meter, show/hide password,
  inline error and loading states on sign-in / sign-up / forgot / reset.
- **Sign-out** revokes the server session, clears the TanStack Query cache and
  disconnects the socket, then lands on `/`.
- **Backend proxy**: set `BACKEND_URL` (and `NEXT_PUBLIC_USE_MOCKS=false`) and
  Next rewrites `/api/*` to Express so cookies stay same-origin.

## Roles and permissions (Phase 8)

- One permission catalogue (`backend/src/auth/permissions.ts`, mirrored in
  `frontend/src/lib/permissions.ts`). A vitest sync test imports both and fails
  on any drift; every listed permission is asserted to be used by a role.
- Backend gates: `requireAuth` populates `req.user`; `requirePermission('x:y')`
  returns the standard `{error, code}` 403 body. `/api/users` uses
  `users:read` for listing and `users:manage` for PATCH / password resets.
- Frontend: `<Can permission="…" any>` plus `usePermissions()`/`usePermission()`
  gate the sidebar, bottom tabs and dashboard widgets; each role gets its own
  dashboard headline, e.g. customer → upcoming trips, driver → assignments,
  finance → revenue, operations/dispatcher → live dispatch.
- `/users` admin table (`features/users/UsersAdmin.tsx`): searchable data table
  with inline role select, activate/deactivate, "send password reset" and an
  invite form (email + staff role). Self-lockout guards refuse changing your own
  role or disabling yourself.
- Migration `005_rbac.sql` maps legacy `staff` rows to `operations` and tightens
  the role CHECK constraints; `dispatcher` is a first-class role.

## Roadmap (UI overhaul prompt)

~~Phase 2 theming~~ done · ~~Phase 3 landing page~~ done · ~~Phase 4 responsive system~~ done ·
~~Phase 5 cards/charts/tables + Python AI sidecar~~ done · ~~Phase 6 animation and motion~~ done ·
~~Phase 7 authentication (cookies, refresh, reset)~~ done · ~~Phase 8 roles & permissions~~ done ·
Phase 9 guides.
