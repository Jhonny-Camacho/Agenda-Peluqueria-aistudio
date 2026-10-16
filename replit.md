# Agenda de peluquería

Reservas públicas sin cuenta y gestión compartida de citas, horarios, bloqueos e inventario para una peluquería.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/agenda-peluqueria run dev` — run the web app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/agenda-peluqueria run typecheck` — web app typecheck
- `pnpm --filter @workspace/api-server run typecheck` — API typecheck
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL`, `SALON_OWNER_EMAIL`; Clerk keys are provisioned through Replit Auth.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/agenda-peluqueria` — responsive booking, daily agenda, inventory, team, and schedule UI.
- `artifacts/api-server` — API routes, Clerk proxy, and role checks.
- `lib/db/src/schema/salon.ts` — PostgreSQL source of truth for salon data.
- `lib/api-spec/openapi.yaml` — API contract and generated client/schema source.

## Architecture decisions

- Appointment and block creation share a PostgreSQL advisory lock by stylist and date to prevent overlapping bookings.
- Business records are shared in PostgreSQL; small interface preferences such as alert sound are stored in the browser.
- Clerk authenticates accounts; verified emails in the salon team table grant app roles, and the API enforces owner-only actions.
- The API idempotently adds the initial owner and demo catalog, stylists, inventory, and sample appointments to an empty database.

## Product

- Clients choose a service, stylist, date, and available time and book without an account.
- The team shares a daily appointment list, filters by stylist/status, records offline bookings, and receives new-booking alerts.
- The owner manages schedule blocks, stylist hours, team access, and retail product stock.
- Spanish text and appointment times use the `America/La_Paz` timezone.

## User preferences

- Keep public bookings account-free; protect owner and operator tools with sign-in and role-based access.

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
