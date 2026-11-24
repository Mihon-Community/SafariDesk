# SafariDesk — Frontend Guide

Next.js 16 (App Router, Turbopack) + React 19 + TypeScript dashboard for Kenyan safari
operators. This guide supersedes the PDF version.

## Structure

```
frontend/
├─ src/proxy.ts          # route guards: auth redirects + role-aware UX guard (`sd_role`)
├─ next.config.ts           # turbopack root + msw alias; BACKEND_URL rewrite
├─ public/images/           # hero/parks/attractions imagery + CREDITS.md
└─ src/
   ├─ app/
   │  ├─ layout.tsx         # html/body, ThemeProvider, Providers
   │  ├─ providers.tsx      # QueryClient (retry: 2), MswStarter, Toaster
   │  ├─ globals.css        # theme tokens, chips, rtable, motion rules
   │  ├─ (marketing)/       # / /parks /attractions /about /contact  (public)
   │  ├─ (auth)/            # sign-in, sign-up, forgot-password, reset-password
   │  └─ (app)/             # dashboard, bookings[/new]/[id], dispatch, payments,
   │                        # alerts, rates, feedback, users, settings  (RequireAuth)
   ├─ views/                # page-level client components
   ├─ features/users/       # admin user table (Phase 8)
   ├─ components/
   │  ├─ ui/                # shadcn/ui primitives (button, card, chart, checkbox, …)
   │  ├─ auth/              # AuthLayout split screen, PasswordStrength
   │  ├─ charts/            # RevenueRangeChart, ForecastChart, DashboardCharts
   │  ├─ motion/            # RouteTransition, Stagger
   │  ├─ DataTable.tsx      # TanStack Table wrapper (sort/search/density/bulk/CSV)
   │  └─ AppShell.tsx       # sidebar + top bar + bottom tabs + RequireAuth
   ├─ hooks/                # useBookings/useDrivers/usePayments/useRealtime/useAi/usePermissions
   ├─ lib/                  # api.ts (cookies + silent refresh), permissions.ts, format, export
   ├─ mocks/                # MSW handlers + browser bootstrap (dev stand-ins)
   └─ store/                # zustand: auth session, theme, ui (sidebar)
```

Interactive components are `"use client"`; layouts and static marketing pages stay server
components.

## Scripts & env

```bash
npm run dev        # http://localhost:3000
npm run build / start
npm run typecheck  # tsc --noEmit
npm run lint       # palette contrast contracts + tsc
```

| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_USE_MOCKS` | `true` (.env) | MSW service-worker mocks; only mounted in `next dev`, never in a production server |
| `BACKEND_URL` | unset | with mocks off, `/api/*` is rewritten to this origin (same-origin cookies) |
| `NEXT_PUBLIC_API_URL` | unset | absolute API base when calling cross-origin |
| `NEXT_PUBLIC_SOCKET_URL` | unset | socket.io origin |

## Route protection

Guards live in **`src/proxy.ts`** (Next only picks up proxy/middleware next to
`app/` when `src/` exists). It redirects unauthenticated visitors to
`/sign-in?next=…`, sends signed-in users away from auth pages, and applies a
role-aware UX guard: the backend sets a non-sensitive `sd_role` cookie next to
`sd_access`, and the proxy sends users opening a route their role cannot use to
that role's home (`lib/roles.ts`). API routes remain the source of truth.

`msw init public/` regenerates `mockServiceWorker.js`. Turbopack needs the
`resolveAlias`/`webpack` entry in `next.config.ts` because `msw/browser` sets
`"node": null` in its exports map.

## Theming — how to add a 7th theme

1. Pick OKLCH-flavoured hex values for `--brand`, `--accent`, `--chart-1..5`,
   `--status-*-bg/-fg`.
2. Add two blocks to `src/app/globals.css`: `[data-theme="mytheme"] { … }`
   (light) and `[data-theme="mytheme"].dark { … }`.
3. Register it in `src/lib/themes.ts` (`id`, `label`, `swatch`).
4. Done — `ThemeMenu`, Settings → Appearance and the palette grid pick it up;
   charts read `--chart-*`, chips read `--status-*`.

Mode (light/dark/system) is separate: `next-themes` owns the `.dark` class,
the zustand theme store owns `[data-theme]`. Palette changes crossfade through
`.theme-crossfade` (~180 ms, skipped under reduced motion).

## Responsive rules

- Breakpoints: Tailwind defaults plus `3xl: 1920px`, `4xl: 2560px` (`@theme`); root font
  scales at 1920/2560. Test at 360×800, 390×844, 768×1024, 1280×800, 1440×900, 1920×1080.
- Shell: sidebar collapses to icons on `md` (persisted), off-canvas drawer on phones,
  sticky top bar, ⌘K command palette, bottom tab bar filtered by role.
- Grids: KPI cards 1 → 2 (`sm`) → 4 (`lg`) → 6 (`3xl`); charts 1 → 2 → 3.
- Tables: `.rtable` is a real table above `md` (sticky header, pinned first column,
  horizontal scroll) and stacked labelled cards below; `DataTable` is used on `md+`.
- Touch targets ≥ 44 px on coarse pointers; container queries (`@min-[…]`) drive
  parks/attractions grids.

## Component, chart and table patterns

- **Cards**: `KpiCard` (count-up with reduced-motion guard, delta badge colour+text,
  sparkline, tooltip). Hover lift via `hover:-translate-y-0.5`.
- **Charts**: always `ChartContainer` (injects `--color-*` vars from theme) + Recharts,
  plus a `<ChartFallback>` `<details>` data table. Revenue chart has 7D/30D/90D/YTD,
  previous-period dashed line, brush zoom and CSV export (`lib/export.ts`).
- **Tables**: `DataTable<T>` = TanStack Table (sorting, global search, column visibility,
  density, row selection + bulk actions, CSV export, pagination, persisted view in
  `localStorage`). Money uses `Money`, dates `lib/format`, status `StatusBadge`.
- **Motion**: `RouteTransition` (180 ms fade/slide via `motion` + `AnimatePresence`;
  default mode only — `popLayout` breaks RSC pages), `.stagger-motion` CSS stagger,
  all gated by `prefers-reduced-motion`.

## Landing page and hero

The hero is deliberately lightweight — no three.js. The park photograph
(`public/images/hero/`) renders via `next/image` (`priority`, `fill`,
`sizes="100vw"`, blur placeholder) with a slow Ken Burns zoom, a theme-tinted
readability gradient, parallax SVG savannah silhouettes (`currentColor`), a
glowing sun/moon disc and gliding birds; the headline staggers in word by word.
Everything motion-related (zoom, parallax, birds, testimonial marquee, route
line) is disabled under `prefers-reduced-motion`.

Images live in `public/images/{hero,parks,attractions}`; every file's source
URL, author and licence is recorded in `public/images/CREDITS.md`. Never
hotlink; keep files optimised (max 2560 px) and give each an `alt`.

Client JS for `/` dropped from a 924 KB largest chunk (three.js) to 447 KB
after the rewrite (raw build output).

## RBAC on the client

- Permissions mirror `backend/src/auth/permissions.ts`; the backend sync test fails on drift.
- `usePermissions()` / `usePermission(p)` expose the current role's set;
  `<Can permission="payments:refund" any>` gates widgets, nav entries and bulk actions.
- `src/proxy.ts` handles redirects; `RequireAuth`/`AuthGate` are the client companions.
- Sign-out revokes the cookie session, clears the Query cache, disconnects the socket
  and clears the `sd_role` hint cookie.

## Sign up / sign in / role homes

- `/sign-up` is two steps: an accessible role radio grid (Traveller live;
  Driver/Sales/Operations/Finance queued as pending), then the form. The backend
  never accepts `admin`/`super_admin` at self-signup (`403 FORBIDDEN_ROLE`) and
  stores pending requesters as `role=customer, status=pending, requested_role=…`.
- `/sign-in` has a Traveller/Driver/Staff/Admin segmented control that only sets
  helper text and expectations; the account's real role decides the landing page
  (`lib/roles.ts`) and a mismatch shows an informational toast.
- Homes: admin/super_admin → `/dashboard`, operations/dispatcher → `/dispatch`,
  finance → `/payments`, agent → `/bookings`, driver → `/driver`, customer →
  `/my-trips`. Dev-only demo quick-fill buttons sit under the form outside
  production.

## Testing

No frontend unit suite yet; verification is `tsc --noEmit` + `next build` plus manual
viewport sweeps. Backend parity tests (`permissions.sync.test.ts`) also import the
frontend permission module. To add component tests later: vitest + Testing Library
against `components/` with the stores mocked.
