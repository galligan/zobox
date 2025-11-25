# Zobox

Zobox is a Zo-native, open-source inbox + sorter + router engine. It accepts arbitrary structured JSON messages with optional file attachments, stores them durably, and routes them according to configurable sorters.

## Features

- **Single ingestion endpoint**: `POST /messages` with multipart or JSON support
- **Filesystem-first storage**: Envelopes in `inbox/`, attachments in `files/`, indexed by SQLite
- **Type-driven sorters**: Define types and sorters in `zobox.config.toml`
- **Worker polling**: `GET /messages/next` for building distributed subscribers
- **Flexible routing**: Send messages to webhooks, workers, or store locally
- **Path templating**: Control attachment storage with `{channel}/{date}/{eventId}/{filename}` patterns
- **Multiple auth modes**: Admin and read-only API keys via environment variables
- **Lightweight**: Bun/Hono server, easy to run as a Zo User Service or standalone

## Quick Start

Get Zobox running locally in under 5 minutes:

### 1. Install Dependencies

```bash
bun install
```

Or with npm:

```bash
npm install
```

### 2. Set Up Environment

```bash
export ZOBOX_ADMIN_API_KEY="dev-admin-key"
export ZOBOX_READ_API_KEY="dev-read-key"
```

### 3. Initialize Base Directory

```bash
mkdir -p /home/workspace/Inbox/db/migrations
cp config/zobox.config.example.toml /home/workspace/Inbox/zobox.config.toml
cp db/migrations/001_init.sql /home/workspace/Inbox/db/migrations/001_init.sql
```

### 4. Start the Server

```bash
ZOBOX_BASE_DIR=/home/workspace/Inbox bun run src/server.ts
```

Server listens on `http://localhost:8787` by default.

### 5. Ingest Your First Item

```bash
curl -X POST "http://localhost:8787/messages" \
  -H "content-type: application/json" \
  -H "x-api-key: $ZOBOX_ADMIN_API_KEY" \
  -d '{
    "type": "update",
    "payload": { "text": "First idea" }
  }'
```

### 6. List Items

```bash
curl "http://localhost:8787/messages?limit=20" \
  -H "x-api-key: $ZOBOX_READ_API_KEY"
```

You should see your item in the response!

## Development

### Prerequisites

- Bun >= 1.1 (or Node.js >= 18)
- SQLite (included with Bun)

### Setup

```bash
# Install dependencies
bun install

# Copy example config
cp config/zobox.config.example.toml /home/workspace/Inbox/zobox.config.toml

# Set environment variables
export ZOBOX_ADMIN_API_KEY="dev-admin-key"
export ZOBOX_READ_API_KEY="dev-read-key"
export ZOBOX_BASE_DIR="/home/workspace/Inbox"
```

### Running

```bash
# Development mode (with hot reload)
bun run dev

# Production mode
bun run start

# Or directly
bun run src/server.ts
```

### CLI Commands

```bash
# Start server
bunx zobox start

# Run migrations only
bunx zobox migrate

# Help
bunx zobox help
```

### Testing

```bash
# Run tests
bun run test

# Run tests in watch mode
bun run test:watch

# Lint and check code
bun run lint

# Lint and auto-fix issues
bun run check
```

### Git Hooks

This project uses [Lefthook](https://github.com/evilmartians/lefthook) for automated pre-commit and pre-push checks:

**Pre-commit hooks** (run in parallel):
- **format**: Auto-format code using Biome
- **lint**: Check code quality with Biome
- **types**: TypeScript type checking with `tsc --noEmit`
- **test-related**: Run tests when test files or source files change

**Pre-push hooks**:
- **test-all**: Run full test suite
- **lint-strict**: Strict linting with error-on-warnings

Hooks are installed automatically via the `prepare` script when you run `bun install`.

#### Customizing Hooks

To customize hooks for your local environment, copy the example:

```bash
cp .lefthook-local.yml.example .lefthook-local.yml
```

Then edit `.lefthook-local.yml` to skip expensive checks during fast iteration:

```yaml
# Skip type checking and tests on commit (faster iteration)
pre-commit:
  commands:
    types:
      skip: true
    test-related:
      skip: true
```

Your local customizations won't be committed (`.lefthook-local.yml` is in `.gitignore`).

### Project Structure

```
zobox/
  bin/
    zobox.ts              # CLI entrypoint
  src/
    types.ts               # TypeScript type definitions
    config.ts              # TOML config loader
    storage.ts             # SQLite + filesystem storage
    sorters.ts           # sorter and routing logic
    server.ts              # Hono HTTP server
  config/
    zobox.config.example.toml
    routes.example.json
  db/
    migrations/
      001_init.sql
  docs/
    API.md                 # API reference
    CONFIGURATION.md       # Configuration guide
```

## Documentation

- **[API Reference](docs/API.md)**: Complete HTTP API documentation with examples
- **[Configuration Guide](docs/CONFIGURATION.md)**: TOML schema, path templates, sorters, and route destinations

## Zo Integration

Deploy Zobox as a Zo User Service:

### 1. Create User Service

Configure in Zo:

- **Label**: `zobox`
- **Type**: `http`
- **Local port**: `8787`
- **Entrypoint**: `bunx zobox start`
- **Workdir**: `/home/workspace/Inbox`

### 2. Copy Configuration Files

```bash
cp config/zobox.config.example.toml /home/workspace/Inbox/zobox.config.toml
cp db/migrations/001_init.sql /home/workspace/Inbox/db/migrations/001_init.sql
```

### 3. Set Environment Variables

Add to your Zo service configuration:

- `ZOBOX_ADMIN_API_KEY` (required)
- `ZOBOX_READ_API_KEY` (optional, recommended)
- `ZOBOX_BASE_DIR=/home/workspace/Inbox`

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
