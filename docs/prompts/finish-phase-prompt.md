# SafariDesk — Finish-Up Prompt (fixes, lighter landing, role-based sign up / sign in)

> Paste everything below the line into Claude Code from the repo root.
> Work task by task and commit after each one.

---

## Context

SafariDesk is a Next.js 16 (App Router, `frontend/src/app`) + Express 5 (`backend/src`) safari operations
platform. Phases 1–8 of `docs/prompts/ui-overhaul-prompt.md` are committed. An audit found the gaps
listed below. Read `frontend/AGENTS.md` first: this Next.js version differs from older ones, so check
`frontend/node_modules/next/dist/docs/` before using any Next API.

Existing pieces to reuse, not rewrite:
- Roles and permissions: `frontend/src/lib/permissions.ts` and `backend/src/auth/permissions.ts`.
  Roles are `super_admin, admin, operations, finance, agent, driver, customer`. The test
  `backend/tests/permissions.sync.test.ts` keeps the two files in sync.
- Auth service: `backend/src/auth/service.ts` and `backend/src/routes/auth.ts`, which already have
  sign-up, sign-in, refresh, sign-out, me, forgot/reset password, and invite/accept-invite.
- Storage interface: `backend/src/auth/repository.ts` (`AuthRepository`) with `MemoryRepository`
  in `backend/src/auth/memoryStore.ts`.
- Migrations `backend/migrations/004_auth.sql` and `005_rbac.sql`.

Don't break the existing tests. Run `npm run typecheck && npm test` in `backend/` and `npx next build`
in `frontend/` after every task.

## Task 1 — Make route protection actually run

- Move `frontend/proxy.ts` to `frontend/src/proxy.ts`. With a `src/` directory, Next only picks it up
  at the same level as `app/`.
- Verify: after `next build`, `.next/server/middleware-manifest.json` must not be empty, and the build
  output must list the proxy.
- Add role-aware guarding. Read the role from a non-sensitive `sd_role` cookie that the backend sets
  next to `sd_access`. Redirect users who open a route their role can't access to their role's home
  (see Task 5). This is a UX guard only. The backend stays the source of truth, and every API route
  still checks permissions.
- Fix the path in `docs/FRONTEND_GUIDE.md`.

## Task 2 — Persist users in Postgres

- Implement `backend/src/auth/pgStore.ts` (`PgRepository implements AuthRepository`) using `pg` and the
  schema in `004_auth.sql` and `005_rbac.sql`. Use parameterised queries only, and transactions for
  refresh-token rotation and invite acceptance.
- In `backend/src/app.ts` `start()`: use `PgRepository` when `DATABASE_URL` is set, otherwise
  `MemoryRepository`, logging which one is active. Add a `npm run migrate` script that applies
  `migrations/*.sql` in order and records them in a `schema_migrations` table.
- Seed one demo user per role in dev only (`006_seed_roles.sql`, or the bootstrap when
  `NODE_ENV !== "production"`).
- Add vitest tests that run the existing auth suite against `PgRepository` when `TEST_DATABASE_URL`
  is set, and skip otherwise.

## Task 3 — Fix the display bugs

1. **No theme on first paint.** Add `data-theme="savannah"` to `<html>` in
   `frontend/src/app/layout.tsx`. Then add a tiny inline `<script>` in `<head>` that reads
   `localStorage.sd_theme` and sets `document.documentElement.dataset.theme` before paint.
   Keep `suppressHydrationWarning`. Verify that with JavaScript disabled the landing page shows
   themed colours, not black on transparent.
2. **Invisible donut slices.** In `frontend/src/components/charts/DashboardCharts.tsx` lines ~31–36,
   stop using `--status-*-bg` for chart fills. Add solid `--status-*-solid` tokens per theme
   (light and dark) in `globals.css` with at least 3:1 contrast against `--card`, and use them for
   the donut and its legend dots.
3. **Payments tabs overflow on phones.** In `frontend/src/views/Payments.tsx`, make the `TabsList`
   horizontally scrollable (`w-full overflow-x-auto`, no wrapping, snap scrolling), or show only
   icon + count below `sm`. There must be no horizontal page scroll at 320px.
4. **Themes look alike.** Give each palette a distinct background tint, not just a different accent:
   Savannah (warm cream), Maasai Mara (soft clay), Serengeti Dusk (peach-lilac), Kilimanjaro
   (ice blue), Diani Coast (sea-foam), Rainforest (mint). Keep WCAG AA for all text tokens in both
   modes.
5. **Wide screens.** On `4xl`, let the dashboard grid use the available width (up to 6 columns) and
   stop the Occupancy card stretching the cards beside it (`items-start` or fixed chart heights).

## Task 4 — Replace the 3D hero with lightweight graphics and animation

The three.js hero is too heavy. Remove it completely:
- Delete `frontend/src/components/landing/HeroScene.tsx`. Remove `three`, `@react-three/fiber` and
  `@react-three/drei` from `package.json`, and remove any `next/dynamic` import of the scene.

Build a new hero in `frontend/src/components/landing/Hero.tsx` with only CSS, SVG and `motion`:
- **Background:** the existing hero photo (`public/images/hero/`) via `next/image` with `priority`,
  `fill`, `sizes="100vw"` and a blur placeholder. Add a slow Ken Burns zoom (CSS `scale` 1 → 1.08
  over ~20s) and a theme-tinted gradient overlay (`--background` to transparent) so text is readable
  in every theme and mode.
