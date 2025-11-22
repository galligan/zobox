
# zorter

Zorter is a Zo‑native, open‑source inbox + sorter + router engine.

- Single ingestion endpoint: `POST /items`
- Filesystem is the source of truth (`inbox/` + `files/`)
- SQLite index for fast listing & worker polling
- Types + workflows driven by `zorter.config.toml`
- Bun/Hono server, easy to run as a Zo User Service

## Install

```bash
bun install
````

Or with npm:

```bash
npm install zorter
```

## Quick start (local)

```bash
export ZORTER_ADMIN_API_KEY="dev-admin-key"
export ZORTER_READ_API_KEY="dev-read-key"

# set up base dir (matches defaults)
mkdir -p /home/workspace/Inbox
cp config/zorter.config.example.toml /home/workspace/Inbox/zorter.config.toml
mkdir -p /home/workspace/Inbox/db/migrations
cp db/migrations/001_init.sql /home/workspace/Inbox/db/migrations/001_init.sql

ZORTER_BASE_DIR=/home/workspace/Inbox bun run src/server.ts
```

Then:

```bash
curl -X POST "http://localhost:8787/items" \
  -H "content-type: application/json" \
  -H "x-api-key: $ZORTER_ADMIN_API_KEY" \
  -d '{
    "type": "update",
    "payload": { "text": "First idea" }
  }'
```

List items:

```bash
curl "http://localhost:8787/items?limit=20" \
  -H "x-api-key: $ZORTER_READ_API_KEY"
```

## Zo integration

Create a User Service in Zo:

* **Label**: `zorter`
* **Type**: `http`
* **Local port**: `8787`
* **Entrypoint**: `bunx zorter start`
* **Workdir**: `/home/workspace/Inbox`

Copy:

* `config/zorter.config.example.toml` → `/home/workspace/Inbox/zorter.config.toml`
* `db/migrations/001_init.sql` → `/home/workspace/Inbox/db/migrations/001_init.sql`

Set environment variables on the service:

* `ZORTER_ADMIN_API_KEY`
* `ZORTER_READ_API_KEY` (optional)
* `ZORTER_BASE_DIR=/home/workspace/Inbox`

## HTTP API

### `POST /items`

Supports:

* `Content-Type: application/json`

  * `{ "type": "update", "payload": { ... }, "attachments": [{ "filename", "mimeType", "base64" }] }`
* `Content-Type: multipart/form-data`

  * `event` field: JSON blob
  * file fields: binary file parts

Returns an `ItemView` projection:

```json
{
  "item": {
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

### `GET /items`

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

### `GET /items/next`

Worker polling for unclaimed items.

Query params:

* `consumer` (required)
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

Note: items are considered “unclaimed” until a worker `POST`s `/items/:id/ack`.

### `POST /items/:id/ack`

Marks an item as processed by a `consumer`.

* Path param: `id`
* Body or query: `{ "consumer": "worker-name" }`

Returns:

```json
{ "status": "ok", "id": "…", "consumer": "worker-name" }
```

### `GET /health`

Simple health check:

```json
{ "status": "ok" }
```

### Auth

* Header: `x-api-key: YOUR_KEY`
* Or: `authorization: Bearer YOUR_KEY`

`zorter.config.toml` tells Zorter which env vars to read:

```toml
[auth]
admin_api_key_env_var = "ZORTER_ADMIN_API_KEY"
read_api_key_env_var  = "ZORTER_READ_API_KEY"
required = true
```

Admin key is required for ingest and ack; read key can be used for listing and polling.

## Workflows & routes

Workflows are configured in `zorter.config.toml`:

```toml
[workflows.posts]
type = "post"
files_path_template = "{baseFilesDir}/Posts/{date}/{eventId}/{filename}"
append_to_file = "/home/workspace/Inbox/posts_index.md"
route_profile = "publish_to_worker"
```

Route profiles are declared in `routes.json` (runtime) using the schema illustrated in `config/routes.example.json`.

* `store_only` → no outbound routing
* `publish_to_worker` → POST envelope to external worker

Routing failures are logged to stdout and do not block ingestion.

## Storage layout

Given `base_dir = "/home/workspace/Inbox"`:

* Envelopes: `/home/workspace/Inbox/inbox/YYYY-MM-DD/<id>.json`
* Attachments: path templates (defaults to `{baseFilesDir}/{channel}/{date}/{eventId}/{filename}`)
* SQLite: `/home/workspace/Inbox/db/zorter.db`
* Logs (for future use): `/home/workspace/Inbox/logs/`

SQLite table: `items` with columns:

* `id`, `type`, `channel`, `created_at`
* `file_path`, `file_dir`
* `attachments_count`, `has_attachments`
* `claimed_by`, `claimed_at`
* `summary` (reserved for future previews)

