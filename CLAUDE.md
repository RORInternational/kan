# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Relationship to AGENTS.md

`AGENTS.md` in this repo is the authoritative source for **coding conventions** (naming, layer-by-layer style rules, soft deletes, activity logging, commit format). Read it — do not duplicate it here.

This file covers what AGENTS.md omits: commands (especially tests), the cross-cutting architecture, and a few places where AGENTS.md has drifted from the code.

`TASK-AGENT.md` is a third, unrelated document: the conventions an agent needs to drive our own live board over MCP (labels are outcomes, every card needs an assignee, and so on). It is not about this codebase and is not read by Claude Code here — it gets copied into whatever project a teammate points Codex at.

### Known drift in AGENTS.md

- It says to check workspace access with `assertUserInWorkspace`. The codebase has largely moved to the permission system: `assertPermission` (72 call sites) vs `assertUserInWorkspace` (3). Use `assertPermission(db, userId, workspaceId, "resource:action")` from `packages/api/src/utils/permissions.ts` for new procedures; `assertCanManageRole` additionally guards role escalation.
- It documents no test commands and does not mention `packages/mcp` or `packages/logger`.

## Commands

Root scripts are Turbo passthroughs and run across all workspaces:

```bash
pnpm dev              # all services (turbo watch)
pnpm dev:next         # web app + its deps only
pnpm lint             # required before committing
pnpm typecheck        # required before committing
pnpm format:fix
pnpm db:migrate       # apply migrations
pnpm db:studio        # Drizzle Studio
```

### Tests

There is **no root `test` script and no `test` task in `turbo.json`** — `pnpm test` at the root does nothing. Tests are per-package, and only `@kan/web`, `@kan/api`, and `@kan/auth` have them:

```bash
pnpm -F @kan/api test          # all api tests (unit + integration)
pnpm -F @kan/web test
pnpm -F @kan/auth test
pnpm -F @kan/api test:watch    # web and api only
```

Run a single test file, or filter by test name:

```bash
pnpm -F @kan/api test src/routers/board-move.test.ts
pnpm -F @kan/api test -- -t "throws UNAUTHORIZED when user is not authenticated"
```

A positional file path passes through fine, but **flags need the `--` separator** — `pnpm ... test -t "name"` without it silently swallows the filter and runs the whole suite instead.

Integration tests need **no external Postgres**. `packages/api/integration-tests/test-db.ts` spins up an in-memory PGlite instance per call, applies the real migrations from `packages/db/migrations`, and seeds a workspace/user — so `createTestDb()` gives you a fresh isolated DB. Note it resolves the migrations folder relative to the repo root, so run these via the package filter from the root rather than `cd`-ing in.

Both vitest configs alias `@kan/db` straight to `../db/src`; new test-bearing packages need the same alias or imports will fail.

### Migrations

Never edit an existing migration. Generate, then apply:

```bash
cd packages/db && pnpm drizzle-kit generate --name "AddFieldToTable"
pnpm db:migrate
```

## Architecture

### One router, three transports

The single most important thing to understand: `appRouter` in `packages/api/src/root.ts` is consumed three different ways, so **a change to one tRPC procedure ripples into the REST API, the OpenAPI spec, and the MCP server at once.**

1. **tRPC** — `apps/web/src/pages/api/trpc/[trpc].ts`, context via `createTRPCContext`. Superjson transformer, so Dates survive the wire.
2. **REST** — `apps/web/src/pages/api/v1/[...trpc].ts` wraps the same router in `trpc-to-openapi`'s handler with `createRESTContext`, behind `withRateLimit({points: 100, duration: 60})` and CORS. A procedure is only reachable over REST if it declares `.meta({ openapi: { method, path, tags, protect } })`. The spec is generated at `/api/v1/openapi.json` from `packages/api/src/openapi.ts`.
3. **MCP** — `packages/mcp` is a standalone stdio server that talks to that REST surface over HTTP.

The three contexts (`createTRPCContext`, `createNextApiContext`, `createRESTContext`) are near-identical but differ meaningfully: only `createRESTContext` swallows session-lookup errors and treats them as unauthenticated, and each stamps `transport` (`"trpc"` | `"rest"`) plus a `requestId` used by the logging middleware.

Procedure builders in `packages/api/src/trpc.ts`: `publicProcedure`, `protectedProcedure` (adds auth guard), `adminProtectedProcedure` (gated on the `x-admin-api-key` header matching `KAN_ADMIN_API_KEY`). All include `loggingMiddleware`, which logs input, duration, and a TRPC-code→HTTP-status mapping; it only logs user email when `NEXT_PUBLIC_KAN_ENV === "cloud"`.

### packages/mcp

A thin, dependency-light MCP server published as `@kan/mcp` — the only non-private package in the monorepo. It does **not** import `@kan/api` or the database; it is a pure HTTP client, which is why it can be `npx`'d against any remote Kan instance.

- `src/client.ts` — `kanRequest(method, path, body)`, reads `KAN_BASE_URL` and `KAN_API_TOKEN` from env at call time (not module load), targets `{baseUrl}/api/v1{path}`, throws `KanApiError` on non-2xx.
- `src/tools/*.ts` — one `register*Tools(server)` per resource, each registering tools via `server.tool(name, description, zodShape, handler)` and returning `{ content: [{ type: "text", text: JSON.stringify(data, null, 2) }] }`. 46 tools total across workspace, board, list, card, checklist, label, member.
- `src/index.ts` — instantiates `McpServer`, calls each registrar, connects `StdioServerTransport`.

Adding a tool means: ensure the underlying tRPC procedure has `openapi` meta (or it has no REST endpoint to call), then add a `server.tool(...)` in the matching resource file. The tool count in `README.md` is stated explicitly and goes stale.

Build emits to `dist/` via `tsc` overrides (`pnpm -F @kan/mcp build`); the package ships only `dist` and exposes the `kan-mcp` bin.

### Package graph

`apps/web` → `@kan/api` → `@kan/db` (Drizzle schema + `*.repo.ts` repositories) and `@kan/auth` (Better Auth). `@kan/shared` holds roles/permissions used by both API and web. `@kan/logger` is the mandated logging entry point (`createLogger("module-name")`) — `console.log` is disallowed.

`@kan/api` exports via explicit subpath exports (`./root`, `./trpc`, `./types`, `./openapi`, `./utils/rateLimit`) pointing at **source** `.ts`, not build output, so there is no build step between API edits and web consumption.

## Environment

`.env` lives at the repo root and is loaded per-package by a `with-env` script (`dotenv -e ../../.env --`). Packages do not have their own `.env`.

Adding a new env var requires updating five files — see the checklist in AGENTS.md.

Note: AGENTS.md and `apps/web/package.json` pin the web app to port `3333`, and the docs app uses `3001`.

### Tailscale HTTPS development

Kan runs locally on loopback and is exposed securely to the tailnet through Tailscale Serve:

```bash
pnpm dev
tailscale serve --bg --https=3333 http://127.0.0.1:3333
tailscale serve status
```

Use `https://dnd-ms-2s-mac-studio.tail6f8395.ts.net:3333`. Keep
`NEXT_PUBLIC_BASE_URL` in the root `.env` set to this HTTPS URL; Better Auth and
the root redirect depend on it. Do not bind the web server to `0.0.0.0:3333`:
Tailscale Serve owns the tailnet listener and proxies to `127.0.0.1:3333`.
