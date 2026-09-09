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

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
