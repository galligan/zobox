# Zobox Configuration Guide

## Overview

Zobox is configured via a TOML file located in your base directory:

```
/home/workspace/Inbox/zobox.config.toml
```

This guide covers all configuration sections, path template tokens, filename strategies, and sorter patterns.

---

## Configuration File Structure

### Example Configuration

```toml
[zobox]
base_dir = "/home/workspace/Inbox"
db_path = "/home/workspace/Inbox/db/zobox.db"
default_channel = "Inbox"

[auth]
admin_api_key_env_var = "ZOBOX_ADMIN_API_KEY"
read_api_key_env_var  = "ZOBOX_READ_API_KEY"
required = true

[files]
enabled = true
base_files_dir = "/home/workspace/Inbox/files"
path_template = "{baseFilesDir}/{channel}/{date}/{eventId}/{filename}"
filename_strategy = "original"
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

## Section Reference

### [zobox]

Global Zobox settings.

**Fields**:

- `base_dir` (string, default: `/home/workspace/Inbox`)
  - Root directory for all Zobox data
  - Contains `inbox/`, `files/`, `db/`, `logs/`, and `zobox.config.toml`

- `db_path` (string, default: `{base_dir}/db/zobox.db`)
  - Path to SQLite database file
  - Used for indexing messages and enabling fast queries

- `default_channel` (string, default: `"Inbox"`)
  - Fallback channel when no type-specific or explicit channel is provided

**Example**:

```toml
[zobox]
base_dir = "/home/workspace/Inbox"
db_path = "/home/workspace/Inbox/db/zobox.db"
default_channel = "Inbox"
```

---

### [auth]

Authentication configuration.

**Fields**:

- `admin_api_key_env_var` (string, default: `"ZOBOX_ADMIN_API_KEY"`)
  - Environment variable name for admin API key
  - Admin key grants full read/write access

- `read_api_key_env_var` (string, optional, default: `"ZOBOX_READ_API_KEY"`)
  - Environment variable name for read-only API key
  - Read key grants access to `GET /messages`, `GET /messages/next`, `GET /health`

- `required` (boolean, default: `true`)
  - Whether authentication is required
  - Set to `false` for local development or trusted environments

**Example**:

```toml
[auth]
admin_api_key_env_var = "ZOBOX_ADMIN_API_KEY"
read_api_key_env_var  = "ZOBOX_READ_API_KEY"
required = true
```

**Environment Variables**:

```bash
export ZOBOX_ADMIN_API_KEY="your-secret-admin-key"
export ZOBOX_READ_API_KEY="your-read-only-key"
```

---

### [files]

File attachment handling configuration.

**Fields**:

- `enabled` (boolean, default: `true`)
  - Whether to process and store file attachments
  - Set to `false` to disable attachment handling entirely

- `base_files_dir` (string, default: `{base_dir}/files`)
  - Root directory for storing attachments
  - All attachment paths are relative to this directory

- `path_template` (string, default: `"{baseFilesDir}/{channel}/{date}/{eventId}/{filename}"`)
  - Template for attachment file paths
  - Supports tokens (see [Path Template Tokens](#path-template-tokens))

- `filename_strategy` (string, default: `"original"`)
  - How to name attachment files
  - Options: `original`, `timestampPrefix`, `eventIdPrefix`, `uuid`
  - See [Filename Strategies](#filename-strategies)

- `keep_base64_in_envelope` (boolean, default: `false`)
  - Whether to retain base64 data in envelope JSON after decoding
  - Set to `true` if you need to preserve original base64 for auditing

**Example**:

```toml
[files]
enabled = true
base_files_dir = "/home/workspace/Inbox/files"
path_template = "{baseFilesDir}/{channel}/{date}/{eventId}/{filename}"
filename_strategy = "original"
keep_base64_in_envelope = false
```

---

### [types.*]

Type definitions. Each `[types.<typeName>]` section defines a semantic category for messages.

**Fields**:

- `description` (string, optional)
  - Human-readable description of this type

- `channel` (string, optional)
  - Default channel for messages of this type
  - Overrides `[zobox].default_channel`

- `payload_example` (string, optional)
  - Example JSON payload for this type
  - Used by agents and documentation

- Custom fields: any additional metadata (ignored by Zobox, available for tooling)

**Example**:

```toml
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

