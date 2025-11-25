# Zobox Monorepo Migration Plan

> **Status:** Draft
> **Created:** 2025-11-25
> **Target:** v0.2.0

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current State Analysis](#2-current-state-analysis)
3. [Target Architecture](#3-target-architecture)
4. [Dependencies](#4-dependencies)
5. [Migration Phases](#5-migration-phases)
6. [File Specifications](#6-file-specifications)
7. [CLI Command Reference](#7-cli-command-reference)
8. [Validation Checklist](#8-validation-checklist)
9. [Risks & Mitigations](#9-risks--mitigations)
10. [Open Questions](#10-open-questions)

---

## 1. Executive Summary

### Goal

Transform Zobox from a flat TypeScript project into a Turborepo monorepo with clear separation between:

- **`packages/core`** — Server, storage, configuration, routing (internal)
- **`packages/api`** — Typed HTTP client/SDK for agents (internal)
- **`apps/cli`** — Commander.js-based CLI, published as `zobox` on npm
- **`apps/web`** — Admin dashboard (placeholder for future)

### Why

1. **Agent-friendly CLI** — Commander.js provides structured `--help` output that Zo agents can discover and parse
2. **Reusable SDK** — `packages/api` becomes the canonical way for agents and web to interact with Zobox
3. **Scalable structure** — Clear package boundaries enable parallel development and testing
4. **CI optimization** — Turborepo's caching dramatically speeds up builds and tests

### Success Criteria

- [ ] `bunx zobox init` works identically to current behavior
- [ ] `bunx zobox serve` starts the server
- [ ] `zobox --help` shows structured command tree
- [ ] `zobox keys --help` shows subcommand help
- [ ] All 328 existing tests pass
- [ ] Turborepo caches work locally and in CI
- [ ] Clean npm publish of CLI package

---

## 2. Current State Analysis

### Directory Structure (Current)

```
zobox/
├── bin/
│   └── zobox.ts              # CLI entry point (ad-hoc arg parsing)
├── src/
│   ├── server.ts             # Hono HTTP server
│   ├── storage.ts            # SQLite + filesystem operations
│   ├── config.ts             # TOML config loading
│   ├── types.ts              # Shared types
│   ├── errors.ts             # Error classes
│   ├── schemas.ts            # Zod schemas
│   ├── logger.ts             # Structured logging
│   ├── health.ts             # Health check endpoints
│   ├── middleware.ts         # Auth, logging middleware
│   ├── sorters.ts            # Sorter logic
│   ├── handlers/
│   │   └── messages.ts       # POST /messages handler
│   ├── routing/
│   │   └── destinations.ts   # HTTP routing to destinations
│   ├── sorters/
│   │   └── attachments.ts    # Attachment processing
│   ├── storage/
│   │   └── tags.ts           # Tag operations
│   └── utils/
│       └── json.ts           # JSON utilities
├── config/
│   ├── zobox.config.example.toml
│   └── destinations.example.json
├── db/
│   └── migrations/
│       ├── 001_init.sql
│       └── 002_rename_consumer_to_subscriber.sql
├── docs/                     # Documentation
├── .changeset/               # Changesets config
├── package.json
├── tsconfig.json
├── biome.jsonc
└── lefthook.yml
```

### Current Dependencies

```json
{
  "dependencies": {
    "@hono/node-server": "^1.12.0",
    "hono": "^4.4.0",
    "toml": "^3.0.0",
    "zod": "^4.1.12"
  },
  "devDependencies": {
    "@biomejs/biome": "2.3.7",
    "@changesets/cli": "^2.29.7",
    "@types/bun": "^1.3.3",
    "@types/node": "^22.0.0",
    "lefthook": "2.0.4",
    "typescript": "^5.6.0",
    "ultracite": "6.3.5",
    "vitest": "^4.0.13"
  }
}
```

### Current CLI Commands

| Command | Description |
|---------|-------------|
| `zobox init` | Initialize directories, copy configs, run migrations, start server |
| `zobox serve` | Start the HTTP server |
| `zobox migrate` | Run database migrations |
| `zobox help` | Show help |

### Pain Points

1. **Ad-hoc CLI** — Manual argument parsing, no structured help
2. **Flat structure** — All code in `src/`, hard to identify public API
3. **No SDK** — Agents must construct HTTP requests manually
4. **Single package** — Can't version/publish components separately
5. **No build caching** — Full test/lint runs every time

---

## 3. Target Architecture

### Directory Structure (Target)

```
zobox/
├── turbo.json                           # Turborepo configuration
├── package.json                         # Workspace root
├── tsconfig.json                        # Base TypeScript config
├── biome.jsonc                          # Shared Biome config
├── lefthook.yml                         # Git hooks
├── .changeset/
│   └── config.json
│
├── apps/
│   ├── cli/                             # Published: "zobox"
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── bin/
│   │   │   └── zobox.ts                 # Shebang entry point
│   │   └── src/
│   │       ├── index.ts                 # Commander setup
│   │       ├── commands/
│   │       │   ├── init.ts              # zobox init
│   │       │   ├── serve.ts             # zobox serve
│   │       │   ├── migrate.ts           # zobox migrate
│   │       │   ├── keys/
│   │       │   │   ├── index.ts         # zobox keys
│   │       │   │   ├── list.ts          # zobox keys list
│   │       │   │   ├── create.ts        # zobox keys create
│   │       │   │   ├── rotate.ts        # zobox keys rotate
│   │       │   │   └── revoke.ts        # zobox keys revoke
│   │       │   └── messages/
│   │       │       ├── index.ts         # zobox messages
│   │       │       ├── list.ts          # zobox messages list
│   │       │       ├── get.ts           # zobox messages get
│   │       │       └── delete.ts        # zobox messages delete
│   │       └── utils/
│   │           ├── output.ts            # Formatting helpers
│   │           └── errors.ts            # CLI error handling
│   │
│   └── web/                             # Private: "@zobox/web"
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           └── index.ts                 # Placeholder
│
├── packages/
│   ├── core/                            # Private: "@zobox/core"
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts                 # Public exports
│   │       ├── server.ts                # Hono server
│   │       ├── storage.ts               # SQLite + filesystem
│   │       ├── config.ts                # TOML loading
│   │       ├── types.ts                 # Shared types
│   │       ├── errors.ts                # Error classes
│   │       ├── schemas.ts               # Zod schemas
│   │       ├── logger.ts                # Structured logging
│   │       ├── health.ts                # Health checks
│   │       ├── middleware.ts            # Auth middleware
│   │       ├── sorters.ts               # Sorter logic
│   │       ├── init.ts                  # NEW: Initialization logic
│   │       ├── handlers/
│   │       │   └── messages.ts
│   │       ├── routing/
│   │       │   └── destinations.ts
│   │       ├── sorters/
│   │       │   └── attachments.ts
│   │       ├── storage/
│   │       │   └── tags.ts
│   │       └── utils/
│   │           └── json.ts
│   │
│   └── api/                             # Private: "@zobox/api"
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts                 # Public exports
│           ├── client.ts                # ZoboxClient class
│           ├── types.ts                 # API types (request/response)
│           └── endpoints/
│               ├── messages.ts          # Messages API
│               ├── keys.ts              # Keys API (future)
│               └── health.ts            # Health API
│
├── config/                              # Shared configs (copied on init)
│   ├── zobox.config.example.toml
│   └── destinations.example.json
│
├── db/                                  # Shared migrations
│   └── migrations/
│       ├── 001_init.sql
│       └── 002_rename_consumer_to_subscriber.sql
│
└── docs/                                # Documentation
```

### Package Relationships

```
┌─────────────────────────────────────────────────────────────┐
│                        apps/cli                              │
│                    (Published: zobox)                        │
│                                                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │    init     │    │    serve    │    │    keys     │     │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘     │
└─────────┼──────────────────┼──────────────────┼─────────────┘
          │                  │                  │
          ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────────────┐
│                      packages/core                           │
│                  (Private: @zobox/core)                      │
│                                                              │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐           │
│  │ server  │ │ storage │ │ config  │ │  init   │           │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘           │
└─────────────────────────────────────────────────────────────┘
          ▲                                     │
          │                                     │
          │              ┌──────────────────────┘
          │              ▼
┌─────────────────────────────────────────────────────────────┐
│                      packages/api                            │
│                  (Private: @zobox/api)                       │
│                                                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │ ZoboxClient │    │  messages   │    │    keys     │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
└─────────────────────────────────────────────────────────────┘
          ▲                  ▲
          │                  │
┌─────────┴──────────────────┴────────────────────────────────┐
│                       apps/web                               │
│                  (Private: @zobox/web)                       │
│                                                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │  Dashboard  │    │  Messages   │    │    Keys     │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

### Import Paths

```typescript
// apps/cli/src/commands/serve.ts
import { startServer, loadConfig } from "@zobox/core";

// apps/cli/src/commands/messages/list.ts
import { ZoboxClient } from "@zobox/api";

// apps/web/src/pages/messages.tsx
import { ZoboxClient } from "@zobox/api";
import type { MessageEnvelope } from "@zobox/core/types";
```

---

## 4. Dependencies

### New Dependencies

#### CLI (`apps/cli`)

| Package | Version | Purpose |
|---------|---------|---------|
| `commander` | `^12.1.0` | CLI framework with subcommand support |
| `@commander-js/extra-typings` | `^12.1.0` | Full TypeScript inference for Commander |
| `picocolors` | `^1.1.0` | Terminal colors (3x smaller than chalk) |
| `ora` | `^8.1.0` | Elegant terminal spinners |
| `ms` | `^2.1.3` | Parse human time strings ("5m", "1h") |

#### Core (`packages/core`)

| Package | Version | Purpose |
|---------|---------|---------|
| `type-fest` | `^4.26.0` | Utility types (Simplify, SetRequired, etc.) |
| `nanoid` | `^5.0.8` | Secure ID generation (URL-safe) |
| `argon2` | `^0.41.1` | Password/key hashing (for API keys) |

#### API (`packages/api`)

| Package | Version | Purpose |
|---------|---------|---------|
| `ky` | `^1.7.2` | Lightweight fetch wrapper with retries |

#### Build (`root`)

| Package | Version | Purpose |
|---------|---------|---------|
| `turbo` | `^2.3.0` | Monorepo build system |
| `tsup` | `^8.3.5` | Fast TypeScript bundler (optional, for publishing) |

### Dependency Justifications

#### type-fest

Provides utility types that improve code clarity and reduce boilerplate:

```typescript
import type { Simplify, SetRequired, JsonValue, Promisable } from "type-fest";

// Before: Complex intersection types show ugly in IDE
type Config = BaseConfig & { required: true } & Overrides;

// After: Clean, simplified type display
type Config = Simplify<BaseConfig & { required: true } & Overrides>;

// SetRequired: Make specific keys required
type CreateMessageInput = SetRequired<MessageInput, "type" | "payload">;

// JsonValue: Type-safe JSON serialization
function serialize(value: JsonValue): string;

// Promisable: Accept sync or async
function process(data: Promisable<Data>): Promise<Result>;
```

#### picocolors vs chalk

```
picocolors: 2.6 KB (no dependencies)
chalk:      44 KB (with dependencies)
```

Both provide the same API for terminal colors. Picocolors is sufficient for our needs.

#### ky vs axios vs node-fetch

```
ky:          8 KB  (fetch-based, retries, hooks, small)
axios:      400 KB (large, many features we don't need)
node-fetch:  25 KB (just fetch polyfill, no extras)
```

ky provides retry logic and request/response hooks out of the box, perfect for an SDK.

#### argon2 vs bcrypt

Argon2 is the modern choice:
- Winner of Password Hashing Competition (2015)
- Memory-hard (resistant to GPU attacks)
- Recommended by OWASP
- Native Bun support

### Removed Dependencies

None — all existing dependencies are still needed.

### Dependency Graph

```
zobox (workspace root)
├── turbo
├── @changesets/cli
├── @biomejs/biome
├── lefthook
├── typescript
├── ultracite
└── vitest

apps/cli
├── @zobox/core (workspace:*)
├── @zobox/api (workspace:*)
├── commander
├── @commander-js/extra-typings
├── picocolors
├── ora
└── ms

packages/core
├── hono
├── @hono/node-server
├── zod
├── toml
├── type-fest
├── nanoid
└── argon2

packages/api
├── @zobox/core (workspace:*) [types only]
├── ky
└── zod
```

---

## 5. Migration Phases

### Phase 0: Preparation (Pre-Migration)

**Duration:** ~30 minutes
**Risk:** None

#### 0.1 Create Migration Branch

```bash
git checkout -b feat/monorepo-migration
```

#### 0.2 Document Current State

Capture current test count and behavior:

```bash
bun test --run 2>&1 | tee .agents/plans/monorepo/baseline-tests.txt
bunx zobox help > .agents/plans/monorepo/baseline-help.txt
```

#### 0.3 Verify Clean Working State

```bash
git status  # Should be clean
bun run lint
bun run test
```

---

### Phase 1: Turborepo Setup

**Duration:** ~1 hour
**Risk:** Low

#### 1.1 Install Turbo

```bash
bun add -d turbo
```

#### 1.2 Create turbo.json

Create `turbo.json` at workspace root:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "ui": "tui",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"],
      "cache": false
    },
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

#### 1.3 Update Root package.json

```json
{
  "name": "zobox-monorepo",
  "private": true,
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "lint": "turbo run lint",
    "test": "turbo run test",
    "typecheck": "turbo run typecheck",
    "format": "biome format --write .",
    "check": "biome check --write .",
    "prepare": "lefthook install",
    "changeset": "changeset",
    "version": "changeset version",
    "release": "turbo run build && changeset publish"
  },
  "devDependencies": {
    "@biomejs/biome": "2.3.7",
    "@changesets/cli": "^2.29.7",
    "lefthook": "2.0.4",
    "turbo": "^2.3.0",
    "typescript": "^5.6.0",
    "ultracite": "6.3.5"
  }
}
```

#### 1.4 Create Directory Structure

```bash
mkdir -p apps/cli/src/commands/{keys,messages}
mkdir -p apps/cli/bin
mkdir -p apps/web/src
mkdir -p packages/core/src/{handlers,routing,sorters,storage,utils}
mkdir -p packages/api/src/endpoints
```

#### 1.5 Verify Turbo Works

```bash
bunx turbo --version
bunx turbo run build --dry-run
```

---

### Phase 2: packages/core Migration

**Duration:** ~2 hours
**Risk:** Medium (moving files can break imports)

#### 2.1 Create packages/core/package.json

```json
{
  "name": "@zobox/core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "import": "./src/index.ts"
    },
    "./types": {
      "types": "./src/types.ts",
      "import": "./src/types.ts"
    }
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "biome check src/",
    "test": "vitest run"
  },
  "dependencies": {
    "@hono/node-server": "^1.12.0",
    "argon2": "^0.41.1",
    "hono": "^4.4.0",
    "nanoid": "^5.0.8",
    "toml": "^3.0.0",
    "type-fest": "^4.26.0",
    "zod": "^4.1.12"
  },
  "devDependencies": {
    "@types/bun": "^1.3.3",
    "@types/node": "^22.0.0",
    "vitest": "^4.0.13"
  }
}
```

#### 2.2 Create packages/core/tsconfig.json

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "composite": true,
    "declarationMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

#### 2.3 Move Source Files

```bash
# Move all src files to packages/core/src
mv src/*.ts packages/core/src/
mv src/handlers packages/core/src/
mv src/routing packages/core/src/
mv src/sorters packages/core/src/
mv src/storage packages/core/src/
mv src/utils packages/core/src/

# Keep config and db at root (shared resources)
# config/ stays at root
# db/ stays at root
```

#### 2.4 Create packages/core/src/index.ts

```typescript
// Server
export { startServer } from "./server.js";
export { createApp } from "./server.js";

// Storage
export { initStorage, type Storage } from "./storage.js";

// Config
export { loadConfig, type ZoboxConfig } from "./config.js";

// Initialization
export { initZobox, ensureDir, copyMigrations } from "./init.js";

// Types
export type {
  MessageEnvelope,
  MessageView,
  NewMessageInput,
  StoredAttachment,
  AttachmentInput,
  Channel,
  Subscriber,
} from "./types.js";

// Schemas
export {
  MessageEnvelopeSchema,
  NewMessageInputSchema,
  AttachmentInputSchema,
} from "./schemas.js";

// Errors
export {
  ZoboxError,
  ValidationError,
  NotFoundError,
  AuthError,
  ConfigError,
  StorageError,
} from "./errors.js";

// Logger
export { createLogger, type Logger } from "./logger.js";

// Health
export { checkHealth, type HealthStatus } from "./health.js";
```

#### 2.5 Create packages/core/src/init.ts

Extract initialization logic from CLI:

```typescript
import { existsSync, mkdirSync, copyFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { loadConfig } from "./config.js";
import { initStorage } from "./storage.js";
import { createLogger } from "./logger.js";

const logger = createLogger("init");

export function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    logger.info(`Created directory: ${dir}`);
  }
}

export function copyIfMissing(src: string, dest: string): boolean {
  if (!existsSync(dest)) {
    if (existsSync(src)) {
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(src, dest);
      logger.info(`Created file: ${dest}`);
      return true;
    }
    logger.warn(`Source not found: ${src}`);
    return false;
  }
  return false;
}

export function copyMigrations(srcDir: string, destDir: string): void {
  if (!existsSync(srcDir)) {
    logger.warn(`Migrations source not found: ${srcDir}`);
    return;
  }
  ensureDir(destDir);
  const files = readdirSync(srcDir).filter((f) => f.endsWith(".sql"));
  for (const file of files) {
    copyIfMissing(join(srcDir, file), join(destDir, file));
  }
}

export interface InitOptions {
  baseDir: string;
  pkgRoot: string;
}

export async function initZobox(options: InitOptions): Promise<void> {
  const { baseDir, pkgRoot } = options;

  logger.info(`Initializing Zobox in ${baseDir}`);

  // Create directory structure
  ensureDir(baseDir);
  ensureDir(join(baseDir, "inbox"));
  ensureDir(join(baseDir, "files"));
  ensureDir(join(baseDir, "db"));
  ensureDir(join(baseDir, "db", "migrations"));
  ensureDir(join(baseDir, "logs"));

  // Copy example configs
  copyIfMissing(
    join(pkgRoot, "config", "zobox.config.example.toml"),
    join(baseDir, "zobox.config.toml")
  );
  copyIfMissing(
    join(pkgRoot, "config", "destinations.example.json"),
    join(baseDir, "destinations.json")
  );

  // Copy migrations
  copyMigrations(
    join(pkgRoot, "db", "migrations"),
    join(baseDir, "db", "migrations")
  );

  // Run migrations
  const config = loadConfig(baseDir);
  initStorage(config);

  logger.info("Initialization complete");
}
```

#### 2.6 Update Internal Imports

All imports within packages/core need to use `.js` extension:

```typescript
// Before
import { ZoboxError } from "../errors";

// After
import { ZoboxError } from "../errors.js";
```

Run a find-and-replace or use a script:

```bash
# In packages/core/src
find . -name "*.ts" -exec sed -i '' 's/from "\.\.\//from "..\//' {} \;
find . -name "*.ts" -exec sed -i '' 's/from "\.\/\([^"]*\)"/from ".\/\1.js"/g' {} \;
```

#### 2.7 Move Tests

```bash
# Move test files alongside source files
mv packages/core/src/*.test.ts packages/core/src/
# Tests stay next to their source files
```

#### 2.8 Verify Core Package

```bash
cd packages/core
bun install
bun run typecheck
bun run test
```

---

### Phase 3: apps/cli Setup

**Duration:** ~2 hours
**Risk:** Medium

#### 3.1 Create apps/cli/package.json

```json
{
  "name": "zobox",
  "version": "0.1.0",
  "description": "Zo-native inbox + sorter + router engine.",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/galligan/zobox.git",
    "directory": "apps/cli"
  },
  "homepage": "https://github.com/galligan/zobox#readme",
  "keywords": ["zo", "inbox", "router", "sorter", "bun", "zobox", "cli"],
  "engines": {
    "bun": ">=1.1.0"
  },
  "type": "module",
  "bin": {
    "zobox": "bin/zobox.ts"
  },
  "files": [
    "bin",
    "src",
    "../../config/*.example.*",
    "../../db/migrations"
  ],
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "biome check src/",
    "test": "vitest run"
  },
  "dependencies": {
    "@zobox/core": "workspace:*",
    "@zobox/api": "workspace:*",
    "commander": "^12.1.0",
    "@commander-js/extra-typings": "^12.1.0",
    "picocolors": "^1.1.0",
    "ora": "^8.1.0",
    "ms": "^2.1.3"
  },
  "devDependencies": {
    "@types/bun": "^1.3.3",
    "@types/ms": "^0.7.34"
  }
}
```

#### 3.2 Create apps/cli/bin/zobox.ts

```typescript
#!/usr/bin/env bun
import { run } from "../src/index.js";

run(process.argv);
```

#### 3.3 Create apps/cli/src/index.ts

```typescript
import { Command } from "@commander-js/extra-typings";
import { version } from "../package.json";
import { initCommand } from "./commands/init.js";
import { serveCommand } from "./commands/serve.js";
import { migrateCommand } from "./commands/migrate.js";
import { keysCommand } from "./commands/keys/index.js";
import { messagesCommand } from "./commands/messages/index.js";

export function createProgram(): Command {
  const program = new Command()
    .name("zobox")
    .description("Zo-native inbox + sorter + router engine")
    .version(version)
    .configureHelp({
      sortSubcommands: true,
      sortOptions: true,
    });

  // Top-level commands
  program.addCommand(initCommand);
  program.addCommand(serveCommand);
  program.addCommand(migrateCommand);

  // Nested command groups
  program.addCommand(keysCommand);
  program.addCommand(messagesCommand);

  return program;
}

export async function run(argv: string[]): Promise<void> {
  const program = createProgram();
  await program.parseAsync(argv);
}
```

#### 3.4 Create apps/cli/src/commands/init.ts

```typescript
import { Command } from "@commander-js/extra-typings";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ora from "ora";
import pc from "picocolors";
import { initZobox, startServer } from "@zobox/core";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(__dirname, "../..");

export const initCommand = new Command("init")
  .description("Initialize Zobox and start the server")
  .option(
    "--base-dir <path>",
    "Base directory for Zobox data",
    process.env.ZOBOX_BASE_DIR ?? "/home/workspace/Inbox"
  )
  .option(
    "-p, --port <port>",
    "Port to listen on",
    process.env.ZOBOX_PORT ?? "8787"
  )
  .option("--no-serve", "Initialize only, don't start server")
  .action(async (options) => {
    const spinner = ora("Initializing Zobox...").start();

    try {
      await initZobox({
        baseDir: options.baseDir,
        pkgRoot: PKG_ROOT,
      });

      spinner.succeed(pc.green("Zobox initialized"));

      if (options.serve !== false) {
        console.log(pc.dim(`Starting server on port ${options.port}...`));
        await startServer({
          baseDir: options.baseDir,
          port: parseInt(options.port, 10),
        });
      }
    } catch (error) {
      spinner.fail(pc.red("Initialization failed"));
      console.error(error);
      process.exit(1);
    }
  });
```

#### 3.5 Create apps/cli/src/commands/serve.ts

```typescript
import { Command } from "@commander-js/extra-typings";
import pc from "picocolors";
import { startServer, loadConfig } from "@zobox/core";

export const serveCommand = new Command("serve")
  .alias("start")
  .description("Start the Zobox server")
  .option(
    "--base-dir <path>",
    "Base directory for Zobox data",
    process.env.ZOBOX_BASE_DIR ?? "/home/workspace/Inbox"
  )
  .option(
    "-p, --port <port>",
    "Port to listen on",
    process.env.ZOBOX_PORT ?? "8787"
  )
  .action(async (options) => {
    try {
      console.log(pc.dim(`Starting Zobox server...`));
      console.log(pc.dim(`  Base dir: ${options.baseDir}`));
      console.log(pc.dim(`  Port: ${options.port}`));

      await startServer({
        baseDir: options.baseDir,
        port: parseInt(options.port, 10),
      });
    } catch (error) {
      console.error(pc.red("Failed to start server:"), error);
      process.exit(1);
    }
  });
```

#### 3.6 Create apps/cli/src/commands/migrate.ts

```typescript
import { Command } from "@commander-js/extra-typings";
import ora from "ora";
import pc from "picocolors";
import { loadConfig, initStorage } from "@zobox/core";

export const migrateCommand = new Command("migrate")
  .description("Run database migrations")
  .option(
    "--base-dir <path>",
    "Base directory for Zobox data",
    process.env.ZOBOX_BASE_DIR ?? "/home/workspace/Inbox"
  )
  .action(async (options) => {
    const spinner = ora("Running migrations...").start();

    try {
      const config = loadConfig(options.baseDir);
      initStorage(config);
      spinner.succeed(pc.green("Migrations applied"));
    } catch (error) {
      spinner.fail(pc.red("Migration failed"));
      console.error(error);
      process.exit(1);
    }
  });
```

#### 3.7 Create apps/cli/src/commands/keys/index.ts

```typescript
import { Command } from "@commander-js/extra-typings";
import { listCommand } from "./list.js";
import { createCommand } from "./create.js";
import { rotateCommand } from "./rotate.js";
import { revokeCommand } from "./revoke.js";

export const keysCommand = new Command("keys")
  .description("Manage API keys")
  .addCommand(listCommand)
  .addCommand(createCommand)
  .addCommand(rotateCommand)
  .addCommand(revokeCommand);
```

#### 3.8 Create Placeholder Key Commands

```typescript
// apps/cli/src/commands/keys/list.ts
import { Command } from "@commander-js/extra-typings";
import pc from "picocolors";

export const listCommand = new Command("list")
  .description("List all API keys")
  .option("--base-dir <path>", "Base directory", process.env.ZOBOX_BASE_DIR ?? "/home/workspace/Inbox")
  .action(async (options) => {
    console.log(pc.yellow("API key management not yet implemented (see issue #3)"));
    // TODO: Implement after API keys feature
  });
```

```typescript
// apps/cli/src/commands/keys/create.ts
import { Command } from "@commander-js/extra-typings";
import pc from "picocolors";

export const createCommand = new Command("create")
  .description("Create a new API key")
  .option("--role <role>", "Key role (admin or read)", "admin")
  .option("--name <name>", "Human-readable name for the key")
  .option("--base-dir <path>", "Base directory", process.env.ZOBOX_BASE_DIR ?? "/home/workspace/Inbox")
  .action(async (options) => {
    console.log(pc.yellow("API key management not yet implemented (see issue #3)"));
  });
```

```typescript
// apps/cli/src/commands/keys/rotate.ts
import { Command } from "@commander-js/extra-typings";
import pc from "picocolors";

export const rotateCommand = new Command("rotate")
  .description("Rotate an API key")
  .argument("<key-id>", "ID or prefix of the key to rotate")
  .option("--grace-period <duration>", "Keep old key valid for this duration", "5m")
  .option("--base-dir <path>", "Base directory", process.env.ZOBOX_BASE_DIR ?? "/home/workspace/Inbox")
  .action(async (keyId, options) => {
    console.log(pc.yellow("API key management not yet implemented (see issue #3)"));
  });
```

```typescript
// apps/cli/src/commands/keys/revoke.ts
import { Command } from "@commander-js/extra-typings";
import pc from "picocolors";

export const revokeCommand = new Command("revoke")
  .description("Revoke an API key immediately")
  .argument("<key-id>", "ID or prefix of the key to revoke")
  .option("--base-dir <path>", "Base directory", process.env.ZOBOX_BASE_DIR ?? "/home/workspace/Inbox")
  .action(async (keyId, options) => {
    console.log(pc.yellow("API key management not yet implemented (see issue #3)"));
  });
```

#### 3.9 Create Messages Commands

```typescript
// apps/cli/src/commands/messages/index.ts
import { Command } from "@commander-js/extra-typings";
import { listCommand } from "./list.js";
import { getCommand } from "./get.js";
import { deleteCommand } from "./delete.js";

export const messagesCommand = new Command("messages")
  .description("Manage messages")
  .addCommand(listCommand)
  .addCommand(getCommand)
  .addCommand(deleteCommand);
```

```typescript
// apps/cli/src/commands/messages/list.ts
import { Command } from "@commander-js/extra-typings";
import pc from "picocolors";

export const listCommand = new Command("list")
  .description("List messages")
  .option("--channel <channel>", "Filter by channel")
  .option("--type <type>", "Filter by message type")
  .option("--limit <n>", "Maximum messages to return", "20")
  .option("--base-dir <path>", "Base directory", process.env.ZOBOX_BASE_DIR ?? "/home/workspace/Inbox")
  .action(async (options) => {
    // TODO: Use @zobox/api client
    console.log(pc.yellow("Messages CLI not yet implemented"));
  });
```

```typescript
// apps/cli/src/commands/messages/get.ts
import { Command } from "@commander-js/extra-typings";
import pc from "picocolors";

export const getCommand = new Command("get")
  .description("Get a specific message")
  .argument("<message-id>", "Message ID")
  .option("--base-dir <path>", "Base directory", process.env.ZOBOX_BASE_DIR ?? "/home/workspace/Inbox")
  .action(async (messageId, options) => {
    console.log(pc.yellow("Messages CLI not yet implemented"));
  });
```

```typescript
// apps/cli/src/commands/messages/delete.ts
import { Command } from "@commander-js/extra-typings";
import pc from "picocolors";

export const deleteCommand = new Command("delete")
  .description("Delete a message")
  .argument("<message-id>", "Message ID")
  .option("--force", "Skip confirmation")
  .option("--base-dir <path>", "Base directory", process.env.ZOBOX_BASE_DIR ?? "/home/workspace/Inbox")
  .action(async (messageId, options) => {
    console.log(pc.yellow("Messages CLI not yet implemented"));
  });
```

---

### Phase 4: packages/api Setup

**Duration:** ~1 hour
**Risk:** Low (new package, no migration)

#### 4.1 Create packages/api/package.json

```json
{
  "name": "@zobox/api",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "import": "./src/index.ts"
    }
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "biome check src/",
    "test": "vitest run"
  },
  "dependencies": {
    "ky": "^1.7.2",
    "zod": "^4.1.12"
  },
  "devDependencies": {
    "@zobox/core": "workspace:*",
    "@types/bun": "^1.3.3"
  },
  "peerDependencies": {
    "@zobox/core": "workspace:*"
  }
}
```

#### 4.2 Create packages/api/src/index.ts

```typescript
export { ZoboxClient, type ZoboxClientOptions } from "./client.js";
export type {
  ApiResponse,
  ApiError,
  PaginatedResponse,
} from "./types.js";
```

#### 4.3 Create packages/api/src/client.ts

```typescript
import ky, { type KyInstance } from "ky";
import type { MessageEnvelope, MessageView } from "@zobox/core/types";

export interface ZoboxClientOptions {
  baseUrl: string;
  apiKey: string;
  timeout?: number;
}

export class ZoboxClient {
  private client: KyInstance;

  constructor(options: ZoboxClientOptions) {
    this.client = ky.create({
      prefixUrl: options.baseUrl,
      timeout: options.timeout ?? 30_000,
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
      },
      hooks: {
        beforeError: [
          async (error) => {
            const { response } = error;
            if (response) {
              const body = await response.json().catch(() => ({}));
              error.message = body.error ?? error.message;
            }
            return error;
          },
        ],
      },
    });
  }

  // Health
  async health(): Promise<{ status: string }> {
    return this.client.get("health").json();
  }

  // Messages
  async listMessages(options?: {
    channel?: string;
    type?: string;
    limit?: number;
  }): Promise<MessageView[]> {
    const searchParams = new URLSearchParams();
    if (options?.channel) searchParams.set("channel", options.channel);
    if (options?.type) searchParams.set("type", options.type);
    if (options?.limit) searchParams.set("limit", String(options.limit));

    return this.client.get("messages", { searchParams }).json();
  }

  async getMessage(id: string): Promise<MessageEnvelope> {
    return this.client.get(`messages/${id}`).json();
  }

  async deleteMessage(id: string): Promise<void> {
    await this.client.delete(`messages/${id}`);
  }

  async createMessage(message: {
    type: string;
    payload: unknown;
    channel?: string;
    tags?: string[];
  }): Promise<MessageEnvelope> {
    return this.client.post("messages", { json: message }).json();
  }

  // Future: Keys API
  // async listKeys(): Promise<ApiKey[]>
  // async createKey(options): Promise<{ key: string }>
  // async rotateKey(id: string, options): Promise<{ key: string }>
  // async revokeKey(id: string): Promise<void>
}
```

#### 4.4 Create packages/api/src/types.ts

```typescript
export interface ApiResponse<T> {
  data: T;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
  };
}

export interface ApiError {
  error: string;
  code?: string;
  details?: unknown;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
  };
}
```

---

### Phase 5: apps/web Placeholder

**Duration:** ~15 minutes
**Risk:** None

#### 5.1 Create apps/web/package.json

```json
{
  "name": "@zobox/web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "echo 'Web app not yet implemented'",
    "build": "echo 'Web app not yet implemented'",
    "typecheck": "tsc --noEmit",
    "lint": "biome check src/"
  },
  "dependencies": {
    "@zobox/api": "workspace:*"
  },
  "devDependencies": {
    "@types/bun": "^1.3.3",
    "typescript": "^5.6.0"
  }
}
```

#### 5.2 Create apps/web/src/index.ts

```typescript
// Placeholder for Zobox admin dashboard
// See: https://github.com/galligan/zobox/issues/XX

export const placeholder = true;
```

---

### Phase 6: Configuration Updates

**Duration:** ~1 hour
**Risk:** Low

#### 6.1 Update Root tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "paths": {
      "@zobox/core": ["./packages/core/src"],
      "@zobox/core/*": ["./packages/core/src/*"],
      "@zobox/api": ["./packages/api/src"],
      "@zobox/api/*": ["./packages/api/src/*"]
    }
  },
  "exclude": ["node_modules", "**/dist/**"]
}
```

#### 6.2 Update biome.jsonc

```jsonc
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "organizeImports": {
    "enabled": true
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "tab",
    "lineWidth": 100
  },
  "files": {
    "ignore": [
      "node_modules",
      "**/dist/**",
      ".turbo",
      "coverage"
    ]
  }
}
```

#### 6.3 Update lefthook.yml

```yaml
pre-commit:
  parallel: true
  commands:
    format:
      glob: "**/*.{ts,json,md}"
      run: bun run format
      stage_fixed: true
      skip:
        - merge
        - rebase

    lint:
      glob: "**/*.{ts,tsx}"
      run: bunx turbo run lint
      skip:
        - merge
        - rebase

    types:
      glob: "**/*.ts"
      run: bunx turbo run typecheck
      skip:
        - merge
        - rebase

    test-related:
      glob: "**/*.ts"
      run: bunx turbo run test
      skip:
        - merge
        - rebase

pre-push:
  commands:
    test-all:
      run: bunx turbo run test

    lint-strict:
      run: bun run check
```

#### 6.4 Update .changeset/config.json

```json
{
  "$schema": "https://unpkg.com/@changesets/config@3.1.1/schema.json",
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "fixed": [],
  "linked": [],
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": ["@zobox/web"],
  "privatePackages": {
    "version": true,
    "tag": false
  }
}
```

#### 6.5 Create .npmrc

```
# Prevent accidental publish of private packages
//registry.npmjs.org/:_authToken=${NPM_TOKEN}
```

#### 6.6 Update .gitignore

Add monorepo-specific ignores:

```
# Turbo
.turbo

# Package specific
packages/*/dist
apps/*/dist

# OS
.DS_Store
```

---

### Phase 7: Install Dependencies & Validate

**Duration:** ~30 minutes
**Risk:** Medium

#### 7.1 Install All Dependencies

```bash
# From workspace root
bun install
```

#### 7.2 Run Type Check

```bash
bunx turbo run typecheck
```

#### 7.3 Run Tests

```bash
bunx turbo run test
```

#### 7.4 Test CLI Locally

```bash
# Test help output
bun run apps/cli/bin/zobox.ts --help
bun run apps/cli/bin/zobox.ts keys --help
bun run apps/cli/bin/zobox.ts messages --help

# Test init (in temp directory)
ZOBOX_BASE_DIR=/tmp/zobox-test bun run apps/cli/bin/zobox.ts init --no-serve

# Verify directory structure
ls -la /tmp/zobox-test/
```

#### 7.5 Test Turbo Caching

```bash
# First run (no cache)
bunx turbo run test

# Second run (should be cached)
bunx turbo run test
# Should see "FULL TURBO" or cache hits
```

---

### Phase 8: Final Steps

**Duration:** ~30 minutes
**Risk:** Low

#### 8.1 Create Changeset

```bash
bunx changeset
# Select: zobox (major change)
# Message: "Restructure to Turborepo monorepo with Commander.js CLI"
```

#### 8.2 Update Documentation

Update README.md to reflect new structure and commands.

#### 8.3 Commit and Push

```bash
git add .
git commit -m "feat: restructure to Turborepo monorepo

- Add Turborepo for workspace management
- Create packages/core with server and business logic
- Create packages/api with typed HTTP client
- Create apps/cli with Commander.js
- Create apps/web placeholder
- Update all tooling for monorepo structure

BREAKING CHANGE: Package structure changed, though CLI commands remain compatible"

git push -u origin feat/monorepo-migration
```

#### 8.4 Create PR

```bash
gh pr create --title "feat: Turborepo monorepo restructure" --body "..."
```

---

## 6. File Specifications

### Complete File List

```
zobox/
├── .changeset/
│   └── config.json
├── .gitignore
├── .npmrc
├── apps/
│   ├── cli/
│   │   ├── bin/
│   │   │   └── zobox.ts
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── commands/
│   │   │   │   ├── init.ts
│   │   │   │   ├── keys/
│   │   │   │   │   ├── create.ts
│   │   │   │   │   ├── index.ts
│   │   │   │   │   ├── list.ts
│   │   │   │   │   ├── revoke.ts
│   │   │   │   │   └── rotate.ts
│   │   │   │   ├── messages/
│   │   │   │   │   ├── delete.ts
│   │   │   │   │   ├── get.ts
│   │   │   │   │   ├── index.ts
│   │   │   │   │   └── list.ts
│   │   │   │   ├── migrate.ts
│   │   │   │   └── serve.ts
│   │   │   └── index.ts
│   │   └── tsconfig.json
│   └── web/
│       ├── package.json
│       ├── src/
│       │   └── index.ts
│       └── tsconfig.json
├── biome.jsonc
├── bun.lock
├── config/
│   ├── destinations.example.json
│   └── zobox.config.example.toml
├── db/
│   └── migrations/
│       ├── 001_init.sql
│       └── 002_rename_consumer_to_subscriber.sql
├── docs/
│   └── ...
├── lefthook.yml
├── package.json
├── packages/
│   ├── api/
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── client.ts
│   │   │   ├── index.ts
│   │   │   └── types.ts
│   │   └── tsconfig.json
│   └── core/
│       ├── package.json
│       ├── src/
│       │   ├── config.ts
│       │   ├── errors.ts
│       │   ├── handlers/
│       │   │   └── messages.ts
│       │   ├── health.ts
│       │   ├── index.ts
│       │   ├── init.ts
│       │   ├── logger.ts
│       │   ├── middleware.ts
│       │   ├── routing/
│       │   │   └── destinations.ts
│       │   ├── schemas.ts
│       │   ├── server.ts
│       │   ├── sorters/
│       │   │   └── attachments.ts
│       │   ├── sorters.ts
│       │   ├── storage/
│       │   │   └── tags.ts
│       │   ├── storage.ts
│       │   ├── types.ts
│       │   └── utils/
│       │       └── json.ts
│       └── tsconfig.json
├── tsconfig.json
└── turbo.json
```

---

## 7. CLI Command Reference

### Top-Level Commands

```
zobox init [options]           Initialize Zobox and start server
zobox serve [options]          Start the Zobox server
zobox migrate [options]        Run database migrations
zobox keys <subcommand>        Manage API keys
zobox messages <subcommand>    Manage messages
zobox help [command]           Display help
zobox --version                Display version
```

### Global Options

```
--base-dir <path>    Base directory for Zobox data
                     Default: $ZOBOX_BASE_DIR or /home/workspace/Inbox
```

### zobox init

```
zobox init [options]

Initialize Zobox: create directories, copy configs, run migrations, start server.

Options:
  --base-dir <path>   Base directory (default: /home/workspace/Inbox)
  -p, --port <port>   Port to listen on (default: 8787)
  --no-serve          Initialize only, don't start server
  -h, --help          Display help
```

### zobox serve

```
zobox serve [options]

Start the Zobox HTTP server.

Aliases: start

Options:
  --base-dir <path>   Base directory (default: /home/workspace/Inbox)
  -p, --port <port>   Port to listen on (default: 8787)
  -h, --help          Display help
```

### zobox keys

```
zobox keys <command>

Manage API keys for authentication.

Commands:
  list              List all API keys
  create            Create a new API key
  rotate <key-id>   Rotate an existing key
  revoke <key-id>   Revoke a key immediately

Run 'zobox keys <command> --help' for more information.
```

### zobox keys list

```
zobox keys list [options]

List all API keys with metadata.

Options:
  --base-dir <path>   Base directory (default: /home/workspace/Inbox)
  -h, --help          Display help

Output columns:
  ID         Key ID (prefix)
  Role       admin or read
  Name       Human-readable name
  Created    Creation timestamp
  Last Used  Last usage timestamp
  Status     active, expired, or revoked
```

### zobox keys create

```
zobox keys create [options]

Create a new API key.

Options:
  --role <role>       Key role: admin or read (default: admin)
  --name <name>       Human-readable name for the key
  --expires <time>    Expiration time (e.g., "30d", "1y")
  --base-dir <path>   Base directory (default: /home/workspace/Inbox)
  -h, --help          Display help

Note: The key is displayed ONCE at creation. Store it securely.
```

### zobox keys rotate

```
zobox keys rotate <key-id> [options]

Rotate an API key, optionally keeping the old key valid for a grace period.

Arguments:
  key-id              ID or prefix of the key to rotate

Options:
  --grace-period <d>  Keep old key valid for duration (default: 5m)
  --base-dir <path>   Base directory (default: /home/workspace/Inbox)
  -h, --help          Display help
```

### zobox keys revoke

```
zobox keys revoke <key-id> [options]

Immediately revoke an API key.

Arguments:
  key-id              ID or prefix of the key to revoke

Options:
  --base-dir <path>   Base directory (default: /home/workspace/Inbox)
  -h, --help          Display help
```

### zobox messages

```
zobox messages <command>

Manage messages in the inbox.

Commands:
  list              List messages
  get <id>          Get a specific message
  delete <id>       Delete a message

Run 'zobox messages <command> --help' for more information.
```

### zobox messages list

```
zobox messages list [options]

List messages with optional filters.

Options:
  --channel <name>    Filter by channel
  --type <type>       Filter by message type
  --limit <n>         Maximum messages (default: 20)
  --offset <n>        Skip first n messages (default: 0)
  --base-dir <path>   Base directory (default: /home/workspace/Inbox)
  -h, --help          Display help
```

### zobox messages get

```
zobox messages get <message-id> [options]

Get a specific message by ID.

Arguments:
  message-id          Message ID

Options:
  --base-dir <path>   Base directory (default: /home/workspace/Inbox)
  -h, --help          Display help
```

### zobox messages delete

```
zobox messages delete <message-id> [options]

Delete a message.

Arguments:
  message-id          Message ID

Options:
  --force             Skip confirmation prompt
  --base-dir <path>   Base directory (default: /home/workspace/Inbox)
  -h, --help          Display help
```

---

## 8. Validation Checklist

### Pre-Migration

- [ ] All tests pass (328 tests)
- [ ] Clean git status
- [ ] Baseline behavior documented
- [ ] Migration branch created

### Phase 1: Turborepo

- [ ] `turbo.json` created
- [ ] Root `package.json` updated with workspaces
- [ ] Directory structure created
- [ ] `bunx turbo --version` works

### Phase 2: packages/core

- [ ] All source files moved
- [ ] `package.json` created
- [ ] `index.ts` exports all public API
- [ ] Internal imports use `.js` extension
- [ ] `bun run typecheck` passes
- [ ] All tests pass in isolation

### Phase 3: apps/cli

- [ ] Commander.js set up
- [ ] All commands wired
- [ ] `zobox --help` shows full command tree
- [ ] `zobox init` works
- [ ] `zobox serve` works
- [ ] `zobox migrate` works
- [ ] `zobox keys --help` shows subcommands
- [ ] `zobox messages --help` shows subcommands

### Phase 4: packages/api

- [ ] `ZoboxClient` class created
- [ ] All endpoints typed
- [ ] Package exports clean

### Phase 5: apps/web

- [ ] Placeholder package created
- [ ] Builds without error

### Phase 6: Configuration

- [ ] Root `tsconfig.json` updated
- [ ] `biome.jsonc` updated
- [ ] `lefthook.yml` updated
- [ ] `.changeset/config.json` updated
- [ ] `.gitignore` updated

### Phase 7: Validation

- [ ] `bun install` succeeds
- [ ] `bunx turbo run typecheck` passes
- [ ] `bunx turbo run test` passes
- [ ] All 328 tests still pass
- [ ] Turbo caching works (second run is fast)
- [ ] CLI works from temp directory

### Phase 8: Final

- [ ] Changeset created
- [ ] README updated
- [ ] PR created
- [ ] CI passes

---

## 9. Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Import path breakage | High | Medium | Use find-replace carefully, run typecheck frequently |
| Test failures after move | Medium | Medium | Run tests after each file move |
| Turbo cache issues | Low | Low | Clear `.turbo` if needed |
| npm publish breaks | Medium | Low | Test with `npm pack` before actual publish |
| Dependencies version conflicts | Medium | Low | Pin versions, use `workspace:*` for internal |
| CLI backward compatibility | High | Low | Keep `start` as alias for `serve` |

### Rollback Plan

If migration fails:

```bash
git checkout main
git branch -D feat/monorepo-migration
```

All changes are on a feature branch; main remains untouched.

---

## 10. Open Questions

### Resolved

1. **Q: Publish all packages or just CLI?**
   A: Just CLI (`zobox`), others stay private.

2. **Q: Turborepo vs Nx?**
   A: Turborepo — simpler, aligns with Bun.

3. **Q: Commander.js or alternatives?**
   A: Commander.js with `@commander-js/extra-typings`.

### Still Open

1. **Q: Should we add GitHub Actions for Turborepo caching?**
   Consider: `actions/cache` with `.turbo` directory.

2. **Q: Should tests live next to source or in `__tests__` directories?**
   Current: Next to source (`.test.ts` suffix).

3. **Q: Do we need `tsup` for building, or is Bun's native resolution enough?**
   Likely not needed since we're using Bun runtime, not bundling for browsers.

4. **Q: Should we add a `CONTRIBUTING.md` for the monorepo?**
   Would help document the workspace structure for contributors.

---

## Appendix A: Useful Commands

```bash
# Install all workspace dependencies
bun install

# Run all tests
bunx turbo run test

# Run tests for specific package
bunx turbo run test --filter=@zobox/core

# Type check everything
bunx turbo run typecheck

# Lint everything
bunx turbo run lint

# Build everything (if applicable)
bunx turbo run build

# Clean turbo cache
rm -rf .turbo

# View dependency graph
bunx turbo run build --graph

# Run CLI locally
bun run apps/cli/bin/zobox.ts --help
```

## Appendix B: Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ZOBOX_BASE_DIR` | `/home/workspace/Inbox` | Base directory for all Zobox data |
| `ZOBOX_PORT` | `8787` | HTTP server port |
| `ZOBOX_ADMIN_API_KEY` | (required) | Admin API key for write operations |
| `ZOBOX_READ_API_KEY` | (optional) | Read-only API key |
| `ZOBOX_LOG_LEVEL` | `info` | Logging level (debug, info, warn, error) |

## Appendix C: Package Versions

| Package | Min Version | Notes |
|---------|-------------|-------|
| Bun | 1.1.0 | Required runtime |
| Node.js | 20.x | For npm publish only |
| TypeScript | 5.6.0 | Strict mode |
| Turborepo | 2.3.0 | Workspace management |