- **Graphics:** an inline SVG layer at the bottom of the hero with layered savannah hills and acacia
  silhouettes that parallax slightly on scroll (`useScroll` + `useTransform`). Add an animated sun or
  moon disc with a soft glow, plus a few birds drawn as small SVG paths gliding across slowly.
  Silhouettes use `currentColor` so they follow the theme.
- **Motion:** headline words fade up with a stagger, then the subcopy and CTAs. Show a subtle
  scroll-down cue. Elsewhere on the landing page, keep the existing `Reveal` and `Counter` components.
  Add a gentle marquee for testimonials and animated SVG route lines in "How it works".
- **Readability:** headline and subcopy must meet AA contrast over the image at 320px, 390px and
  1280px. Fix the current grey-on-sand problem.
- **Performance:**
  - Under `prefers-reduced-motion`: no zoom, parallax or birds; static image only.
  - Animate only `transform` and `opacity`.
  - Targets: Lighthouse mobile Performance ≥ 90, LCP < 2.5s, CLS < 0.05, and a first-load JS
    reduction on `/` versus before (report the numbers from `next build`).

## Task 5 — Sign up and sign in with role selection

Role selection must not become a privilege-escalation hole. Follow these rules exactly.

**Sign up (`/sign-up`)**
- Step 1 is a role picker: a grid of shadcn cards with a lucide icon, title and one line each. It is
  keyboard navigable and works as a radio group. On phones it shows as stacked cards.

  | Card | Role | Result |
  |---|---|---|
  | Traveller | `customer` | Account active immediately |
  | Driver | `driver` | Account `pending`; needs admin approval |
  | Sales / front desk | `agent` | `pending` |
  | Operations / dispatch | `operations` | `pending` |
  | Finance | `finance` | `pending` |

  `admin` and `super_admin` are **never** offered at sign-up. They come only from invites or a
  super_admin.
- Step 2 shows the form fields for that role:
  - All roles: name, email, phone (existing `PhoneInput`, +254 default), password with strength meter.
  - Driver: also licence number and vehicle registration.
  - Staff roles: also an optional company/invite code.
- Validate with zod on both client and server, sharing the schema shape.
- Backend: `POST /api/auth/sign-up` accepts `requestedRole`.
  - Reject `admin` and `super_admin` with 403.
  - `customer` gets `status: active` and is signed in straight away.
  - Other roles get `status: pending`, `role: customer`, and `requested_role` stored. They see a
    "Request sent — an admin will approve your access" screen and are not signed in as staff.
- Add `requested_role` and `status` columns via a migration if they're missing.
- On `/users`, add a "Pending requests" tab where admins can approve (sets `role = requested_role`,
  `status = active`) or reject. Write both actions to the audit log and notify the user by SMS or
  email through the existing service hooks.

**Sign in (`/sign-in`)**
- Split screen: park photo with a light animated overlay on one side, form on the other (stacked on
  mobile).
- Add a "Sign in as" segmented control (Traveller / Driver / Staff / Admin) above the form. It is a
  UX hint only:
  - It sets helper text, the icon and where you land afterwards.
  - The backend decides the real role from the account. If the chosen group doesn't match the
    account's role, sign in anyway, show a toast ("Signed in as Finance"), and route to that role's
    real home. Never grant access based on the selection.
- Show clear states for pending accounts ("Awaiting approval"), deactivated accounts, locked accounts
  (rate limit) and wrong credentials, without revealing whether an email exists.
- Keep "Forgot password" and the dev-only demo account buttons (one per role), shown only when
  `NODE_ENV !== "production"`.

**After sign in, route each role to its home**

| Role | Home |
|---|---|
| super_admin, admin | `/dashboard` |
| operations | `/dispatch` |
| finance | `/payments` |
| agent | `/bookings` |
| driver | `/driver` (new mobile-first page: today's assignments and trip status buttons) |
| customer | `/my-trips` (new: upcoming bookings, itinerary, payments, feedback) |

The sidebar, bottom nav and ⌘K palette only show items the role can access (use the existing `<Can>`
and `usePermission`).

**Sign out**
- In the user menu and the mobile drawer. Calls `POST /api/auth/sign-out`, clears the TanStack Query
  cache, disconnects the socket and the `sd_role` cookie, then redirects to `/`.

**Tests**
- Backend: sign-up with each role (including admin rejected), pending users can't reach staff
  endpoints, approve/reject flow, and the sign-in role mismatch still returns the true role.
- Frontend: the `next build` passes. Manually verify every demo account lands on its correct home and
  can't open another role's route (proxy redirect plus a backend 403).

## Task 6 — Docs

- Commit and update `docs/FRONTEND_GUIDE.md` and `docs/BACKEND_GUIDE.md`:
  - New hero (no three.js)
  - Proxy location
  - Role-selection sign-up and approval flow
  - Role homes
  - Postgres store and `npm run migrate`
- Create `docs/DATABASE_GUIDE.md`: all tables including auth/RBAC, a Mermaid ERD, the migration order,
  rollback notes, and the seed users per role.
- Update the root `README.md` with a quick start (with and without Postgres), demo credentials per
  role (dev only), and the role → home table.

## Definition of done

- `backend`: typecheck clean and all tests green (memory store; Postgres store when
  `TEST_DATABASE_URL` is set).
- `frontend`: `next build` passes, the proxy appears in the build output, and no `three` packages
  remain in `package.json` or the lockfile.
- No horizontal scroll at 320px on any page. All 6 themes × light/dark verified on landing, sign-in,
  sign-up, dashboard and payments.
- Public sign-up can never create `admin` or `super_admin`. Staff roles stay pending until approved.
- Finish with a short report: what changed, landing-page JS size before and after, test results, and
  anything left undone.
