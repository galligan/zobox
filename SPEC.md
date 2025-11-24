# Zobox

---

# Zobox Service Specification

Zobox is a Zo‑native, open‑source inbox + sorter + router engine. It accepts arbitrary structured JSON messages, optional file attachments, and routes, stores, and transforms them according to a flexible configuration system built around a TOML profile file (`zobox.config.toml`). It is designed to be generic, extensible, and easy for the Zo community to use, fork, and contribute to.

Zobox replaces the earlier “Router API” concept with a more fully realized model: messages instead of events, sorters instead of simple routing rules, and type‑driven behavior inspired by Codex CLI profiles.

---

## 1. Overview

### 1.1 Purpose

* Provide a **single ingestion endpoint** for structured JSON messages, with or without attachments.
* Store all incoming messages in a **canonical inbox log**, backed by filesystem + SQLite.
* Decode and persist file attachments (multipart or base64), routed via **flexible file path templates**.
* Apply **type‑specific sorters**, enabling powerful behavior without writing code.
* Offer a generic, Zo‑installable, open‑source system the community can adapt.

### 1.2 Philosophy

* **Inbox-first**: everything lands in one place.
* **Type-defined behavior**: messages declare `type`, which determines routing.
* **sorter-driven**: types map to sorters specifying how messages are handled.
* **Extensible**: users can define new types, sorters, and directory patterns.
* **Readable**: all Zobox data is visible in Zo’s file browser.
* **OSS-friendly**: simple Bun/Hono-based server anyone can run.

### 1.3 Default base directory

Zobox installs into a configurable base directory, defaulting to:

```
/home/workspace/Inbox
```

Within it, Zobox creates:

```
Inbox/
  zobox.config.toml
  inbox/                # message envelopes (JSON)
  files/                # attachments
  db/zobox.db      # SQLite index
  logs/                 # access/error logs
```

Everything is adjustable via `zobox.config.toml`.

---

## 2. Core Concepts

### 2.1 Messages (formerly "events")

Each ingestion request creates a **Zobox message**. Messages are stored as JSON envelopes and indexed in SQLite.

### 2.2 Types

A **type** describes the semantic category of a message. Examples: `update`, `post`, `task`, `note`, `event`. Types live in `[types.*]` sections in `zobox.config.toml`. Types can define:

* default channel
* description
* example payloads (for agents)
* any user-defined metadata

### 2.3 sorters

Each type may have an associated **sorter**, defining what to do with messages of that type. Sorters live in `[sorters.*]` sections.

A sorter can specify:

* where attachments land (`files_path_template`)
* where metadata should be appended (`append_to_file`)
* which routing logic to use (`destination`)
* additional behavior for Zobox agents

### 2.4 Attachments

Attachments may be provided via:

* **multipart/form-data** file parts
* **base64** strings inside JSON

Zobox decodes/stores attachments using a configurable path template.

### 2.5 Unified `/messages` endpoint

One endpoint: `POST /messages`.

Supports three modes:

* **JSON only**
* **JSON + base64 attachments**
* **multipart with binary attachments + JSON event metadata**

Graceful, progressive capability.

---

## 3. Storage Architecture

Zobox uses a hybrid of **filesystem (canonical)** + **SQLite (index)**.

### 3.1 Filesystem (source of truth)

```
Inbox/inbox/YYYY-MM-DD/<id>.json
Inbox/files/<channel>/<date>/<eventId>/<files>
Inbox/logs
```

The envelope JSON contains the full `payload`, normalized attachment metadata, and timestamps.

### 3.2 SQLite index

```
Inbox/db/zobox.db
Inbox/db/migrations/   # SQL migrations (001_init.sql)
```

Inbox/db/zobox.db

```

Stores message metadata:

- id
- type
- channel
- createdAt
- filePath (to envelope)
- fileDir (if attachments exist)
- attachmentsCount
- subscribedBy/subscribedAt

SQLite is for fast API queries; filesystem is the durable log. The single migration in `db/migrations/001_init.sql` creates indexes on `createdAt`, `type`, `channel`, `hasAttachments`, and `tags`, and leaves room for a future `summary` column for UI previews.

---

## 4. Configuration: `zobox.config.toml`

A TOML file at the base directory root drives Zobox’s behavior.

### 4.1 Global structure

```

[zobox]
base_dir = "/home/workspace/Inbox"
db_path = "/home/workspace/Inbox/db/zobox.db"
default_channel = "Inbox"

[auth]
admin_api_key_env_var = "ZOBOX_ADMIN_API_KEY"   # full read/write, required for admin ops
read_api_key_env_var  = "ZOBOX_READ_API_KEY"    # optional, read-only access for UIs
required = true

[tools]

# future Zo integration hooks

[files]
enabled = true
base_files_dir = "/home/workspace/Inbox/files"
path_template = "{baseFilesDir}/{channel}/{date}/{eventId}/{filename}"
filename_strategy = "original"       # original | timestampPrefix | eventIdPrefix | uuid
keep_base64_in_envelope = false

[types.update]
description = "Generic status update"
channel = "Updates"
payload_example = """
{
"title": "Short title",
"body": "Longer markdown text",
"tags": ["status", "personal"]
}
"""

[types.post]
description = "Blog post"
channel = "Posts"
payload_example = """
{
"title": "My post",
"slug": "my-post",
"body": "markdown here"
}
"""

[sorters.updates]
type = "update"
description = "Append updates to a rolling log."
files_path_template = "{baseFilesDir}/Updates/{date}/{eventId}/{filename}"
append_to_file = "/home/workspace/Inbox/updates.md"
destination = "store_only"

[sorters.posts]
type = "post"
description = "Publish posts to content folder."
files_path_template = "{baseFilesDir}/Posts/{date}/{eventId}/{filename}"
append_to_file = "/home/workspace/Inbox/posts_index.md"
destination = "publish_to_worker"

```

### 4.2 Path template tokens

- `{baseFilesDir}`
- `{channel}`
- `{date}` (YYYY‑MM‑DD)
- `{eventId}`
- `{timestamp}` (ISO-ish sanitized)
- `{filename}`

### 4.3 Filename strategies

- `original`
- `timestampPrefix`
- `eventIdPrefix`
- `uuid`

---

## 5. HTTP API

### 5.1 Ingestion: `POST /messages`

Supports three modes:

#### A. JSON only

```

Content-Type: application/json

```
```

{
"type": "update",
"payload": { "text": "Idea" }
}

```

#### B. JSON + base64 attachments

```

{
"type": "update",
"payload": { "text": "Idea with file" },
"attachments": [
{
"filename": "photo.jpg",
"mimeType": "image/jpeg",
"base64": "<...>"
}
]
}

```

Zobox decodes base64 → writes via path template → adds `attachments[]` entries to envelope.

#### C. Multipart form

```

Content-Type: multipart/form-data

(event)  => JSON blob
(message)  => JSON blob (alternative)
(json)   => JSON blob (alternative)
(file)   => binary file
(file)   => binary file

````

Zobox merges JSON + file parts into one message.

### 5.2 Listing: `GET /messages`

Filters via query params:

- `type`
- `channel`
- `since`
- `until`
- `limit`
- `cursor` (opaque pagination cursor, optional)

Returns a paginated list of messages using the SQLite index (response key: `items`):