[types.task]
description = "Task or TODO item"
channel = "Tasks"
payload_example = """
{
  "title": "Task title",
  "status": "pending",
  "due": "2025-12-01"
}
"""
```

---

### [sorters.*]

sorter definitions. Each `[sorters.<sorterName>]` section defines behavior for a specific item type.

**Fields**:

- `type` (string, required)
  - Item type this sorter applies to
  - Must match a key in `[types.*]`

- `description` (string, optional)
  - Human-readable description of this sorter

- `files_path_template` (string, optional)
  - Path template for attachments (overrides `[files].path_template`)
  - Supports same tokens as `[files].path_template`

- `append_to_file` (string, optional)
  - Path to a file where a summary line will be appended after ingestion
  - Useful for building index files or rolling logs

- `destination` (string, optional)
  - Destination name from `routes.json`
  - Defines where to send the message envelope after ingestion
  - See [Destinations](#destinations)

- Custom fields: any additional metadata (ignored by Zobox, available for tooling)

**Example**:

```toml
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

### [tools]

Reserved for future Zo integration hooks. Not used in V1.

**Example**:

```toml
[tools]
# Future Zo tool integrations
```

---

## Path Template Tokens

Path templates are strings with `{token}` placeholders that Zobox replaces at runtime.

### Supported Tokens

| Token | Description | Example |
|-------|-------------|---------|
| `{baseFilesDir}` | Value of `[files].base_files_dir` | `/home/workspace/Inbox/files` |
| `{channel}` | Item channel (sanitized: alphanumeric, `.`, `_`, `-`) | `Updates` |
| `{date}` | ISO date (`YYYY-MM-DD`) from `createdAt` | `2025-11-22` |
| `{eventId}` | Item ID (UUID) | `550e8400-e29b-41d4-a716-446655440000` |
| `{timestamp}` | Sanitized ISO timestamp (numbers + `T` only, truncated to 15 chars) | `20251122T123456` |
| `{filename}` | Final filename (after applying `filename_strategy`) | `photo.jpg` or `20251122T123456_photo.jpg` |

### Examples

**Default Template**:

```toml
path_template = "{baseFilesDir}/{channel}/{date}/{eventId}/{filename}"
```

Renders to:

```
/home/workspace/Inbox/files/Updates/2025-11-22/550e8400-e29b-41d4-a716-446655440000/photo.jpg
```

**Flat Structure**:

```toml
path_template = "{baseFilesDir}/{filename}"
```

Renders to:

```
/home/workspace/Inbox/files/photo.jpg
```

**Date-Only Structure**:

```toml
path_template = "{baseFilesDir}/{date}/{filename}"
```

Renders to:

```
/home/workspace/Inbox/files/2025-11-22/photo.jpg
```

**Timestamp in Path**:

```toml
path_template = "{baseFilesDir}/{channel}/{timestamp}_{filename}"
```

Renders to:

```
/home/workspace/Inbox/files/Updates/20251122T123456_photo.jpg
```

---

## Filename Strategies

Filename strategies control how attachment filenames are transformed before writing to disk.

### Strategy: `original`

Keep the original filename unchanged.

**Example**:

- Input: `photo.jpg`
- Output: `photo.jpg`

```toml
filename_strategy = "original"
```

---

### Strategy: `timestampPrefix`

Prefix filename with sanitized ISO timestamp.

**Example**:

- Input: `photo.jpg`
- Timestamp: `2025-11-22T12:34:56.789Z`
- Output: `20251122T123456_photo.jpg`

```toml
filename_strategy = "timestampPrefix"
```

**Use Case**: Prevent filename collisions in flat directories.

---

### Strategy: `eventIdPrefix`

Prefix filename with item ID (UUID).

**Example**:

- Input: `photo.jpg`
- Item ID: `550e8400-e29b-41d4-a716-446655440000`
- Output: `550e8400-e29b-41d4-a716-446655440000_photo.jpg`

```toml
filename_strategy = "eventIdPrefix"
```

**Use Case**: Guarantee unique filenames, enable quick lookup by ID.

---

### Strategy: `uuid`

Replace filename with a new UUID, preserving extension.

**Example**:

- Input: `photo.jpg`
- Generated UUID: `a1b2c3d4-e5f6-7890-abcd-ef1234567890`
- Output: `a1b2c3d4-e5f6-7890-abcd-ef1234567890_photo.jpg`

