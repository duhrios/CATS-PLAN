# Controle de Carrinhos Chromebook

Frontend visual para edição das telas de gestão de reservas de carrinhos Chromebook, horários, bloqueios e pontos Wi-Fi.

## Run & Operate

- `pnpm --filter @workspace/controle-carrinhos run dev` — run the frontend screens
- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm --filter @workspace/mockup-sandbox run dev` — run the component preview server
- `PORT=20680 BASE_PATH=/ pnpm --filter @workspace/controle-carrinhos run build` — build the frontend
- `pnpm --filter @workspace/controle-carrinhos run typecheck` — typecheck the frontend
- No secrets or external services are required for the frontend-only preview.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/controle-carrinhos/src/App.tsx` — frontend entry and routes
- `artifacts/controle-carrinhos/src/components/app-shell.tsx` — navigation shell
- `artifacts/controle-carrinhos/src/components/app-ui.tsx` — shared visual components
- `artifacts/controle-carrinhos/src/index.css` — theme tokens and global styles

The configured Replit workflows start the frontend screens, API server, and component preview server. No database, authentication, or integrations are required for the current frontend preview.

## Architecture decisions

- Monorepo split into `artifacts/*` (deployable apps: `controle-carrinhos` frontend, `api-server`, `mockup-sandbox`) and `lib/*` (shared packages: `db`, `api-spec`, `api-client-react`, `api-zod`) — see the `pnpm-workspace` skill for the full layout.
- The API surface is spec-first: `lib/api-spec/openapi.yaml` is the source of truth, and `lib/api-client-react` / `lib/api-zod` are generated from it via Orval (`lib/api-spec/orval.config.ts`), not written by hand.
- DB schema (`lib/db/src/schema/chromebook.ts`) is defined with Drizzle ORM against PostgreSQL, but `artifacts/api-server` currently only exposes a `health` route — the schema (carts, wifi access points, reservations, day locks, activity log) is designed ahead of the endpoints that will use it.
- Reservations enforce one cart per date+period at the DB level via a unique index (`reservation_slot_cart_unique` on `scheduledDate` + `period` + `cartId`), not just in application code.
- Day-level locking (`chromebook_day_locks`) lets coordination close reservations for a given date after a cutoff time (`lockTime`, default `07:00`), tracked with `updatedBy`.
- Frontend and admin/user views share one `AppShell`; role (`admin` vs `user`) is derived from the URL prefix (`/usuario/...`) rather than a separate auth-gated app.

## Product

Controle de Carrinhos Chromebook is the module of Registro-CATS for scheduling shared Chromebook carts and Wi-Fi access points across a school. It currently covers, per the routes in `App.tsx`:

- **Overview** (`/`) — dashboard view of the day's cart/reservation status.
- **Reservations** (`/reservas`, `/usuario/reservas`) — teachers book a cart for a date/period/class; admins see all bookings.
- **Carts** (`/carrinhos`) — manage the physical Chromebook carts (status, battery, location, linked Wi-Fi point).
- **Rooms** (`/salas`) — room directory used to place carts and access points.
- **Wi-Fi** (`/wifi`) — track access point status/signal per room, each optionally linked to a cart.
- **History** (`/historico`) — activity log (who did what, when).
- **Teacher profile/login** (`/professores`, `/login`, `/usuario/perfil`) — teacher-facing identity, separate from the admin view.

The current build is a frontend-only preview (no live database or auth yet); the API server and DB schema exist but aren't wired to real endpoints beyond `health`.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- `artifacts/api-server` only has a `health` route today — don't assume carts/reservations/wifi endpoints exist yet; the frontend is currently running against mock/local data, not this API.
- `lib/api-client-react` and `lib/api-zod` are generated from `lib/api-spec/openapi.yaml` — edit the OpenAPI spec and re-run Orval, don't hand-edit the generated client/zod files.
- Reservation slots are unique per (date, period, cart) at the DB level — a duplicate booking attempt will fail on the unique index, not just a UI check.
- `pnpm-workspace.yaml` enforces a 1-day (`minimumReleaseAge: 1440`) delay before new npm package versions can be installed, as a supply-chain defense — don't lower or remove this; use `minimumReleaseAgeExclude` only for trusted `@replit/*` packages if an urgent fix is needed.
- Must use `pnpm` — the root `preinstall` script actively blocks `npm`/`yarn`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
