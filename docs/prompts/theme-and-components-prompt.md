# SafariDesk — Theme Palette Refresh and Component Styling Prompt

> Paste everything below the line into Claude Code from the repo root.
> Run it after `finish-phase-prompt.md` Task 3, or instead of Task 3 items 1, 2 and 4.

---

## Context

SafariDesk frontend: Next.js 16 App Router in `frontend/src`, Tailwind v4, shadcn/ui, lucide-react,
`motion`, and `next-themes` for the light/dark/system mode. The colour palette lives on
`<html data-theme="…">`, with tokens in `frontend/src/app/globals.css` and the registry in
`frontend/src/lib/themes.ts`. The current palettes look too alike: most share the same cream
background and differ only in accent. Replace them with the palettes below and restyle the core
components. Read `frontend/AGENTS.md` first.

Rules:
- Components use **tokens only** (`bg-card`, `text-muted-foreground`, `bg-sidebar`, …). No hex values
  or Tailwind palette colours (`bg-amber-600`) in components.
- Only `lucide-react` icons.
- Keep everything responsive from 320px to 4K, keyboard accessible, and reduced-motion safe.
- `npx next build` must pass after each part.

## Part 1 — New theme palettes

Every pair below has been checked for WCAG contrast:
- foreground on background ≥ 14:1
- muted text on card ≥ 6.4:1
- button text on primary ≥ 5:1
- primary and accent on background/card ≥ 4.6:1
- sidebar text ≥ 10.9:1

Keep these values, or re-verify if you change any.

Each theme gets a **dark, branded sidebar in both modes**. That, plus a tinted background, is what
makes the themes look clearly different at a glance.

### Light mode

| Theme | background | card | foreground | muted-fg | primary | primary-fg | accent | border | sidebar | sidebar-fg | sidebar-active |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Savannah | `#FBF6EC` | `#FFFFFF` | `#2A2116` | `#6B5D4A` | `#B45309` | `#FFFFFF` | `#4D7C0F` | `#E8DCC4` | `#2A2116` | `#F5EBD7` | `#F59E0B` |
| Maasai Mara | `#FBF3F0` | `#FFFFFF` | `#2B1513` | `#75504A` | `#B91C1C` | `#FFFFFF` | `#1D4ED8` | `#EED7D1` | `#3B0F0F` | `#FBE9E5` | `#F87171` |
| Serengeti Dusk | `#FDF4EE` | `#FFFFFF` | `#2A1A2E` | `#6E5470` | `#C2410C` | `#FFFFFF` | `#7C3AED` | `#F0DCD0` | `#2E1A3A` | `#F8E8F0` | `#FB923C` |
| Kilimanjaro | `#F1F6FA` | `#FFFFFF` | `#0F1C2A` | `#4A5D72` | `#0369A1` | `#FFFFFF` | `#475569` | `#D6E2EC` | `#0F2537` | `#E3EEF7` | `#38BDF8` |
| Diani Coast | `#F0F8F7` | `#FFFFFF` | `#0D2624` | `#46625F` | `#0F766E` | `#FFFFFF` | `#B45309` | `#CFE6E3` | `#0B3B38` | `#E0F5F2` | `#2DD4BF` |
| Rainforest | `#F1F7F1` | `#FFFFFF` | `#12231A` | `#4B6354` | `#15803D` | `#FFFFFF` | `#A16207` | `#D3E5D6` | `#133222` | `#E2F2E6` | `#4ADE80` |

### Dark mode

| Theme | background | card | foreground | muted-fg | primary | primary-fg | accent | border | sidebar | sidebar-fg | sidebar-active |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Savannah | `#17120B` | `#211A11` | `#F5EBD7` | `#B8A88E` | `#F59E0B` | `#1A1206` | `#A3C26B` | `#3A2F20` | `#110D08` | `#F5EBD7` | `#F59E0B` |
| Maasai Mara | `#1A0C0B` | `#251311` | `#FBE9E5` | `#C9A39C` | `#F87171` | `#2B0707` | `#93C5FD` | `#452220` | `#120706` | `#FBE9E5` | `#F87171` |
| Serengeti Dusk | `#160F1C` | `#20162A` | `#F6E9F2` | `#BBA4C0` | `#FB923C` | `#2A1203` | `#C4B5FD` | `#3A2A48` | `#0F0A14` | `#F6E9F2` | `#FB923C` |
| Kilimanjaro | `#0A121B` | `#111C28` | `#E3EEF7` | `#93A8BD` | `#38BDF8` | `#04202F` | `#CBD5E1` | `#223345` | `#070D14` | `#E3EEF7` | `#38BDF8` |
| Diani Coast | `#071816` | `#0D2321` | `#DDF4F0` | `#8FB5AF` | `#2DD4BF` | `#042F2B` | `#FCD34D` | `#1B3A37` | `#041110` | `#DDF4F0` | `#2DD4BF` |
| Rainforest | `#09140E` | `#102018` | `#E2F2E6` | `#95B39F` | `#4ADE80` | `#052E16` | `#FACC15` | `#1E3828` | `#050D08` | `#E2F2E6` | `#4ADE80` |