```toml
filename_strategy = "uuid"
```

**Use Case**: Complete anonymization, prevent filename conflicts, avoid filesystem issues with special characters.

---

## Destinations

Destinations define what happens to message envelopes after ingestion. They are configured in a separate `routes.json` file.

### routes.json Location

```
/home/workspace/Inbox/routes.json
```

### Example routes.json

```json
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
    },
    "webhook_notification": {
      "kind": "http",
      "description": "Send message to external webhook.",
      "url": "https://api.example.com/webhooks/zobox",
      "method": "POST",
      "headers": {
        "content-type": "application/json",
        "x-webhook-secret": "your-secret-here"
      },
      "enabled": true,
      "timeoutMs": 3000
    }
  }
}
```

### Destination Fields

**Common Fields**:

- `kind` (string, optional): Destination type (`"http"`, `"noop"`)
- `description` (string, optional): Human-readable description

**HTTP Destination** (`kind: "http"`):

- `url` (string, required): Target URL for HTTP POST
- `method` (string, optional, default: `"POST"`): HTTP method
- `headers` (object, optional): HTTP headers to include
- `enabled` (boolean, optional, default: `true`): Whether this profile is active
- `timeoutMs` (number, optional): Request timeout in milliseconds

**Noop Destination** (`kind: "noop"`):

- Does nothing; used for `store_only` sorters

### sorter Integration

Reference a destination in sorter configuration:

```toml
[sorters.posts]
type = "post"
destination = "publish_to_worker"
```

After ingestion, Zobox will POST the full `MessageEnvelope` to the configured URL.

### Error Handling

- Routing failures are logged to stdout but do not block ingestion
- HTTP errors (non-2xx) are logged as warnings
- Network errors are caught and logged
- Messages are always stored in the inbox regardless of routing success

---

## sorter Examples

### Example 1: Simple Updates (Store Only)

**Goal**: Store status updates locally, append to rolling log.

**Configuration**:

```toml
[types.update]
description = "Generic status update"
channel = "Updates"

[sorters.updates]
type = "update"
description = "Append updates to a rolling log."
files_path_template = "{baseFilesDir}/Updates/{date}/{eventId}/{filename}"
append_to_file = "/home/workspace/Inbox/updates.md"
destination = "store_only"
```

**routes.json**:

```json
{
  "destinations": {
    "store_only": {
      "kind": "noop"
    }
  }
}
```

**Behavior**:
- Messages land in `inbox/YYYY-MM-DD/{id}.json`
- Attachments saved to `files/Updates/YYYY-MM-DD/{id}/{filename}`
- Summary appended to `updates.md`:

  ```markdown
  - [2025-11-22T12:34:56.789Z] (update) Status update text (id: 550e8400-...)
  ```

---

### Example 2: Blog Posts (Publish to Worker)

**Goal**: Store posts, send to external worker for publishing.

**Configuration**:

```toml
[types.post]
description = "Blog post"
channel = "Posts"

[sorters.posts]
type = "post"
description = "Publish posts to content folder."
files_path_template = "{baseFilesDir}/Posts/{date}/{eventId}/{filename}"
append_to_file = "/home/workspace/Inbox/posts_index.md"
destination = "publish_to_worker"
```

**routes.json**:

```json
{
  "destinations": {
    "publish_to_worker": {
      "kind": "http",
      "url": "http://localhost:9000/publish",
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

**Behavior**:
- Messages land in `inbox/YYYY-MM-DD/{id}.json`
- Attachments saved to `files/Posts/YYYY-MM-DD/{id}/{filename}`
- Summary appended to `posts_index.md`
- Full envelope POSTed to `http://localhost:9000/publish`

---

### Example 3: Tasks (UUID Filenames, Webhook)

**Goal**: Store tasks with anonymized attachments, notify external system.

**Configuration**:

```toml
[types.task]
description = "Task item"
channel = "Tasks"

[sorters.tasks]
type = "task"
description = "Store tasks and notify project tracker."
files_path_template = "{baseFilesDir}/Tasks/{date}/{filename}"
destination = "task_webhook"

[files]
filename_strategy = "uuid"
```

**routes.json**:

