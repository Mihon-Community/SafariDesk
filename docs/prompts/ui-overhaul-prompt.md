# SafariDesk — UI Overhaul, Next.js Migration, Auth & Roles Prompt

> Paste everything below the line into Claude Code (or another coding agent) from the repo root.
> Run it phase by phase. Commit after each phase so you can roll back.

---

## Context

You are working on **SafariDesk**, a safari / tour operations platform (bookings, dispatch, drivers,
payments, alerts, rates, feedback, AI itinerary/concierge).

Current state of the repo:

- `frontend/` — **Vite + React 18 + React Router 7**, Tailwind v4, shadcn/ui (button, card, table,
  dialog, select, tabs, badge, alert, input, label, textarea, skeleton), lucide-react, Recharts 3,
  TanStack Query 5, Zustand (auth store), react-hook-form + zod, socket.io-client, sonner, MSW mocks.
  Pages: Login, Dashboard, Bookings, NewBooking, BookingDetail, Dispatch, Payments, Alerts, Rates, Feedback.
- `backend/` — Express 5 + TypeScript, Postgres (`pg`), JWT + bcrypt, zod, socket.io, helmet,
  express-rate-limit, pino, Africa's Talking (SMS), vitest. Migrations in `backend/migrations`.
- `ai/` — itinerary, concierge, forecast, anomalies, sentiment, parseBooking, draftAlert, keywordFaq.
- `docs/` — Frontend, Backend, Database guides (PDF), SRS, Overview.
- Roles today are only `"admin" | "staff"` (`frontend/src/lib/types.ts`, `frontend/src/store/auth.ts`).

Read the existing code and docs before changing anything. Preserve all existing business logic,
API contracts, hooks (`useBookings`, `useDrivers`, `usePayments`, `useQuote`, `useRealtime`) and
realtime behaviour. Where you must change a contract, update both sides and the guides.

## Goals

1. Migrate the frontend to **Next.js (App Router, TypeScript)**.
2. Build a public **3D, animated landing page** with Kenyan / East African safari imagery.
3. Make every page, chart, card and table **fully responsive from 320px phones to 4K TVs**.
4. Add **6 colour themes**, each with light and dark variants, plus a **System** mode.
5. Replace basic charts/tables with **smarter, interactive** ones.
6. Add **sign up, sign in, sign out** and **role-based access control** in frontend and backend.
7. Update the **frontend, backend and database guides**.

## Required libraries (use these; don't swap without saying why)

| Concern         | Library                                                                                                                                                                                                                                                                                   |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework       | `next` (latest stable, App Router, Turbopack), `react` 19                                                                                                                                                                                                                             |
| Components      | **shadcn/ui** (re-init for Next.js; add sidebar, sheet, dropdown-menu, avatar, tooltip, popover, command, calendar, chart, sonner, toggle-group, breadcrumb, pagination, scroll-area, carousel, form, drawer, navigation-menu, hover-card, progress, switch, checkbox, radio-group) |
| Icons           | `lucide-react` only                                                                                                                                                                                                                                                                     |
| 3D              | `three`, `@react-three/fiber`, `@react-three/drei` (lazy-loaded, client-only)                                                                                                                                                                                                       |
| Animation       | `motion` (Framer Motion), `tw-animate-css`; optional Magic UI / Aceternity-style blocks copied in as source                                                                                                                                                                           |
| Charts          | **shadcn Charts (Recharts)** as the default; `@nivo/calendar` / `@nivo/heatmap` only for heatmaps/calendar views if needed                                                                                                                                                      |
| Tables          | `@tanstack/react-table` with the shadcn data-table pattern                                                                                                                                                                                                                              |
| Themes          | `next-themes`                                                                                                                                                                                                                                                                           |
| Images          | `next/image` (AVIF/WebP, `sizes`, `placeholder="blur"`)                                                                                                                                                                                                                             |
| Carousel        | `embla-carousel-react` (via shadcn carousel)                                                                                                                                                                                                                                            |
| Data/state      | keep TanStack Query, Zustand, react-hook-form + zod, socket.io-client, sonner                                                                                                                                                                                                             |
| Maps (optional) | `react-leaflet` for dispatch/park map                                                                                                                                                                                                                                                   |

## Phase 1 — Migrate to Next.js

