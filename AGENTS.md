# Repository Guidelines

## Project Structure & Modules
- `src/server.ts` is the Hono HTTP entrypoint; depends on `config.ts` (env + TOML), `storage.ts` (SQLite/filesystem), and `workflows.ts` (routing logic). Types live in `src/types.ts`.
- `bin/zobox.ts` is the CLI shim invoked by `bunx zobox`.
- `config/zobox.config.example.toml` is the canonical profile; copy it next to your chosen `ZOBOX_BASE_DIR` and adjust.
- `db/migrations/001_init.sql` seeds the SQLite schema used in the base dir’s `db/zobox.db`.
- Specs and prompts: `SPEC.md` (service contract) and `zobox.prompt.md` (agent context).

## Setup & Local Run
- Prereq: Bun (>=1.1). Install deps with `bun install`.
- Create a base dir (defaults to `/home/workspace/Inbox`) and copy config/migration files there:
  `cp config/zobox.config.example.toml $ZOBOX_BASE_DIR/zobox.config.toml`
  `cp db/migrations/001_init.sql $ZOBOX_BASE_DIR/db/migrations/001_init.sql`
- Required env: `ZOBOX_ADMIN_API_KEY`; optional read-only: `ZOBOX_READ_API_KEY`; set `ZOBOX_BASE_DIR` when running outside the default path.
- Run locally: `bun run src/server.ts` (or `bun run dev`), listens on 8787 by default.

## Build, Test, and Development Commands
- `bun run dev` / `bun run start` — start the server.
- `bun run lint` — placeholder; prefer adding Biome or ESLint and wire this script before committing.
- `bun run test` — placeholder; add Vitest tests and update the script accordingly.

## Coding Style & Naming Conventions
- TypeScript ES2022 modules with `strict` mode on (see `tsconfig.json`).
- Prefer 2-space indentation, single quotes, and explicit return types for exported functions.
- Keep configuration-driven behavior (TOML) instead of hardcoding paths or types; avoid silent defaults—surface validation errors.
- Branches: `feat/area/slug`, `fix/area/slug`, or `fix/issue-123`.

## Testing Guidelines
- Add unit tests with Vitest; place specs beside sources as `*.test.ts`.
- Focus coverage on workflows (`src/workflows.ts`), storage paths (`src/storage.ts`), and auth handling.
- For endpoints, add lightweight integration tests using Hono’s test client once introduced.

## Commit & Pull Request Guidelines
- Use Graphite: inspect the stack with `gt log`; create commits with `gt create -m "feat: summary"`; submit via `gt submit --no-interactive`.
- `main` must stay releasable; keep branches short-lived and rebase over merge.
- Squash merge PRs; describe behavior change, testing done, and any config/env updates. Link issues when applicable.

## Security & Configuration Tips
- Never commit real API keys or base-dir contents. Add local secrets to `.env` or deployment env vars.
- Base dir layout (default): `inbox/` envelopes, `files/` attachments, `db/` for SQLite, `logs/` for access/error logs—keep paths consistent with `zobox.config.toml`.