```json
{
  "items": [
    {
      "id": "01HP...",
      "type": "update",
      "channel": "Updates",
      "createdAt": "2025-11-22T12:34:56.789Z",
      "hasAttachments": true,
      "attachmentsCount": 2
    }
  ],
  "nextCursor": "opaque-token-or-null"
}
````

`items` here is a **MessageView** projection, not the full envelope; callers can request full details via a separate `GET /messages/:id` in a future version or by an `include=full` option when that is implemented.

### 5.3 Subscriber polling: `GET /messages/next`

Workers use this to fetch unclaimed messages.

Parameters:

* `subscriber` (required)
* `type`, `channel`
* `limit`

### 5.4 Acknowledgement: `POST /messages/:id/ack`

Marks a message as processed by a subscriber.

### 5.5 Health: `GET /health`

Returns `{ "status": "ok" }`.

### 5.6 Admin config (reserved): `GET /admin/config`, `PUT /admin/config`

Not implemented in V1, but reserved for future UI integrations. These endpoints will expose a structured view of `zobox.config.toml` (for reading) and accept validated updates (for writing), enabling UIs and tools to adjust Zobox configuration without direct file editing.

### 5.7 Future UI endpoints

Returns `{ "status": "ok" }`.

---

## 6. Server Behavior

### 6.1 Message normalization

Incoming JSON is normalized into:

```
{
  id,
  type,
  source,
  channel,
  payload,
  attachments: [...],
  meta,
  createdAt
}
```

### 6.2 Attachment handling

Both multipart and base64 attachments pass through the **same resolver**:

```
final_path = path_template
  .replace("{baseFilesDir}", ...)
  .replace("{channel}", ...)
  .replace("{date}", ...)
  .replace("{eventId}", ...)
  .replace("{filename}", resolvedFilename)
```

Only create attachment directories when needed.

### 6.3 sorter application

Zobox:

1. Looks up `[types.<type>]`.
2. Looks up `[sorters.<sorter>]` where `sorter.type == message.type`.
3. Applies:

   * sorter-specific file path
   * append rules
   * destination

### 6.4 Destinations

Destinations reference a lower-level `routes.json` file or embedded rules. Examples:

* `store_only`: no outbound routing
* `publish_to_worker`: POST JSON envelope to external URL

### 6.5 Envelope vs MessageView

Internally, Zobox distinguishes between:

* the **envelope** (full JSON object stored on disk, including `payload`, `attachments`, and `meta`), and
* the **MessageView** (a lighter-weight projection used for listings and tables: `id`, `type`, `channel`, `createdAt`, `hasAttachments`, `attachmentsCount`, and any computed preview fields).

`GET /messages` returns MessageViews; future endpoints or options (such as `GET /messages/:id` or `include=full`) can return the full envelope for a selected item without breaking UI contracts.

---

## 7. Repository Layout (OSS)

```
zobox/
  src/
    server.ts
    storage.ts
    config.ts
    sorters.ts
  config/
    zobox.config.example.toml
    routes.example.json
  db/
    zobox.db
    migrations/
      001_init.sql
  package.json
  README.md
  zobox.prompt.md
```

---

## 8. Zo Integration

Zobox is designed to be installed into a Zo server as a user service.

- `Label: zobox`
- `Type: http`
- `Local port: 8787` (default)
- `Entrypoint: bunx zobox start`
- `Workdir: /home/workspace/Inbox` (or wherever it was installed)

Zobox can ship with Zo prompts:

- **Zobox: New Type**
- **Zobox: New sorter**
- **Zobox: Configure**
- **Zobox: Add Attachment Rule**

These prompts edit `zobox.config.toml` and restart the service.

---

## 9. Future Extensions

- Web dashboard for browsing inbox messages.
- Schema validation via optional JSON Schema blocks.
- sorter chaining.
- Integration with Convex as projection layer.
- DSL for building route profiles.
- Publishing flows (e.g. auto-generate files for iOS apps).

---

## 10. Definition of Done (V1)

- Zobox site running on Zo.
- `/messages` ingestion working with all three modes.
- Attachments routed via path template.
- `zobox.config.toml` recognized and applied.
- Types + sorters applied to incoming messages.
- SQLite index running.
- Zobox prompts available for creating/updating types/sorters.

Zobox V1 is now a complete, extensible, and branded inbox engine for Zo users.


---

# Zobox Code

```txt
zobox/
  package.json
  tsconfig.json
  .gitignore
  README.md
  zobox.prompt.md

  bin/
    zobox.ts

  src/
    types.ts
    config.ts
    storage.ts
    sorters.ts
    server.ts

  config/
    zobox.config.example.toml
    routes.example.json

  db/
    migrations/
      001_init.sql
```

---

```jsonc
// file: package.json
{
  "name": "zobox",
  "version": "0.1.0",
  "description": "Zo-native inbox + sorter + router engine.",
  "license": "MIT",
  "bin": {
    "zobox": "bin/zobox.ts"
  },
  "type": "module",
  "scripts": {
    "dev": "bun run src/server.ts",
    "start": "bun run src/server.ts",
    "lint": "echo \"add your linter here\"",
    "test": "echo \"add tests here\""
  },
  "dependencies": {
    "@hono/node-server": "^1.12.0",
    "better-sqlite3": "^9.4.0",
    "hono": "^4.4.0",
    "toml": "^3.0.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.8",
    "@types/node": "^22.0.0",
    "typescript": "^5.6.0"
  }
}
```

---

```jsonc
// file: tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Node",
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "dist",
    "types": ["node"]
  },
  "include": ["src", "bin/**/*.ts"]
}
```

---

```gitignore
# file: .gitignore
node_modules
dist
.env
*.log
*.sqlite
*.db
.DS_Store

# Zobox runtime data (if you run inside repo)
inbox/
files/
db/zobox.db
logs/
```

---

```ts
// file: src/types.ts

export interface ZoboxSection {
  base_dir: string;
  db_path: string;
  default_channel: string;
}

export interface AuthSection {
  admin_api_key_env_var: string;
  read_api_key_env_var?: string;
  required?: boolean;
}

export type FilenameStrategy = 'original' | 'timestampPrefix' | 'eventIdPrefix' | 'uuid';

export interface FilesSection {
  enabled: boolean;
  base_files_dir: string;
  path_template: string;
  filename_strategy: FilenameStrategy;
  keep_base64_in_envelope?: boolean;
}

export interface TypeDefinition {
  description?: string;
  channel?: string;
  payload_example?: string;
  // Arbitrary additional metadata
  [key: string]: unknown;
}

export interface sorterDefinition {
  type: string;
  description?: string;
  files_path_template?: string;
  append_to_file?: string;
  destination?: string;
  // Arbitrary additional metadata
  [key: string]: unknown;
}

export interface ZoboxConfig {
  zobox: ZoboxSection;
  auth: AuthSection;
  files: FilesSection;
  types: Record<string, TypeDefinition>;
  sorters: Record<string, sorterDefinition>;
  tools?: Record<string, unknown>;
}

export interface Base64AttachmentInput {
  filename: string;
  mimeType?: string;
  base64: string;
}

export interface BinaryAttachmentInput {
  filename: string;
  mimeType?: string;
  buffer: Buffer;
  fieldName?: string;
}

export type AttachmentInput = Base64AttachmentInput | BinaryAttachmentInput;

export interface AttachmentEnvelope {
  id: string;
  filename: string;
  originalFilename?: string;
  mimeType?: string;
  size?: number;
  path: string;
  source: 'base64' | 'multipart';
  base64?: string;
}

export interface MessageEnvelope {
  id: string;
  type: string;
  source?: string;
  channel: string;
  payload: unknown;
  attachments: AttachmentEnvelope[];
  meta?: unknown;
  createdAt: string;
}

