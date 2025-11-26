# Development Setup

This guide covers local development, migrations, testing, and releases for Zobox.

## Prerequisites
- Bun >= 1.1 (includes SQLite)
- npm (only for publishing)

## Install dependencies
```bash
bun install
```

## Base directory & config
`bunx zobox init` creates everything you need under `--base-dir`:
- directories: `inbox/`, `files/`, `db/`, `db/migrations/`, `logs/`
- copies example configs: `zobox.config.toml`, `destinations.json`
- runs all migrations (including `003_api_keys.sql`)
- generates/stores API keys if none exist (hashed in SQLite); generated keys are shown once

Run it:
```bash
bunx zobox init --base-dir /home/workspace/Inbox --port 8787
# Optional: provide keys instead of generating
# bunx zobox init --base-dir ... --admin-key YOUR_ADMIN --read-key YOUR_READ
```
Re-running `init` is idempotent; it keeps existing keys and migrations.

## Running the server
```bash
# after init
bunx zobox serve --base-dir /home/workspace/Inbox --port 8787

# or dev mode
bun run dev
```

## Migrations only (existing base dir)
```bash
bunx zobox migrate --base-dir /home/workspace/Inbox
```

## Testing & linting
```bash
bun run test     # vitest suite (fast, ~327 tests)
bun run lint     # biome check
```
Pre-push hooks run `lint` and `test`; they’re installed via `bun install` (`lefthook`).

## Release workflow
1) Add a changeset for code changes:
   ```bash
   bunx changeset
   ```
2) Version bump:
   ```bash
   bun run version   # applies changesets, updates changelog/version
   ```
3) Publish (already done for 0.1.1):
   ```bash
   npm publish --access public
   ```
4) Tag:
   ```bash
   git tag vX.Y.Z && git push origin vX.Y.Z
   ```

## Useful commands
```bash
# Start + auth header examples
curl -H "x-api-key: ADMIN" http://localhost:8787/health
curl -X POST http://localhost:8787/messages \
  -H "content-type: application/json" \
  -H "x-api-key: ADMIN" \
  -d '{"type":"demo","payload":{"hello":"world"}}'
```