```json
{
  "destinations": {
    "task_webhook": {
      "kind": "http",
      "url": "https://api.example.com/tasks",
      "method": "POST",
      "headers": {
        "content-type": "application/json",
        "authorization": "Bearer your-token-here"
      },
      "enabled": true,
      "timeoutMs": 3000
    }
  }
}
```

**Behavior**:
- Attachments saved as: `files/Tasks/2025-11-22/a1b2c3d4-e5f6-7890-abcd-ef1234567890_screenshot.png`
- Full envelope sent to external task tracker API

---

### Example 4: Media Uploads (Timestamp Prefix)

**Goal**: Store media uploads with timestamp-prefixed filenames.

**Configuration**:

```toml
[types.media]
description = "Media upload (photo, video, audio)"
channel = "Media"

[sorters.media]
type = "media"
description = "Store media files chronologically."
files_path_template = "{baseFilesDir}/Media/{channel}/{date}/{filename}"
destination = "store_only"

[files]
filename_strategy = "timestampPrefix"
```

**Behavior**:
- Attachments saved as: `files/Media/Media/2025-11-22/20251122T123456_photo.jpg`
- Chronological ordering preserved in filename

---

## Validation and Best Practices

### Validation

When editing `zobox.config.toml`, ensure:

1. **TOML Syntax**: Valid TOML format (use a TOML validator)
2. **Required Fields**: Each sorter must have a `type` field matching a defined type
3. **Path Templates**: Only use supported tokens (see [Path Template Tokens](#path-template-tokens))
4. **Filename Strategy**: One of `original`, `timestampPrefix`, `eventIdPrefix`, `uuid`
5. **Destinations**: Referenced destinations must exist in `routes.json`

### Best Practices

1. **Start Simple**: Use default configuration, add types/sorters as needed
2. **Readable Paths**: Use meaningful channel names and clear path templates
3. **Consistent Naming**: Match sorter names to type names for clarity
4. **Test sorters**: Ingest a test item after changing configuration
5. **Version Control**: Keep `zobox.config.toml` and `routes.json` in version control
6. **Document Custom Types**: Add clear `description` and `payload_example` for agent use
7. **Secure API Keys**: Never commit API keys; use environment variables only
8. **Restart After Changes**: Restart Zobox server after editing configuration

### Configuration Reload

Zobox V1 does not support hot-reload. After editing `zobox.config.toml` or `routes.json`, restart the server:

```bash
# Stop Zobox (Ctrl+C or kill process)
# Restart
bun run src/server.ts
```

Or via Zo User Service:

```bash
zo service restart zobox
```

---

## Troubleshooting

### Messages Not Routing

**Symptom**: Messages stored but not sent to external URL.

**Check**:
1. `routes.json` exists in base directory
2. Destination name matches sorter's `destination`
3. Destination has `enabled: true`
4. Destination `url` is correct and reachable
5. Check server logs for routing errors

### Attachments Not Stored

**Symptom**: Messages created but no files written.

**Check**:
1. `[files].enabled = true`
2. `base_files_dir` path is writable
3. Path template uses valid tokens
4. Check server logs for file write errors

### Channel Not Applied

**Symptom**: Messages land in default channel instead of type-specific channel.

**Check**:
1. Type definition has `channel` field
2. No explicit `channel` passed in POST body (explicit overrides type default)

### Append File Not Updated

**Symptom**: sorter has `append_to_file` but file not updated.

**Check**:
1. File path is absolute or relative to `base_dir`
2. Parent directory exists and is writable
3. Check server logs for append errors

---

## Environment Variables Reference

| Variable | Purpose | Example |
|----------|---------|---------|
| `ZOBOX_ADMIN_API_KEY` | Admin API key (full access) | `"your-secret-admin-key"` |
| `ZOBOX_READ_API_KEY` | Read-only API key (optional) | `"your-read-only-key"` |
| `ZOBOX_BASE_DIR` | Base directory override | `/home/workspace/Inbox` |
| `ZOBOX_PORT` | Server port override | `8787` |

Set in shell or `.env` file (do not commit `.env`):

```bash
export ZOBOX_ADMIN_API_KEY="your-secret-admin-key"
export ZOBOX_READ_API_KEY="your-read-only-key"
export ZOBOX_BASE_DIR="/custom/path"
export ZOBOX_PORT="8787"
```