export interface MessageIndexRow {
  id: string;
  type: string;
  channel: string;
  createdAt: string;
  filePath: string;
  fileDir: string | null;
  attachmentsCount: number;
  hasAttachments: boolean;
  claimedBy?: string | null;
  claimedAt?: string | null;
  summary?: string | null;
}

export interface MessageView {
  id: string;
  type: string;
  channel: string;
  createdAt: string;
  hasAttachments: boolean;
  attachmentsCount: number;
}

export interface MessageFilters {
  type?: string;
  channel?: string;
  since?: string;
  until?: string;
}

export interface QueryItemsResult {
  items: MessageView[];
  nextCursor: string | null;
}

export interface RoutesConfig {
  destinations: Record<string, Destination>;
}

export interface Destination {
  kind?: 'http' | 'noop';
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  enabled?: boolean;
  timeoutMs?: number;
  description?: string;
}

export interface NewMessageInput {
  type: string;
  payload: unknown;
  channel?: string;
  source?: string;
  meta?: unknown;
}

export interface AttachmentContext {
  id: string;
  type: string;
  channel: string;
  createdAt: string;
  date: string;
}
```

---

```ts
// file: src/config.ts
import fs from 'node:fs';
import path from 'node:path';
import * as toml from 'toml';
import type { ZoboxConfig, RoutesConfig } from './types';

export function loadConfig(baseDir: string): ZoboxConfig {
  const configPath = path.join(baseDir, 'zobox.config.toml');
  let raw: any = {};
  if (fs.existsSync(configPath)) {
    const text = fs.readFileSync(configPath, 'utf8');
    raw = toml.parse(text);
  }

  return normalizeConfig(raw, baseDir);
}

function normalizeConfig(raw: any, baseDir: string): ZoboxConfig {
  const rawZobox = raw.zobox ?? {};
  const base_dir: string = rawZobox.base_dir ?? baseDir;
  const db_path: string =
    rawZobox.db_path ?? path.join(base_dir, 'db', 'zobox.db');
  const default_channel: string = rawZobox.default_channel ?? 'Inbox';

  const rawAuth = raw.auth ?? {};
  const auth = {
    admin_api_key_env_var:
      rawAuth.admin_api_key_env_var ?? 'ZOBOX_ADMIN_API_KEY',
    read_api_key_env_var:
      rawAuth.read_api_key_env_var ?? 'ZOBOX_READ_API_KEY',
    required:
      typeof rawAuth.required === 'boolean' ? rawAuth.required : true,
  };

  const rawFiles = raw.files ?? {};
  const base_files_dir: string =
    rawFiles.base_files_dir ?? path.join(base_dir, 'files');
  const path_template: string =
    rawFiles.path_template ??
    '{baseFilesDir}/{channel}/{date}/{eventId}/{filename}';
  const filename_strategy =
    rawFiles.filename_strategy ?? 'original';
  const keep_base64_in_envelope =
    typeof rawFiles.keep_base64_in_envelope === 'boolean'
      ? rawFiles.keep_base64_in_envelope
      : false;

  const files = {
    enabled:
      typeof rawFiles.enabled === 'boolean' ? rawFiles.enabled : true,
    base_files_dir,
    path_template,
    filename_strategy,
    keep_base64_in_envelope,
  };

  const types = raw.types ?? {};
  const sorters = raw.sorters ?? {};
  const tools = raw.tools ?? {};

  const config: ZoboxConfig = {
    zobox: {
      base_dir,
      db_path,
      default_channel,
    },
    auth,
    files,
    types,
    sorters,
    tools,
  };

  return config;
}

export function loadRoutesConfig(baseDir: string): RoutesConfig | undefined {
  const routesPath = path.join(baseDir, 'routes.json');
  if (!fs.existsSync(routesPath)) {
    return undefined;
  }
  const text = fs.readFileSync(routesPath, 'utf8');
  const raw = JSON.parse(text);
  if (!raw.destinations || typeof raw.destinations !== 'object') {
    throw new Error('routes.json must contain a "destinations" object');
  }
  return raw as RoutesConfig;
}
```

---

```ts
// file: src/storage.ts
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import type {
  ZoboxConfig,
  MessageEnvelope,
  MessageIndexRow,
  MessageView,
  MessageFilters,
  QueryItemsResult,
} from './types';

export type SQLiteDatabase = Database;

export interface Storage {
  db: SQLiteDatabase;
  baseDir: string;
  dbPath: string;
  dbDir: string;
  inboxDir: string;
  filesDir: string;
  logsDir: string;
  migrationsDir: string;
}

export function initStorage(config: ZoboxConfig): Storage {
  const baseDir = config.zobox.base_dir || '/home/workspace/Inbox';
  const dbPath =
    config.zobox.db_path || path.join(baseDir, 'db', 'zobox.db');
  const dbDir = path.dirname(dbPath);
  const inboxDir = path.join(baseDir, 'inbox');
  const filesDir =
    config.files.base_files_dir || path.join(baseDir, 'files');
  const logsDir = path.join(baseDir, 'logs');
  const migrationsDir = path.join(baseDir, 'db', 'migrations');

  [baseDir, dbDir, inboxDir, filesDir, logsDir, migrationsDir].forEach(
    (dir) => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    },
  );

  ensureInitMigrationFile(migrationsDir);

  const db = new Database(dbPath);
  runMigrations(db, migrationsDir);

  return {
    db,
    baseDir,
    dbPath,
    dbDir,
    inboxDir,
    filesDir,
    logsDir,
    migrationsDir,
  };
}

function ensureInitMigrationFile(migrationsDir: string) {
  const initPath = path.join(migrationsDir, '001_init.sql');
  if (!fs.existsSync(initPath)) {
    const sql = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  channel TEXT NOT NULL,
  created_at TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_dir TEXT,
  attachments_count INTEGER NOT NULL DEFAULT 0,
  has_attachments INTEGER NOT NULL DEFAULT 0,
  subscribed_by TEXT,
  subscribed_at TEXT,
  summary TEXT,
  tags TEXT
);

CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages (created_at);
CREATE INDEX IF NOT EXISTS idx_messages_type ON messages (type);
CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages (channel);
CREATE INDEX IF NOT EXISTS idx_messages_has_attachments ON messages (has_attachments);
CREATE INDEX IF NOT EXISTS idx_messages_tags ON messages (tags);
`.trimStart();
    fs.writeFileSync(initPath, sql, 'utf8');
  }
}

function runMigrations(db: SQLiteDatabase, migrationsDir: string) {
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    db.exec(sql);
  }
}

export function writeEnvelope(
  storage: Storage,
  envelope: MessageEnvelope,
): string {
  const createdDate = envelope.createdAt.slice(0, 10);
  const dir = path.join(storage.inboxDir, createdDate);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const filePath = path.join(dir, `${envelope.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(envelope, null, 2), 'utf8');
  return filePath;
}

export function insertMessageIndex(
  storage: Storage,
  index: MessageIndexRow,
): void {
  const stmt = storage.db.prepare(
    `
INSERT OR REPLACE INTO messages (
  id,
  type,
  channel,
  created_at,
  file_path,
  file_dir,
  attachments_count,
  has_attachments,
  subscribed_by,
  subscribed_at,
  summary
) VALUES (
  ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
)
`,
  );
  stmt.run(
    index.id,
    index.type,
    index.channel,
    index.createdAt,
    index.filePath,
    index.fileDir,
    index.attachmentsCount,
    index.hasAttachments ? 1 : 0,
    index.subscribedBy ?? null,
    index.subscribedAt ?? null,
    index.summary ?? null,
  );
}