### Derived tokens (compute in CSS with `color-mix`, don't hand-pick)

- `--muted` = mix(foreground 6%, background); `--secondary` = mix(primary 10%, card)
- `--input` = border; `--ring` = primary
- `--popover` = card; `--popover-foreground` = foreground
- `--sidebar-accent` = mix(sidebar-fg 10%, sidebar), used for the hover/active row background
- `--sidebar-border` = mix(sidebar-fg 12%, sidebar)
- `--sidebar-primary` = sidebar-active; `--sidebar-primary-foreground` = sidebar
- Elevation: `--shadow-card` is a soft warm shadow in light mode (`0 1px 2px` + `0 8px 24px -12px`
  using mix(foreground 18%, transparent)). In dark mode it is `none`, and cards get a 1px border plus
  a faint top highlight (`inset 0 1px 0` mix(foreground 6%, transparent)).
- Gradients: `--hero-from` = primary, `--hero-to` = accent, used sparingly on the brand mark, primary
  KPI and empty-state illustrations.

### Status and chart colours (shared by all themes, per mode)

| Token | Light | Dark |
|---|---|---|
| `--status-success-solid` | `#15803D` | `#4ADE80` |
| `--status-warning-solid` | `#B45309` | `#FBBF24` |
| `--status-danger-solid` | `#B91C1C` | `#F87171` |
| `--status-info-solid` | `#1D4ED8` | `#60A5FA` |
| `--status-neutral-solid` | `#64748B` | `#94A3B8` |

- Badge background = mix(solid 12%, card); badge text = solid in dark mode and
  mix(solid 85%, foreground) in light mode.
- Charts:
  - `--chart-1` = primary, `--chart-2` = accent
  - `--chart-3..5` = info, warning and neutral solids
  - Status charts (donut, stacked bars) use the `*-solid` tokens.

Update `frontend/src/lib/themes.ts` swatches to `[primary, accent, background]` for each theme. Add a
`scripts/check-contrast.mjs` that parses `globals.css` and fails if any pair above falls below its
threshold. Wire it into `npm run lint`.

## Part 2 — Component styling

Apply the shared look: `rounded-xl` cards, `rounded-lg` controls, 1px `border` borders,
`--shadow-card` elevation, a 150–200ms ease-out transition on `transform`, `opacity`, `background`
and `border-color`, and a visible focus ring (`ring-2 ring-ring ring-offset-2 ring-offset-background`).

### Cards (`components/ui/card.tsx`, `KpiCard.tsx`, chart panels)

- **Base:**
  - `bg-card border rounded-xl shadow-[var(--shadow-card)]`
  - Header: title `text-sm font-medium text-muted-foreground`, value `text-2xl/3xl font-semibold
    tabular-nums`
  - Padding: `p-4 sm:p-5 3xl:p-6`
- **Variants** (via `cva`):
  - `default`
  - `interactive`: hover lifts with `-translate-y-0.5` and a stronger shadow; the whole card is a
    link with a focus ring
  - `highlight`: a 3px top border in `primary`, used for the main KPI
  - `muted`: `bg-muted`, no shadow, for secondary info
  - `glass`: only on the landing page over photos — `bg-card/70 backdrop-blur-md border-white/10`
- **KPI card:** icon in a `size-9 rounded-lg bg-secondary text-primary` tile, delta badge (▲/▼ plus
  colour plus text), and a sparkline in `--chart-1` with a gradient fill to transparent.
- **Chart panels:** header row with title, description and actions (range toggle, CSV export in a
  `ghost` icon button with tooltip). Fixed chart heights per breakpoint so grid rows don't stretch.
  Use container queries.
- **States:** skeleton that matches the final layout, empty state (lucide icon in a soft gradient
  circle, one line plus a primary action), and an error state with retry.

### Dropdown menus, selects, popovers, command palette

- Restyle the content of shadcn `DropdownMenu`, `Select`, `Popover`, `Command` and `ContextMenu`:
  - `bg-popover text-popover-foreground border rounded-xl p-1 shadow-lg min-w-[12rem]`
  - Enter animation: fade plus `zoom-in-95` plus a slide from the trigger side (tw-animate-css),
    150ms. Disabled under reduced motion.
- **Items:**
  - Rows are `rounded-lg px-2.5 py-2 text-sm gap-2.5`, with a lucide icon `size-4
    text-muted-foreground`.
  - Highlighted row is `bg-accent/10 text-foreground`, and its icon turns `text-primary`.
  - Destructive items (Sign out, Delete) use `text-[var(--status-danger-solid)]`, with a danger-tinted
    highlight.
- **Extras:** labels as `text-xs uppercase tracking-wide text-muted-foreground px-2.5 pt-2`, separators
  `my-1 bg-border`, and right-aligned keyboard shortcuts in `kbd` style.
- **Mobile:** below `sm`, dropdowns with more than 5 items open as a bottom `Drawer` (vaul via shadcn)
  instead of a floating menu. Touch targets are ≥ 44px.
