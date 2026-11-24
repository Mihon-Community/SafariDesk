# SafariDesk — Frontend Guide

Next.js 16 (App Router, Turbopack) + React 19 + TypeScript dashboard for Kenyan safari
operators. This guide supersedes the PDF version.

## Structure

```
frontend/
├─ proxy.ts                 # route guards (Phase 7): redirects for auth/operator routes
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
```

| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_USE_MOCKS` | `true` (.env) | MSW service-worker mocks; never enable in production builds |
| `BACKEND_URL` | unset | with mocks off, `/api/*` is rewritten to this origin (same-origin cookies) |
| `NEXT_PUBLIC_API_URL` | unset | absolute API base when calling cross-origin |
| `NEXT_PUBLIC_SOCKET_URL` | unset | socket.io origin |

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

## Landing page, 3D hero and images

`(marketing)` renders the landing page with `components/landing/Hero.tsx` (React Three
Fiber savannah, DPR capped at 1.5, pauses off-screen) inside `HeroScene`, lazy-loaded
with `next/dynamic({ ssr:false })`. Static hero image fallback on low-power devices,
WebGL failure or `prefers-reduced-motion`; `Reveal` provides scroll reveals.

Images live in `public/images/{hero,parks,attractions}`; every file's source URL, author
and licence is recorded in `public/images/CREDITS.md`. Never hotlink; keep files
optimised (max 2560 px) and give each an `alt`.

## RBAC on the client

- Permissions mirror `backend/src/auth/permissions.ts`; the backend sync test fails on drift.
- `usePermissions()` / `usePermission(p)` expose the current role's set;
  `<Can permission="payments:refund" any>` gates widgets, nav entries and bulk actions.
- `proxy.ts` handles redirects; `RequireAuth`/`AuthGate` are the client companions.
- Sign-out revokes the cookie session, clears the Query cache and disconnects the socket.

## Testing

No frontend unit suite yet; verification is `tsc --noEmit` + `next build` plus manual
viewport sweeps. Backend parity tests (`permissions.sync.test.ts`) also import the
frontend permission module. To add component tests later: vitest + Testing Library
against `components/` with the stores mocked.