function encodeCursor(offset: number): string {
  return Buffer.from(String(offset), 'utf8').toString('base64');
}

function decodeCursor(cursor?: string | null): number {
  if (!cursor) return 0;
  try {
    const s = Buffer.from(cursor, 'base64').toString('utf8');
    const n = Number.parseInt(s, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function queryMessages(
  storage: Storage,
  filters: MessageFilters,
  limit: number,
  cursor?: string | null,
): QueryMessagesResult {
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  const offset = decodeCursor(cursor);

  let sql =
    'SELECT id, type, channel, created_at, has_attachments, attachments_count FROM messages WHERE 1=1';
  const params: Record<string, unknown> = {};

  if (filters.type) {
    sql += ' AND type = @type';
    params.type = filters.type;
  }
  if (filters.channel) {
    sql += ' AND channel = @channel';
    params.channel = filters.channel;
  }
  if (filters.since) {
    sql += ' AND created_at >= @since';
    params.since = filters.since;
  }
  if (filters.until) {
    sql += ' AND created_at <= @until';
    params.until = filters.until;
  }

  sql += ' ORDER BY created_at DESC, id DESC';
  sql += ' LIMIT @limit OFFSET @offset';
  params.limit = safeLimit;
  params.offset = offset;

  const stmt = storage.db.prepare(sql);
  const rows = stmt.all(params) as {
    id: string;
    type: string;
    channel: string;
    created_at: string;
    has_attachments: number;
    attachments_count: number;
  }[];

  const items: MessageView[] = rows.map((row) => ({
    id: row.id,
    type: row.type,
    channel: row.channel,
    createdAt: row.created_at,
    hasAttachments: !!row.has_attachments,
    attachmentsCount: row.attachments_count,
  }));

  const nextOffset = offset + items.length;
  const nextCursor =
    items.length === safeLimit ? encodeCursor(nextOffset) : null;

  return { items, nextCursor };
}

export function getMessageEnvelope(
  storage: Storage,
  id: string,
): MessageEnvelope | null {
  const stmt = storage.db.prepare(
    'SELECT file_path FROM messages WHERE id = @id',
  );
  const row = stmt.get({ id }) as { file_path: string } | undefined;
  if (!row) return null;
  const text = fs.readFileSync(row.file_path, 'utf8');
  return JSON.parse(text) as MessageEnvelope;
}

export function findUnclaimedMessages(
  storage: Storage,
  filters: MessageFilters,
  limit: number,
): MessageEnvelope[] {
  const safeLimit = Math.min(Math.max(limit, 1), 50);

  let sql =
    'SELECT id, file_path FROM messages WHERE subscribed_by IS NULL';
  const params: Record<string, unknown> = {};

  if (filters.type) {
    sql += ' AND type = @type';
    params.type = filters.type;
  }
  if (filters.channel) {
    sql += ' AND channel = @channel';
    params.channel = filters.channel;
  }

  sql += ' ORDER BY created_at ASC, id ASC';
  sql += ' LIMIT @limit';
  params.limit = safeLimit;

  const stmt = storage.db.prepare(sql);
  const rows = stmt.all(params) as {
    id: string;
    file_path: string;
  }[];

  const items: MessageEnvelope[] = [];
  for (const row of rows) {
    const text = fs.readFileSync(row.file_path, 'utf8');
    items.push(JSON.parse(text) as MessageEnvelope);
  }
  return items;
}

export function ackMessage(
  storage: Storage,
  id: string,
  subscriber: string,
): boolean {
  const now = new Date().toISOString();
  const stmt = storage.db.prepare(
    `
UPDATE messages
SET subscribed_by = @subscriber,
    subscribed_at = @claimedAt
WHERE id = @id
  AND (subscribed_by IS NULL OR subscribed_by = @subscriber)
`,
  );
  const result = stmt.run({ id, subscriber, claimedAt: now });
  return result.changes > 0;
}
```

---

```ts
// file: src/sorters.ts
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type {
  ZoboxConfig,
  sorterDefinition,
  AttachmentInput,
  AttachmentContext,
  AttachmentEnvelope,
  RoutesConfig,
  MessageEnvelope,
  FilenameStrategy,
} from './types';
import type { Storage } from './storage';

export interface sorterBinding {
  name: string;
  definition: sorterDefinition;
}

export interface ProcessAttachmentsResult {
  attachments: AttachmentEnvelope[];
  attachmentsDir: string | null;
}

export function resolveChannel(
  config: ZoboxConfig,
  itemType: string,
  explicitChannel?: string | null,
): string {
  if (explicitChannel && explicitChannel.trim().length > 0) {
    return explicitChannel.trim();
  }
  const typeDef = config.types[itemType];
  if (typeDef?.channel) {
    return String(typeDef.channel);
  }
  return config.zobox.default_channel;
}

export function getsorterForType(
  config: ZoboxConfig,
  type: string,
): sorterBinding | null {
  for (const [name, wf] of Object.entries(config.sorters)) {
    if (wf && typeof wf.type === 'string' && wf.type === type) {
      return { name, definition: wf };
    }
  }
  return null;
}

export function processAttachments(
  config: ZoboxConfig,
  storage: Storage,
  ctx: AttachmentContext,
  inputs: AttachmentInput[],
  sorterBinding?: sorterBinding | null,
): ProcessAttachmentsResult {
  if (!inputs.length || !config.files.enabled) {
    return { attachments: [], attachmentsDir: null };
  }

  const baseFilesDir =
    config.files.base_files_dir || storage.filesDir;
  const template =
    sorterBinding?.definition.files_path_template ??
    config.files.path_template;
  const keepBase64 = !!config.files.keep_base64_in_envelope;

  const attachments: AttachmentEnvelope[] = [];
  let attachmentsDir: string | null = null;

  const timestamp = sanitizeTimestamp(ctx.createdAt);
  const safeChannel = sanitizeChannel(ctx.channel);

  for (let i = 0; i < inputs.length; i += 1) {
    const input = inputs[i] as any;
    const isBase64 = typeof input.base64 === 'string';
    const originalFilename = input.filename as string;
    const finalFilename = applyFilenameStrategy(
      originalFilename,
      config.files.filename_strategy,
      ctx,
    );

    const rendered = renderPathTemplate(template, {
      baseFilesDir,
      channel: safeChannel,
      date: ctx.date,
      eventId: ctx.id,
      timestamp,
      filename: finalFilename,
    });

    const targetPath = path.isAbsolute(rendered)
      ? rendered
      : path.join(baseFilesDir, rendered);

    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const buffer: Buffer = isBase64
      ? Buffer.from(input.base64, 'base64')
      : input.buffer;

    fs.writeFileSync(targetPath, buffer);

    if (!attachmentsDir) {
      attachmentsDir = dir;
    }

    const attachment: AttachmentEnvelope = {
      id: `${ctx.id}_${i}`,
      filename: finalFilename,
      originalFilename,
      mimeType: input.mimeType,
      size: buffer.length,
      path: targetPath,
      source: isBase64 ? 'base64' : 'multipart',
    };

    if (keepBase64 && isBase64) {
      attachment.base64 = input.base64;
    }

    attachments.push(attachment);
  }

  return { attachments, attachmentsDir };
}

function sanitizeChannel(channel: string): string {
  return channel.replace(/[^A-Za-z0-9._-]+/g, '_');
}

function sanitizeTimestamp(iso: string): string {
  // Keep numbers and T; drop punctuation and timezone fluff
  return iso.replace(/[^0-9T]/g, '').slice(0, 15);
}

function applyFilenameStrategy(
  original: string,
  strategy: FilenameStrategy,
  ctx: AttachmentContext,
): string {
  if (strategy === 'original') return original;

  const lastDot = original.lastIndexOf('.');
  const name = lastDot > -1 ? original.slice(0, lastDot) : original;
  const ext = lastDot > -1 ? original.slice(lastDot) : '';

  let prefix = '';
  switch (strategy) {
    case 'timestampPrefix':
      prefix = `${sanitizeTimestamp(ctx.createdAt)}_`;
      break;
    case 'eventIdPrefix':
      prefix = `${ctx.id}_`;
      break;
    case 'uuid':
      prefix = `${crypto.randomUUID()}_`;
      break;
    default:
      prefix = '';
  }

  return `${prefix}${name}${ext}`;
}

function renderPathTemplate(
  template: string,
  ctx: {
    baseFilesDir: string;
    channel: string;
    date: string;
    eventId: string;
    timestamp: string;
    filename: string;
  },
): string {
  let result = template;
  const map: Record<string, string> = {
    baseFilesDir: ctx.baseFilesDir,
    channel: ctx.channel,
    date: ctx.date,
    eventId: ctx.eventId,
    timestamp: ctx.timestamp,
    filename: ctx.filename,
  };

  for (const [key, value] of Object.entries(map)) {
    const re = new RegExp(`\\{${key}\\}`, 'g');
    result = result.replace(re, value);
  }

  return result;
}

function buildAppendEntry(envelope: MessageEnvelope): string {
  const createdAt = envelope.createdAt;
  const preview = buildPayloadPreview(envelope.payload);
  return `- [${createdAt}] (${envelope.type}) ${preview} (id: ${envelope.id})\n`;
}

function buildPayloadPreview(payload: unknown): string {
  if (payload == null) return '';
  if (typeof payload === 'string') {
    return payload.slice(0, 120);
  }
  if (typeof payload === 'object') {
    const anyPayload = payload as any;
    if (typeof anyPayload.title === 'string') {
      return anyPayload.title;
    }
    if (typeof anyPayload.text === 'string') {
      return anyPayload.text.slice(0, 120);
    }
    if (typeof anyPayload.body === 'string') {
      return anyPayload.body.slice(0, 120);
    }
    try {
      return JSON.stringify(anyPayload).slice(0, 120);
    } catch {
      return '';
    }
  }
  return String(payload).slice(0, 120);
}

function appendToFile(
  target: string,
  envelope: MessageEnvelope,
  baseDir: string,
) {
  const filePath = path.isAbsolute(target)
    ? target
    : path.join(baseDir, target);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const entry = buildAppendEntry(envelope);
  fs.appendFileSync(filePath, entry, 'utf8');
}

async function routeItem(
  destinationName: string,
  envelope: MessageEnvelope,
  routesConfig?: DestinationsConfig,
): Promise<void> {
  if (!destinationName || destinationName === 'store_only') return;

  if (!routesConfig) {
    console.warn(
      `[zobox] route destination "${destinationName}" requested but no routes.json loaded`,
    );
    return;
  }

  const destination = routesConfig.destinations[destinationName];
  if (!destination) {
    console.warn(
      `[zobox] route destination "${destinationName}" not found in routes.json`,
    );
    return;
  }
  if (destination.enabled === false) return;
  if ((destination.kind && destination.kind !== 'http') || !destination.url) {
    console.warn(
      `[zobox] route destination "${destinationName}" is not an HTTP destination or missing url`,
    );
    return;
  }

  const method = (destination.method || 'POST').toUpperCase();
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(destination.headers ?? {}),
  };

  try {
    const res = await fetch(destination.url, {
      method,
      headers,
      body: JSON.stringify(envelope),
    });
    if (!res.ok) {
      console.warn(
        `[zobox] route "${destinationName}" HTTP ${res.status} when sending to ${destination.url}`,
      );
    }
  } catch (err) {
    console.error(
      `[zobox] route "${destinationName}" failed:`,
      err instanceof Error ? err.message : err,
    );
  }
}

export async function applysortersideEffects(
  sorterBinding: sorterBinding | null,
  envelope: MessageEnvelope,
  storage: Storage,
  routesConfig?: RoutesConfig,
): Promise<void> {
  if (!sorterBinding) return;

  const wf = sorterBinding.definition;

  if (wf.append_to_file) {
    try {
      appendToFile(wf.append_to_file, envelope, storage.baseDir);
    } catch (err) {
      console.error(
        `[zobox] Failed to append to ${wf.append_to_file}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  if (wf.destination) {
    await routeMessage(wf.destination, envelope, routesConfig);
  }
}
```

---

```ts
// file: src/server.ts
import crypto from 'node:crypto';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { loadConfig, loadRoutesConfig } from './config.js';
import {
  initStorage,
  writeEnvelope,
  insertItemIndex,
  queryMessages,
  findUnclaimedMessages,
  ackMessage,
} from './storage.js';
import {
  resolveChannel,
  getsorterForType,
  processAttachments,
  applysortersideEffects,
} from './sorters.js';
import type {
  ZoboxConfig,
  RoutesConfig,
  NewItemInput,
  AttachmentInput,
  MessageEnvelope,
  MessageFilters,
  MessageIndexRow,
} from './types.js';
import type { Storage } from './storage.js';

interface RuntimeContext {
  config: ZoboxConfig;
  storage: Storage;
  routes?: RoutesConfig;
}

type AppEnv = {
  Variables: {
    runtime: RuntimeContext;
  };
};

export async function startServer(options?: {
  baseDir?: string;
  port?: number;
}): Promise<void> {
  const baseDir =
    options?.baseDir ||
    process.env.ZOBOX_BASE_DIR ||
    '/home/workspace/Inbox';
  const port = options?.port
    ? options.port
    : Number.parseInt(process.env.ZOBOX_PORT ?? '8787', 10);

  const config = loadConfig(baseDir);
  const storage = initStorage(config);
  const routes = loadRoutesConfig(baseDir);

  const runtime: RuntimeContext = {
    config,
    storage,
    routes,
  };

  const app = new Hono<AppEnv>();

  // Attach runtime context
  app.use('*', async (c, next) => {
    c.set('runtime', runtime);
    return next();
  });

  app.get('/health', (c) => c.json({ status: 'ok' }));

  app.post('/messages', async (c) => {
    const runtimeCtx = c.get('runtime');
    const auth = authenticate(c, runtimeCtx.config, {
      requireAdmin: true,
    });
    if ('error' in auth) {
      return c.json(auth.error, auth.status);
    }

    const contentType = (c.req.header('content-type') || '').toLowerCase();
    const attachments: AttachmentInput[] = [];
    let message: NewMessageInput;

    try {
      if (contentType.includes('multipart/form-data')) {
        const body = (await c.req.parseBody()) as Record<
          string,
          unknown
        >;

        const eventRaw =
          (body['event'] as string | undefined) ??
          (body['message'] as string | undefined) ??
          (body['json'] as string | undefined);

        if (!eventRaw) {
          return c.json(
            {
              error:
                'multipart/form-data must include an "event" field containing JSON metadata',
            },
            400,
          );
        }

        let parsed: any;
        try {
          parsed = JSON.parse(eventRaw);
        } catch {
          return c.json({ error: 'Invalid JSON in "event" field' }, 400);
        }

        message = normalizeNewMessageInput(parsed);

        for (const [key, value] of Object.entries(body)) {
          const v: any = value;
          if (
            v &&
            typeof v === 'object' &&
            typeof v.arrayBuffer === 'function' &&
            typeof v.name === 'string'
          ) {
            const arrayBuffer = await v.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            attachments.push({
              filename: v.name,
              mimeType: v.type,
              buffer,
              fieldName: key,
            });
          }
        }
      } else {
        let raw: any;
        try {
          raw = await c.req.json();
        } catch {
          return c.json({ error: 'Invalid JSON body' }, 400);
        }

        message = normalizeNewMessageInput(raw);

        if (Array.isArray(raw.attachments)) {
          for (const att of raw.attachments as any[]) {
            if (!att) continue;
            if (!att.filename || !att.base64) continue;
            attachments.push({
              filename: String(att.filename),
              mimeType: att.mimeType ? String(att.mimeType) : undefined,
              base64: String(att.base64),
            });
          }
        }
      }
    } catch (err) {
      console.error('[zobox] error parsing /messages request', err);
      return c.json({ error: 'Failed to parse request' }, 400);
    }

    const now = new Date();
    const createdAt = now.toISOString();
    const date = createdAt.slice(0, 10);
    const id = crypto.randomUUID();

    const channel = resolveChannel(
      runtimeCtx.config,
      message.type,
      message.channel,
    );
    const sorterBinding = getsorterForType(
      runtimeCtx.config,
      message.type,
    );

    let processedAttachments: {
      attachments: AttachmentInput[];
      attachmentsDir: string | null;
      normalizedAttachments: MessageEnvelope['attachments'];
    };

    try {
      const { attachments: normalized, attachmentsDir } = processAttachments(
        runtimeCtx.config,
        runtimeCtx.storage,
        { id, type: message.type, channel, createdAt, date },
        attachments,
        sorterBinding,
      );

      processedAttachments = {
        attachments,
        attachmentsDir,
        normalizedAttachments: normalized,
      };
    } catch (err) {
      console.error(
        '[zobox] error processing attachments',
        err,
      );
      return c.json(
        { error: 'Failed to store attachments' },
        500,
      );
    }

    const envelope: MessageEnvelope = {
      id,
      type: message.type,
      source: message.source ?? 'api',
      channel,
      payload: message.payload,
      attachments: processedAttachments.normalizedAttachments,
      meta: message.meta,
      createdAt,
    };

    const filePath = writeEnvelope(runtimeCtx.storage, envelope);

    const index: MessageIndexRow = {
      id,
      type: envelope.type,
      channel: envelope.channel,
      createdAt,
      filePath,
      fileDir: processedAttachments.attachmentsDir,
      attachmentsCount: envelope.attachments.length,
      hasAttachments: envelope.attachments.length > 0,
      claimedBy: null,
      claimedAt: null,
      summary: null,
    };

    insertItemIndex(runtimeCtx.storage, index);

    await applysortersideEffects(
      sorterBinding,
      envelope,
      runtimeCtx.storage,
      runtimeCtx.routes,
    );

    return c.json(
      {
        message: {
          id,
          type: envelope.type,
          channel: envelope.channel,
          createdAt,
          hasAttachments: envelope.attachments.length > 0,
          attachmentsCount: envelope.attachments.length,
        },
      },
      201,
    );
  });

  app.get('/messages', (c) => {
    const runtimeCtx = c.get('runtime');
    const auth = authenticate(c, runtimeCtx.config);
    if ('error' in auth) {
      return c.json(auth.error, auth.status);
    }

    const query = c.req.query();
    const filters: MessageFilters = {
      type: query.type,
      channel: query.channel,
      since: query.since,
      until: query.until,
    };

    const limit = query.limit
      ? Number.parseInt(query.limit, 10)
      : 50;
    const cursor = query.cursor || undefined;

    const result = queryMessages(runtimeCtx.storage, filters, limit, cursor);
    return c.json(result);
  });

  app.get('/messages/next', (c) => {
    const runtimeCtx = c.get('runtime');
    const auth = authenticate(c, runtimeCtx.config);
    if ('error' in auth) {
      return c.json(auth.error, auth.status);
    }

    const query = c.req.query();
    const subscriber = query.subscriber;
    if (!subscriber) {
      return c.json(
        { error: '"subscriber" query parameter is required' },
        400,
      );
    }

    const limit = query.limit
      ? Number.parseInt(query.limit, 10)
      : 10;
    const filters: MessageFilters = {
      type: query.type,
      channel: query.channel,
    };

    const items = findUnclaimedMessages(
      runtimeCtx.storage,
      filters,
      limit,
    );
    return c.json({ items });
  });

  app.post('/messages/:id/ack', async (c) => {
    const runtimeCtx = c.get('runtime');
    const auth = authenticate(c, runtimeCtx.config, {
      requireAdmin: true,
    });
    if ('error' in auth) {
      return c.json(auth.error, auth.status);
    }

    const id = c.req.param('id');
    let subscriber: string | undefined;

    try {
      const body = (await c.req
        .json()
        .catch(() => ({}))) as any;
      if (body && typeof body.subscriber === 'string') {
        subscriber = body.subscriber;
      }
    } catch {
      // ignore body parse errors, handled below
    }

    const qSubscriber = c.req.query('subscriber');
    if (!subscriber && qSubscriber) {
      subscriber = qSubscriber;
    }

    if (!subscriber) {
      return c.json(
        {
          error:
            '"subscriber" must be provided in body or query string',
        },
        400,
      );
    }

    const ok = ackMessage(runtimeCtx.storage, id, subscriber);
    if (!ok) {
      return c.json(
        {
          error:
            'Message not found or already claimed by another subscriber',
        },
        409,
      );
    }

    return c.json({ status: 'ok', id, subscriber });
  });

  // Reserved admin config endpoints (V1: not implemented)
  app.get('/admin/config', (c) =>
    c.json(
      {
        status: 'not_implemented',
        message:
          'Admin config endpoint is reserved for future UI integrations.',
      },
      501,
    ),
  );

  app.put('/admin/config', (c) =>
    c.json(
      {
        status: 'not_implemented',
        message:
          'Admin config endpoint is reserved for future UI integrations.',
      },
      501,
    ),
  );

  console.log(
    `[zobox] Listening on http://localhost:${port} (baseDir=${runtime.storage.baseDir})`,
  );

  // Bun and Node both support this
  serve({
    fetch: app.fetch,
    port,
  });
}

function normalizeNewMessageInput(raw: any): NewMessageInput {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid message body');
  }
  const type = String(raw.type ?? '').trim();
  if (!type) {
    throw new Error('"type" is required');
  }
  const payload =
    raw.payload !== undefined ? raw.payload : (raw.data ?? {});
  const channel =
    typeof raw.channel === 'string' ? raw.channel : undefined;
  const source =
    typeof raw.source === 'string' ? raw.source : undefined;
  const meta = raw.meta;
  return { type, payload, channel, source, meta };
}

function extractBearerToken(
  authHeader?: string | null,
): string | undefined {
  if (!authHeader) return undefined;
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : undefined;
}

function authenticate(
  c: Hono.Context<AppEnv>,
  config: ZoboxConfig,
  opts: { requireAdmin?: boolean; requireAuthForPublic?: boolean } = {},
):
  | { role: 'admin' | 'read' | 'public' }
  | { error: { error: string }; status: number } {
  const required = config.auth.required ?? true;
  const headerKey =
    c.req.header('x-api-key') ??
    extractBearerToken(c.req.header('authorization'));
  const adminKeyEnv =
    process.env[config.auth.admin_api_key_env_var];
  const readKeyEnv =
    config.auth.read_api_key_env_var
      ? process.env[config.auth.read_api_key_env_var]
      : undefined;

  if (!required && !headerKey) {
    return { role: 'public' };
  }

  let role: 'admin' | 'read' | 'public' | null = null;

  if (headerKey && adminKeyEnv && headerKey === adminKeyEnv) {
    role = 'admin';
  } else if (headerKey && readKeyEnv && headerKey === readKeyEnv) {
    role = 'read';
  }

  if (!role) {
    if (!required && !opts.requireAuthForPublic) {
      return { role: 'public' };
    }
    return {
      error: { error: 'Unauthorized' },
      status: 401,
    };
  }

  if (opts.requireAdmin && role !== 'admin') {
    return {
      error: { error: 'Forbidden: admin key required' },
      status: 403,
    };
  }

  return { role };
}
```

---

```ts
// file: bin/zobox.ts
#!/usr/bin/env bun
import { startServer } from '../src/server.js';
import { loadConfig } from '../src/config.js';
import { initStorage } from '../src/storage.js';

function printHelp() {
  console.log(`
zobox - Zo-native inbox + sorter + router

Usage:
  zobox start [--base-dir PATH] [--port PORT]
  zobox migrate [--base-dir PATH]
  zobox help

Environment:
  ZOBOX_BASE_DIR   Base directory for inbox (default: /home/workspace/Inbox)
  ZOBOX_PORT       Port to listen on (default: 8787)

For Zo, configure a User Service with:
  Label: zobox
  Type: http
  Local port: 8787
  Entrypoint: bunx zobox start
  Workdir: /home/workspace/Inbox
`);
}

async function main() {
  const argv = process.argv.slice(2);
  const command = argv[0] ?? 'start';
  const args = argv.slice(1);

  let baseDir =
    process.env.ZOBOX_BASE_DIR || '/home/workspace/Inbox';
  let port = Number.parseInt(
    process.env.ZOBOX_PORT ?? '8787',
    10,
  );

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--base-dir' && i + 1 < args.length) {
      baseDir = args[i + 1];
      i += 1;
    } else if (
      (arg === '--port' || arg === '-p') &&
      i + 1 < args.length
    ) {
      const parsed = Number.parseInt(args[i + 1], 10);
      if (Number.isFinite(parsed)) {
        port = parsed;
      }
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      return;
    }
  }

  switch (command) {
    case 'start':
      await startServer({ baseDir, port });
      break;
    case 'migrate': {
      const config = loadConfig(baseDir);
      initStorage(config); // runs migrations as a side-effect
      console.log('[zobox] migrations applied');
      break;
    }
    case 'help':
    default:
      printHelp();
  }
}

main().catch((err) => {
  console.error('[zobox] fatal error', err);
  process.exit(1);
});
```

---

```toml
# file: config/zobox.config.example.toml

[zobox]
base_dir = "/home/workspace/Inbox"
db_path = "/home/workspace/Inbox/db/zobox.db"
default_channel = "Inbox"

[auth]
admin_api_key_env_var = "ZOBOX_ADMIN_API_KEY" # full read/write
read_api_key_env_var  = "ZOBOX_READ_API_KEY"  # optional read-only
required = true

[files]
enabled = true
base_files_dir = "/home/workspace/Inbox/files"
path_template = "{baseFilesDir}/{channel}/{date}/{eventId}/{filename}"
filename_strategy = "original" # original | timestampPrefix | eventIdPrefix | uuid
keep_base64_in_envelope = false

[types.update]
description = "Generic status update"
channel = "Updates"
payload_example = """
{
  "title": "Short title",
  "body": "Longer markdown text",
  "tags": ["status", "personal"]
}
"""

[types.post]
description = "Blog post"
channel = "Posts"
payload_example = """
{
  "title": "My post",
  "slug": "my-post",
  "body": "markdown here"
}
"""

[sorters.updates]
type = "update"
description = "Append updates to a rolling log."
files_path_template = "{baseFilesDir}/Updates/{date}/{eventId}/{filename}"
append_to_file = "/home/workspace/Inbox/updates.md"
destination = "store_only"

[sorters.posts]
type = "post"
description = "Publish posts to content folder."
files_path_template = "{baseFilesDir}/Posts/{date}/{eventId}/{filename}"
append_to_file = "/home/workspace/Inbox/posts_index.md"
destination = "publish_to_worker"
```

---

```json
// file: config/routes.example.json
{
  "$schema": "https://galligan.dev/zobox/routes.schema.json",
  "destinations": {
    "store_only": {
      "kind": "noop",
      "description": "Do nothing, keep message in local inbox."
    },
    "publish_to_worker": {
      "kind": "http",
      "description": "POST the full message envelope to a worker service.",
      "url": "http://localhost:9000/zobox/messages",
      "method": "POST",
      "headers": {
        "content-type": "application/json"
      },
      "enabled": true,
      "timeoutMs": 5000
    }
  }
}
```

---

```sql
-- file: db/migrations/001_init.sql
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  channel TEXT NOT NULL,
  created_at TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_dir TEXT,
  attachments_count INTEGER NOT NULL DEFAULT 0,
  has_attachments INTEGER NOT NULL DEFAULT 0,
  subscribed_by TEXT,
  subscribed_at TEXT,
  summary TEXT,
  tags TEXT
);

CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages (created_at);
CREATE INDEX IF NOT EXISTS idx_messages_type ON messages (type);
CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages (channel);
CREATE INDEX IF NOT EXISTS idx_messages_has_attachments ON messages (has_attachments);
CREATE INDEX IF NOT EXISTS idx_messages_tags ON messages (tags);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  description TEXT,
  color TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT DEFAULT 'system',
  metadata TEXT
);

CREATE TABLE IF NOT EXISTS message_tags (
  message_id TEXT NOT NULL,
  tag_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  added_by TEXT DEFAULT 'system',
  source TEXT DEFAULT 'user',
  metadata TEXT,
  PRIMARY KEY (message_id, tag_id),
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_message_tags_message_id ON message_tags(message_id);
CREATE INDEX IF NOT EXISTS idx_message_tags_tag_id ON message_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_message_tags_source ON message_tags(source);
```

---

````md
<!-- file: README.md -->

# zobox

Zobox is a Zo‑native, open‑source inbox + sorter + router engine.

- Single ingestion endpoint: `POST /messages`
- Filesystem is the source of truth (`inbox/` + `files/`)
- SQLite index for fast listing & worker polling
- Types + sorters driven by `zobox.config.toml`
- Bun/Hono server, easy to run as a Zo User Service

## Install

```bash
bun install
````

Or with npm:

```bash
npm install zobox
```

## Quick start (local)

```bash
export ZOBOX_ADMIN_API_KEY="dev-admin-key"
export ZOBOX_READ_API_KEY="dev-read-key"

# set up base dir (matches defaults)
mkdir -p /home/workspace/Inbox
cp config/zobox.config.example.toml /home/workspace/Inbox/zobox.config.toml
mkdir -p /home/workspace/Inbox/db/migrations
cp db/migrations/001_init.sql /home/workspace/Inbox/db/migrations/001_init.sql

ZOBOX_BASE_DIR=/home/workspace/Inbox bun run src/server.ts
```

Then:

```bash
curl -X POST "http://localhost:8787/messages" \
  -H "content-type: application/json" \
  -H "x-api-key: $ZOBOX_ADMIN_API_KEY" \
  -d '{
    "type": "update",
    "payload": { "text": "First idea" }
  }'
```

List messages:

```bash
curl "http://localhost:8787/messages?limit=20" \
  -H "x-api-key: $ZOBOX_READ_API_KEY"
```

## Zo integration

Create a User Service in Zo:

* **Label**: `zobox`
* **Type**: `http`
* **Local port**: `8787`
* **Entrypoint**: `bunx zobox start`
* **Workdir**: `/home/workspace/Inbox`

Copy:

* `config/zobox.config.example.toml` → `/home/workspace/Inbox/zobox.config.toml`
* `db/migrations/001_init.sql` → `/home/workspace/Inbox/db/migrations/001_init.sql`

Set environment variables on the service:

* `ZOBOX_ADMIN_API_KEY`
* `ZOBOX_READ_API_KEY` (optional)
* `ZOBOX_BASE_DIR=/home/workspace/Inbox`

## HTTP API

### `POST /messages`

Supports:

* `Content-Type: application/json`

  * `{ "type": "update", "payload": { ... }, "attachments": [{ "filename", "mimeType", "base64" }] }`
* `Content-Type: multipart/form-data`

  * `event` field: JSON blob
  * file fields: binary file parts

Returns a `MessageView` projection:

```json
{
  "message": {
    "id": "uuid",
    "type": "update",
    "channel": "Updates",
    "createdAt": "2025-11-22T12:34:56.789Z",
    "hasAttachments": true,
    "attachmentsCount": 2
  }
}
```

Requires admin API key.

### `GET /messages`

Query params:

* `type`
* `channel`
* `since` / `until` (ISO timestamps)
* `limit` (default 50, max 100)
* `cursor` (opaque pagination cursor)

Response:

```json
{
  "items": [
    {
      "id": "uuid",
      "type": "update",
      "channel": "Updates",
      "createdAt": "2025-11-22T12:34:56.789Z",
      "hasAttachments": true,
      "attachmentsCount": 2
    }
  ],
  "nextCursor": "base64-offset-or-null"
}
```

### `GET /messages/next`

Worker polling for unclaimed messages.

Query params:

* `subscriber` (required)
* `type`
* `channel`
* `limit` (default 10, max 50)

Returns an array of full envelopes:

```json
{
  "items": [
    {
      "id": "uuid",
      "type": "update",
      "channel": "Updates",
      "payload": { "text": "Hello" },
      "attachments": [],
      "createdAt": "2025-11-22T12:34:56.789Z"
    }
  ]
}
```

Note: messages are considered “unclaimed” until a worker `POST`s `/messages/:id/ack`.

### `POST /messages/:id/ack`

Marks an item as processed by a `subscriber`.

* Path param: `id`
* Body or query: `{ "subscriber": "worker-name" }`

Returns:

```json
{ "status": "ok", "id": "…", "subscriber": "worker-name" }
```

### `GET /health`

Simple health check:

```json
{ "status": "ok" }
```

### Auth

* Header: `x-api-key: YOUR_KEY`
* Or: `authorization: Bearer YOUR_KEY`

`zobox.config.toml` tells Zobox which env vars to read:

```toml
[auth]
admin_api_key_env_var = "ZOBOX_ADMIN_API_KEY"
read_api_key_env_var  = "ZOBOX_READ_API_KEY"
required = true
```

Admin key is required for ingest and ack; read key can be used for listing and polling.

## sorters & routes

sorters are configured in `zobox.config.toml`:

```toml
[sorters.posts]
type = "post"
files_path_template = "{baseFilesDir}/Posts/{date}/{eventId}/{filename}"
append_to_file = "/home/workspace/Inbox/posts_index.md"
destination = "publish_to_worker"
```

Destinations are declared in `routes.json` (runtime) using the schema illustrated in `config/routes.example.json`.

* `store_only` → no outbound routing
* `publish_to_worker` → POST envelope to external worker

Routing failures are logged to stdout and do not block ingestion.

## Storage layout

Given `base_dir = "/home/workspace/Inbox"`:

* Envelopes: `/home/workspace/Inbox/inbox/YYYY-MM-DD/<id>.json`
* Attachments: path templates (defaults to `{baseFilesDir}/{channel}/{date}/{eventId}/{filename}`)
* SQLite: `/home/workspace/Inbox/db/zobox.db`
* Logs (for future use): `/home/workspace/Inbox/logs/`

SQLite table: `messages` with columns:

* `id`, `type`, `channel`, `created_at`
* `file_path`, `file_dir`
* `attachments_count`, `has_attachments`
* `subscribed_by`, `subscribed_at`
* `summary` (reserved for future previews)
* `tags` (JSON string)

````

---

```md
<!-- file: zobox.prompt.md -->

# Zobox: Configure

You are configuring the Zobox inbox + sorter + router engine that runs as a User Service on my Zo.

Zobox is driven by a TOML config file at:

- `/home/workspace/Inbox/zobox.config.toml`

and optional routing config:

- `/home/workspace/Inbox/routes.json`

## Inputs

- What I want to do:
  - Add or update a **type**
  - Add or update a **sorter**
  - Change global settings (base_dir, auth, files)
  - Add or update a **route profile**

## Procedure

1. **Understand the intent**

   - Ask me *once* what I want to change in Zobox (type, sorter, files, auth, or routes).
   - Summarize the change you plan to make before editing files.

2. **Load current config**

   - Read `/home/workspace/Inbox/zobox.config.toml`.
   - If the file does not exist, copy `config/zobox.config.example.toml` from this repo into `/home/workspace/Inbox/zobox.config.toml` and then read it.

3. **Modify config**

   - For **types**:
     - Use `[types.<typeName>]` sections.
     - Always maintain: `description`, `channel`, and `payload_example` if possible.
   - For **sorters**:
     - Use `[sorters.<sorterName>]` sections.
     - Always set: `type`, `description`.
     - Optionally set: `files_path_template`, `append_to_file`, `destination`.
   - For **files**:
     - Keep `path_template` and `base_files_dir` consistent with `/home/workspace/Inbox/files`.
     - Maintain a valid `filename_strategy` (`original`, `timestampPrefix`, `eventIdPrefix`, or `uuid`).
   - For **auth**:
     - Keep env var names simple and UPPER_SNAKE_CASE.
   - Make edits using precise TOML updates; keep formatting readable.

4. **Routing destinations**

   - If I ask to send messages to external workers or webhooks:
     - Read `/home/workspace/Inbox/routes.json` if it exists.
     - If it doesn't, create it based on `config/routes.example.json`.
     - Add/modify a `destinations.<name>` entry with:
       - `kind: "http"`
       - `url`
       - Optional `method`, `headers`, `enabled`, `timeoutMs`.

5. **Validate**

   - After editing, re-open the file and sanity-check:
     - TOML syntax is valid.
     - No obviously duplicated or conflicting type/sorter names.
     - Path templates use only supported tokens:
       - `{baseFilesDir}`, `{channel}`, `{date}`, `{eventId}`, `{timestamp}`, `{filename}`.

6. **Summarize**

   - Report back:
     - Which sections you changed.
     - New/updated types, sorters, and route destinations.
     - Any manual steps I should take next (e.g. restart the Zobox service, update env vars).

Use concise, technical language. Prefer editing the existing config over inventing new abstractions.
````