- Create the Next.js app in `frontend/` (move the Vite app to `frontend-legacy/` until parity is confirmed, then delete it).
- Route groups:
  - `app/(marketing)/` — `/` landing, `/parks`, `/attractions`, `/about`, `/contact`
  - `app/(auth)/` — `/sign-in`, `/sign-up`, `/forgot-password`, `/reset-password`
  - `app/(app)/` — `/dashboard`, `/bookings`, `/bookings/new`, `/bookings/[id]`, `/dispatch`,
    `/payments`, `/alerts`, `/rates`, `/feedback`, `/users` (admin), `/settings`
- Port every existing page, hook, `lib/*` util and component. Mark interactive components `"use client"`;
  keep layouts and static content as Server Components.
- Replace React Router with Next routing (`Link`, `useRouter`, `usePathname`). Keep MSW for dev.
- Env: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SOCKET_URL`. Update `.env.example`.
- Typecheck and build must pass before moving on.

## Phase 2 — Theming (6 themes × light/dark + System)

Define CSS variables in `app/globals.css` using Tailwind v4 `@theme` and OKLCH colours, one block
per theme for light and dark (`[data-theme="x"]` and `[data-theme="x"].dark`). Themes:

1. **Savannah** — golden grass, warm amber (default)
2. **Maasai Mara** — red ochre and shuka red
3. **Serengeti Dusk** — sunset orange to violet
4. **Kilimanjaro** — glacier blue and slate
5. **Diani Coast** — turquoise and sand
6. **Rainforest** (Kakamega) — deep greens

Requirements:

- `next-themes` handles mode (`light` / `dark` / `system`); a separate persisted setting handles colour theme.
- Theme switcher in the top bar and in Settings: mode toggle-group plus a palette grid with live previews.
- No flash of the wrong theme on load. Respect `prefers-reduced-motion` and `prefers-contrast`.
- Every theme must pass **WCAG AA** contrast for text, badges, chart series and focus rings in both modes.
- Chart colours come from `--chart-1 … --chart-5` per theme so charts re-theme automatically.

## Phase 3 — Landing page (3D, animation, imagery)

- **Hero**: full-viewport React Three Fiber scene, e.g. a low-poly savannah at golden hour with an
  acacia silhouette, drifting dust particles and slow camera parallax that follows the pointer or scroll.
  Headline, subcopy, and CTAs "Plan a Safari" and "Sign in".
  - Lazy-load with `next/dynamic({ ssr: false })` and a static hero image fallback.
  - Show the static image instead of the 3D scene on low-power devices, when `prefers-reduced-motion`
    is set, or when WebGL is unavailable.
  - Cap DPR at 1.5 on mobile and pause rendering when off-screen.
- **Sections**, each with scroll-triggered `motion` reveals:
  1. Trust bar: stats counters (trips run, happy guests, parks covered)
  2. **Featured parks** with full-bleed background images: Maasai Mara, Amboseli, Tsavo East/West,
     Samburu, Lake Nakuru, Nairobi National Park, Serengeti, Ngorongoro
  3. **Tourist attractions** gallery as a masonry/carousel with hover-card details: Great Migration,
     Diani Beach, Lamu Old Town, Mount Kenya, Hell's Gate, Giraffe Centre, David Sheldrick Elephant
     Orphanage, Fort Jesus, Lake Naivasha, Zanzibar Stone Town
  4. How it works (Book → Dispatch → Explore), animated timeline
  5. AI itinerary teaser (calls the `ai/itinerary` flow)
  6. Testimonials marquee, pricing/packages cards, FAQ accordion, CTA band, footer
- **Images**: put them in `frontend/public/images/{parks,attractions,hero}/`. Use only royalty-free
  sources (Unsplash/Pexels) or your own photos. Record the source URL, author and licence of every image
  in `frontend/public/images/CREDITS.md`. Never hotlink. Optimise everything to WebP/AVIF at 2560px max
  and use blur placeholders. Every image needs descriptive `alt` text.
- Lighthouse targets for the landing page on mobile: Performance ≥ 85, Accessibility ≥ 95, CLS < 0.1.

## Phase 4 — Responsive layout system (320px → 4K TV)

Breakpoints: Tailwind defaults plus custom `3xl: 1920px` and `4xl: 2560px`.

- **App shell**: shadcn `Sidebar` (collapsible to icons on `md`, off-canvas `Sheet` on mobile),
  sticky top bar with search (`Command` / ⌘K), theme switcher, notifications and user menu.
  On phones, add a bottom tab bar for the 4–5 most-used routes per role.
- **Fluid type and spacing**: `clamp()`-based font sizes. On `3xl`/`4xl`, scale the root font size so
  TV viewing at a distance stays legible, and cap content width (except on the dashboard, which expands
  to extra grid columns).
- **Grids**: dashboard KPI cards go from 1 column (phone) to 2 (`sm`) to 4 (`lg`) to 6 (`3xl`).
  Chart panels go from 1 to 2 to 3 columns.
- **Tables**: below `md`, render rows as stacked cards. Above `md`, use the full data table with a
  sticky header, horizontal scroll and a pinned first column.
- **Forms**: single column on mobile, two columns on `lg`, and a sticky action bar on mobile.
- **Touch**: targets ≥ 44px, swipe-to-close on drawers, no hover-only affordances.
- Use container queries (`@container`) for cards and charts so they adapt to their slot, not only the viewport.
- Test at 360×800, 390×844, 768×1024, 1280×800, 1440×900, 1920×1080 and 3840×2160, plus landscape phone.

## Phase 5 — Cards, charts and tables

**Cards**

- KPI card: icon, value with animated count-up, delta badge (▲/▼ with colour plus text, never colour
  alone), sparkline, and a tooltip explaining the metric.
- Hover lift and subtle gradient border. Skeleton loading state, empty state with illustration, and error state with retry.

**Charts** (shadcn `ChartContainer` + Recharts, colours from theme variables)

- Dashboard: revenue area chart with a range selector (7d/30d/90d/YTD) and a comparison-to-previous-period line;
  bookings by park (horizontal bar); booking status (donut with centre total); driver utilisation
  (radial); payments by method (stacked bar); occupancy calendar heatmap.
- **Smarter features**:
  - Forecast band from `ai/forecast` shown as a dashed line with a shaded confidence interval.
  - Anomaly markers from `ai/anomalies` with a tooltip explaining each one.
  - Sentiment trend from `ai/sentiment` on Feedback.
  - Brush/zoom, legend toggling, PNG/CSV export, and live updates via socket.io without full re-render.
  - Responsive: fewer ticks and legend-below on mobile, abbreviated numbers (KES 1.2M), and an
    accessible `<table>` fallback / `aria-label` summary for every chart.
- Animate chart entry with a short duration, and skip the animation when reduced motion is set.

**Tables** (TanStack Table + shadcn data-table)

- Server-side pagination, sorting and filtering wired to existing API query params (add params to the backend if missing).
- Global search, faceted filters (status, park, driver, date range), column visibility, density toggle,
  row selection with bulk actions, CSV export, saved views in localStorage.
- Status uses `StatusBadge`; money uses `Money`; dates use `lib/format`.
- Mobile card view as described in Phase 4. Virtualise lists over 200 rows.

## Phase 6 — Animation and motion guidelines

- Page transitions: fade/slide of 150–250ms via `motion` + `AnimatePresence` in the app layout.
- List and grid items: staggered reveal on first load only.
- Micro-interactions: button press scale, toast slide-in, sidebar collapse, theme crossfade.
- Respect `prefers-reduced-motion` globally. Use a `useReducedMotion` guard for all motion and 3D.
- Animate only `transform` and `opacity`. Avoid layout thrash.

#### Phase 7 — Authentication (sign up / sign in / sign out)

**Backend (Express)**

- `POST /auth/sign-up` — zod-validated, bcrypt-hashed. Public sign-up creates a `customer` user.
  Staff accounts are created by admins via invite.
- `POST /auth/sign-in` — returns a short-lived access JWT (15m) and a rotating refresh token,
  both in **httpOnly, Secure, SameSite=Lax cookies**. Stop storing tokens in localStorage.
- `POST /auth/refresh`, `POST /auth/sign-out` (revoke the refresh token), `GET /auth/me`.
- `POST /auth/forgot-password`, `POST /auth/reset-password` (single-use, time-limited token, sent by email or SMS via Africa's Talking).
- `POST /auth/invite` and `POST /auth/accept-invite` for staff roles.
- Rate-limit auth routes, lock out after repeated failures, and log auth events with pino (never log secrets).
- Migration: `users` (role, status, last_login_at), `refresh_tokens`, `password_resets`, `invites`, `audit_log`.
- Vitest tests for every auth route, including the failure cases.

**Frontend (Next.js)**

- Split-screen auth pages: park photo on one side, form on the other (stacked on mobile).
  Use shadcn Form + zod, a password strength meter, show/hide password, and good error and loading states.
- Use `middleware.ts` (or `proxy.ts` on Next 16+) to redirect unauthenticated users from `(app)` routes
  to `/sign-in?next=…` and redirect signed-in users away from auth pages.
- Sign-out in the user menu clears the session, the TanStack Query cache and the socket connection,
  then redirects to `/`.
- Silent refresh on 401, with a single in-flight refresh shared across requests.

## Phase 8 — Roles and permissions (RBAC)

Roles:

| Role                            | Access                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------- |
| `super_admin`                 | Everything, including user management, roles, system settings and audit log     |
| `admin`                       | Everything except super-admin settings. Manages users, rates, payments, reports |
| `operations` / `dispatcher` | Bookings, dispatch, drivers, alerts. Read-only payments                         |
| `finance`                     | Payments, invoices, rates (read), revenue reports                               |
| `agent` (sales / front desk)  | Create and edit bookings, quotes, customer feedback                             |
| `driver`                      | Own assignments, trip status updates, own schedule (mobile-first view)          |
| `customer`                    | Own bookings, itineraries, payments, feedback, AI concierge                     |

- Define one source of truth: a shared `permissions.ts` map of `role → permissions[]` with permissions
  like `bookings:read`, `bookings:write`, `payments:refund`, `users:manage`. Import it from both
  backend and frontend, or duplicate it with a test that keeps them in sync.
- Backend: `requireAuth` plus `requirePermission('x:y')` middleware on every route. Scope queries for
  `driver` and `customer` to their own records. Respond with 403 and a JSON error body.
- Frontend: `<Can permission="…">` component and `usePermission()` hook. The sidebar, bottom nav,
  dashboard widgets and table bulk actions are all filtered by role. Each role gets its own dashboard
  (customer: upcoming trips; driver: today's assignments; finance: revenue; ops: live dispatch).
- `/users` admin page: data table of users with invite, change role, deactivate and reset password,
  all written to the audit log.
- Migrate existing `admin` / `staff` users. Map `staff` to `operations` unless told otherwise.

## Phase 9 — Update the guides

The current guides are PDFs. Write the updated versions as Markdown in `docs/` (the PDFs can be
regenerated from these later):

- `docs/FRONTEND_GUIDE.md` — Next.js structure, route groups, theming system (how to add a 7th theme),
  responsive rules and breakpoints, component and chart/table patterns, the 3D hero and its fallbacks,
  image sourcing and credits, RBAC on the client, env vars, scripts, testing.
- `docs/BACKEND_GUIDE.md` — auth flow diagram (sign-up, sign-in, refresh, sign-out, reset, invite),
  cookie and security settings, RBAC middleware, the permissions table, new endpoints with request and
  response examples, rate limits, logging, tests.
- `docs/DATABASE_GUIDE.md` — new and changed tables, ERD (Mermaid), migrations and rollback, and seed
  users for every role.
- Update the root `README.md` with quick start and demo credentials per role (dev only).

## Quality bar and definition of done

- `tsc` and `next build` pass with zero errors. ESLint is clean. Backend vitest suite is green.
- No hard-coded colours outside theme tokens. Only lucide icons.
- All 6 themes × light/dark verified on Landing, Dashboard, Bookings table, BookingDetail and Sign-in.
- Every page is checked at the viewport list in Phase 4. There is no horizontal scroll at 320px.
- Keyboard navigation and visible focus everywhere. axe has no serious violations.
- Each role signs in with seeded credentials and sees only what it should. A forbidden API call returns 403.
- Finish with a short report listing what changed, any deviations from this prompt and why, follow-ups,
  and screenshots (mobile, desktop, TV) for the landing page and dashboard.

Work phase by phase. At the end of each phase, run the build and tests and summarise before continuing.
Ask before deleting `frontend-legacy/` or running destructive migrations.
