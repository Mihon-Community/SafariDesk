# RBAC — exact access, necessity and data scope

This is the authoritative, human-readable companion to
`frontend/src/lib/permissions.ts` and `backend/src/auth/permissions.ts`. The two
code maps are kept in sync by `backend/tests/permissions.sync.test.ts`; this
document explains **why** each grant exists and **what data** a role may see.

## Permission → route map

| Route | Required permission | Who can open it |
|---|---|---|
| `/dashboard` | `reports:read` | super_admin, admin, operations, finance |
| `/bookings`, `/bookings/new` | `bookings:read` / `bookings:write` | sup, admin, operations, dispatcher, agent, driver (read), customer (read) |
| `/dispatch` | `dispatch:read` | super_admin, admin, operations, dispatcher, driver |
| `/driver` | `dispatch:read` | super_admin, admin, operations, dispatcher, driver |
| `/payments` | `payments:read` | super_admin, admin, operations, finance, customer |
| `/alerts` | `alerts:read` | super_admin, admin, operations, dispatcher |
| `/rates` | `rates:read` | super_admin, admin, finance, agent |
| `/feedback` | `feedback:read` | super_admin, admin, operations, finance, agent |
| `/users` | `users:read` (`users:manage` to change) | super_admin, admin |
| `/audit` | `audit:read` | super_admin only |
| `/my-trips` | `concierge:use` | super_admin, admin, agent, customer |
| `/settings` | signed in; `settings:manage` for system controls | everyone appearance; super_admin system card |

`src/proxy.ts` enforces the route prefix check as a UX guard; every API route
re-checks the permission server-side. The backend is the source of truth.

## Role matrix

| Role | Permissions | Necessary? | Data it may see |
|---|---|---|---|
| **super_admin** | every operational permission + `audit:read` + `settings:manage` | Yes — one break-glass owner for users, roles, settings and the audit trail. Never offered at public signup. | Everything, including all audit entries and system settings. |
| **admin** | all operational permissions (bookings, dispatch, drivers, vehicles, payments incl. mark/refund, rates write, feedback, alerts, reports, users, invites, concierge, itinerary) | Yes — day-to-day operator who runs the whole desk, but must not erase evidence (`audit:read` withheld) or change protected settings. | All bookings, payments, users, assignments, reports. No audit log. |
| **operations** | bookings read/write, dispatch read/write, drivers+vehicles read/write, payments **read**, alerts read/write, feedback read, reports read, itinerary read | Yes — allocates trips and needs deposit status, but must not mark/refund money or manage users. | All bookings and assignments; payment status only (no refund controls). |
| **dispatcher** | bookings read, dispatch read/write, drivers+vehicles read/write, alerts read/write, itinerary read | Yes — dispatch desk. `payments:read` was removed as unnecessary for this role. | All bookings and assignments; no money views. |
| **finance** | bookings read, payments read/mark/refund, rates read, feedback read, reports read | Yes — reconciles M-Pesa and issues refunds; no dispatch or user management. | All bookings and payments, revenue reports; no assignments. |
| **agent** | bookings read/write, rates read, feedback read/write, concierge use, itinerary read | Yes — sells and edits quotes; no access to money, dispatch or users. | All bookings it needs to quote; rates; feedback. No payments. |
| **driver** | dispatch read, bookings read, itinerary read (`drivers:read` removed as unnecessary) | Yes — needs today's trips and status buttons, not the roster or prices. | **Only bookings assigned to that driver**, without `total`, `depositDue` or `quoteBreakdown`. |
| **customer** | bookings read, payments read, feedback write, concierge use, itinerary read | Yes — tracks own safari and pays deposits. | **Only own bookings and own payments**; cannot see other guests, staff rosters, reports or audit. |

Staff roles requested at public signup are stored as `role=customer,
status=pending, requested_role=<staff role>` until an admin approves them; the
approval and rejection are written to the audit trail.

## Where scoping is enforced today

- Dev/MSW (`frontend/src/mocks/handlers.ts`) gates `/api/bookings`,
  `/api/payments`, `/api/analytics/*` and `/api/users` by permission, and scopes
  bookings/payments to the signed-in customer or driver. Driver bookings have
  money fields stripped. Audit writes happen on sign-in, sign-up, approvals,
  role changes, password resets and invites.
- `src/proxy.ts` applies the route table above with the non-sensitive `sd_role`
  cookie. `next` deep links are honoured only inside the role's own home.
- **When the Express business routers replace the empty stubs
  (`backend/src/routes/{bookings,payments,analytics,assignments}.ts`), the same
  permission + owner-scope checks must be applied there** — the mock layer is
  only the development stand-in. A role check in the UI is never sufficient.
