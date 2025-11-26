# Zobox

Zobox is a Zo-native inbox + sorter + router. It ingests JSON (multipart or raw), stores envelopes and attachments on disk/SQLite, and routes them via configurable sorters.

## Quickstart (Zo-first)

1) **Install deps**
```bash
bun install
```

2) **Initialize your base dir** (creates folders, copies example configs, runs migrations, generates API keys if needed)
```bash
bunx zobox init --base-dir /home/workspace/Inbox
```
- If you pass `--admin-key` / `--read-key`, those are stored (hashed) in SQLite.
- If not provided, keys are generated and printed **once**; save them.

3) **Start the server** (init already starts it; re-run with serve)
```bash
bunx zobox serve --base-dir /home/workspace/Inbox --port 8787
```

4) **Send a message**
```bash
curl -X POST "http://localhost:8787/messages" \
  -H "content-type: application/json" \
  -H "x-api-key: YOUR_ADMIN_KEY" \
  -d '{"type":"update","payload":{"text":"First idea"}}'
```

5) **Read messages**
```bash
curl "http://localhost:8787/messages?limit=20" \
  -H "x-api-key: YOUR_READ_KEY"
```

That’s it—you have a Zo-ready inbox + router running locally.

## Docs
- **API**: `docs/API.md`
- **Configuration**: `docs/CONFIGURATION.md`
- **Development setup & workflows**: `docs/development/setup.md`

### 2. Create User Service

Configure in Zo:

- **Label**: `zobox`
- **Type**: `http`
- **Local port**: `8787`
- **Entrypoint**: `bunx zobox serve`
- **Workdir**: `/home/workspace/Inbox`

### 3. Set Environment Variables

Add to your Zo service configuration:

- `ZOBOX_ADMIN_API_KEY` (required)
- `ZOBOX_READ_API_KEY` (optional, recommended)

Your Zobox service will start automatically with Zo.

## API Overview

See **[docs/API.md](docs/API.md)** for complete documentation.

### Core Endpoints

- **`POST /messages`**: Ingest messages (JSON or multipart with attachments)
- **`GET /messages`**: List messages with filtering and cursor pagination (response key: `items`)
- **`GET /messages/next`**: Worker polling for unclaimed messages
- **`POST /messages/:id/ack`**: Acknowledge item processing
- **`GET /health`**: Health check

### Authentication

```bash
# Admin key (full access)
x-api-key: YOUR_ADMIN_KEY

# Read key (read-only)
x-api-key: YOUR_READ_KEY

# Or Bearer token
authorization: Bearer YOUR_KEY
```

Configure in `zobox.config.toml`:

```toml
[auth]
admin_api_key_env_var = "ZOBOX_ADMIN_API_KEY"
read_api_key_env_var  = "ZOBOX_READ_API_KEY"
required = true
```

### Ingest Examples

**JSON only**:

```bash
curl -X POST "http://localhost:8787/messages" \
  -H "content-type: application/json" \
  -H "x-api-key: YOUR_ADMIN_KEY" \
  -d '{"type":"update","payload":{"text":"Hello"}}'
```

**JSON + base64 attachments**:

```bash
curl -X POST "http://localhost:8787/messages" \
  -H "content-type: application/json" \
  -H "x-api-key: YOUR_ADMIN_KEY" \
  -d '{
    "type":"post",
    "payload":{"title":"My post"},
    "attachments":[{"filename":"photo.jpg","mimeType":"image/jpeg","base64":"..."}]
  }'
```

**Multipart with files**:

```bash
curl -X POST "http://localhost:8787/messages" \
  -H "x-api-key: YOUR_ADMIN_KEY" \
  -F 'event={"type":"post","payload":{"title":"My post"}}' \
  -F 'photo=@photo.jpg'
```

## Configuration

See **[docs/CONFIGURATION.md](docs/CONFIGURATION.md)** for complete guide.

### Types and Sorters

Define types in `zobox.config.toml`:

```toml
[types.update]
description = "Generic status update"
channel = "Updates"

[sorters.updates]
type = "update"
files_path_template = "{baseFilesDir}/Updates/{date}/{eventId}/{filename}"
append_to_file = "/home/workspace/Inbox/updates.md"
destination = "store_only"
```

### Path Templates

Control where attachments are stored using tokens:

- `{baseFilesDir}`: Base files directory
- `{channel}`: Item channel
- `{date}`: ISO date (YYYY-MM-DD)
- `{eventId}`: Item UUID
- `{timestamp}`: Sanitized timestamp
- `{filename}`: Final filename

Example: `{baseFilesDir}/{channel}/{date}/{eventId}/{filename}`
Renders: `/home/workspace/Inbox/files/Updates/2025-11-22/550e8400.../photo.jpg`

### Filename Strategies

- `original`: Keep original filename
- `timestampPrefix`: Prefix with `20251122T123456_`
- `eventIdPrefix`: Prefix with item UUID
- `uuid`: Replace filename with new UUID

### Route Destinations

Define routing in `routes.json`:

```json
{
  "destinations": {
    "store_only": {
      "kind": "noop"
    },
    "publish_to_worker": {
      "kind": "http",
      "url": "http://localhost:9000/zobox/messages",
      "method": "POST",
      "enabled": true
    }
  }
}
```

Reference in sorter:

```toml
[sorters.posts]
type = "post"
destination = "publish_to_worker"
```

## Storage Layout

Given `base_dir = "/home/workspace/Inbox"`:

```
/home/workspace/Inbox/
  zobox.config.toml
  routes.json
  inbox/
    YYYY-MM-DD/
      <message-id>.json   # Message envelopes
  files/
    <channel>/
      YYYY-MM-DD/
        <item-id>/
          <filename>        # Attachments
  db/
    zobox.db              # SQLite index
    migrations/
      001_init.sql
  logs/                    # Reserved for future use
```

### SQLite Schema

Table `messages`:

- `id`, `type`, `channel`, `created_at`
- `file_path`, `file_dir`
- `attachments_count`, `has_attachments`
- `subscribed_by`, `subscribed_at`
- `summary` (reserved for future previews)
- `tags` (JSON string)

Indexes on `created_at`, `type`, `channel`, `has_attachments`, `tags` for fast queries.