- **Select triggers:** match the input height (`h-10`), show a chevron, and a `bg-secondary` tint
  when a value is set.

### Sidebar (`components/AppShell.tsx`, shadcn `Sidebar`)

- **Look:** branded dark surface in both modes: `bg-sidebar text-sidebar-foreground`, with a subtle
  noise or topographic SVG pattern at 4% opacity (inline SVG, token-coloured).
- **Header:** brand mark (gradient `--hero-from` → `--hero-to` rounded tile with a lucide `Compass`
  or `Mountain` icon), product name, and the org/role subtitle.
- **Nav:**
  - Grouped sections (Operations, Finance, Admin) with small uppercase group labels. Items are
    filtered by role via `<Can>`.
  - Item: `h-10 rounded-lg px-3 gap-3`, icon `size-[18px]`. Hover shows `bg-sidebar-accent`.
  - **Active item:** `bg-sidebar-accent` plus a 3px left indicator bar in `sidebar-active` that
    animates between items with a shared `layoutId` (motion), and the icon turns `sidebar-active`.
  - Count badges (Alerts, Pending requests) are right-aligned pills in `sidebar-active` /
    `sidebar` colours.
- **Collapsed (icon rail, `md`–`lg`):** icons only, with tooltips on the right. The active indicator
  stays. The toggle is `⌘B` plus a button at the bottom.
- **Mobile:** off-canvas `Sheet` from the left with the same styling, closed by swipe or backdrop.
  The bottom tab bar uses the same active colour.
- **Footer:** profile block (see below) plus theme quick-switch (6 swatches) and the mode toggle
  (Sun / Moon / Monitor).

### Profile and user menu

- **Trigger (top bar right and sidebar footer):**
  - Avatar `size-9 rounded-full` with a ring in `primary` and initials fallback on a gradient.
  - Presence dot for drivers (online/offline).
  - On `lg+`, name plus role badge beside the avatar.
- **Menu content:**
  1. Header card: larger avatar, full name, email (truncated), and a role badge coloured per role
     (super_admin and admin use primary, operations info, finance success, agent accent, driver
     warning, customer neutral)
  2. Profile (`User`), Settings (`Settings`), Appearance submenu (palette swatches plus
     Light/Dark/System radio), Keyboard shortcuts (`Keyboard`), Help (`LifeBuoy`)
  3. Separator, then **Sign out** (`LogOut`, destructive style)
- **`/settings/profile` page:**
  - Two-column on `lg`, stacked on mobile.
  - Left: profile card with avatar upload (crop to square, preview, max 2MB), name, phone
    (`PhoneInput`), email (read-only with a "change" flow), role and status badges, member since,
    last sign-in.
  - Right: tabs for **Profile**, **Security** (change password with strength meter, active sessions
    list with "sign out other sessions"), **Notifications** (SMS/email toggles) and **Appearance**
    (large theme preview cards showing a mini sidebar plus card in each palette).
  - Backend: add `PATCH /api/users/me`, `POST /api/users/me/avatar` (validate type and size; store
    locally in dev, object storage later) and `GET/DELETE /api/auth/sessions`, each with tests.

### Sign out flow

- Sign out in the user menu and the mobile drawer opens a small confirm `AlertDialog` ("Sign out of
  SafariDesk?", with an extra "Sign out of all devices" checkbox). Skip the confirm when there are no
  unsaved forms.
- While signing out: a button spinner, then a full-screen fade to a minimal "Signed out — see you on
  the next safari" screen with the brand mark and a "Sign in again" button. It auto-redirects to `/`
  after 3s.
- Clear the TanStack Query cache, the socket, the `sd_role` cookie and any persisted UI state. Call
  `POST /api/auth/sign-out` (with `{ all: true }` for all devices).

### Other shared pieces in the same style

- **Buttons:** variants `default` (primary), `secondary`, `outline`, `ghost`, `destructive`, `link`;
  sizes `sm/md/lg/icon`; subtle press `scale-[.98]`; loading state with spinner and preserved width.
- **Inputs:** `h-10 rounded-lg bg-card border`, focus ring in primary, error state with a danger
  border plus message, leading icon slot.
- **Tables:** sticky header `bg-muted/60 backdrop-blur`, zebra rows at 2% foreground, row hover
  `bg-secondary`, selected row with a left primary bar; same look in the mobile card view.
- **Badges:** pill, `text-xs font-medium`, coloured per the status tokens above, optional leading dot.
- **Toasts (sonner):** `bg-popover border rounded-xl` with a status-coloured icon; positioned
  bottom-right on desktop and top-center on mobile.
- **Top bar:** `bg-background/80 backdrop-blur border-b`, sticky; search (⌘K) styled as an input with
  a `kbd` hint.

## Verification

- Screenshot Dashboard, Bookings, Payments, Settings/Profile, the open user menu, the collapsed
  sidebar and the mobile drawer in all 6 themes × light/dark at 390px and 1440px. Check that the
  themes are clearly distinguishable side by side.
- `scripts/check-contrast.mjs` passes, axe reports no serious issues, and nothing is cut off at 320px.
- Report what changed and include the screenshot grid.
