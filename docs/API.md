# Zobox API Reference

## Base URL and Versioning

**Base URL**: `http://localhost:8787` (default)

Zobox V1 does not use versioned API paths. All endpoints are accessed directly from the base URL.

**Environment Variables**:
- `ZOBOX_PORT`: Port to listen on (default: `8787`)
- `ZOBOX_BASE_DIR`: Base directory for inbox (default: `/home/workspace/Inbox`)

## Authentication

Zobox supports two authentication methods:

### 1. x-api-key Header

```bash
x-api-key: YOUR_API_KEY
```

### 2. Bearer Token

```bash
authorization: Bearer YOUR_API_KEY
```

### API Key Types

Zobox supports two types of API keys configured via environment variables:

- **Admin Key** (`ZOBOX_ADMIN_API_KEY`): Full read/write access
  - Required for `POST /messages`, `POST /messages/:id/ack`
- **Read Key** (`ZOBOX_READ_API_KEY`): Read-only access
  - Can be used for `GET /messages`, `GET /messages/next`, `GET /health`

Configuration in `zobox.config.toml`:

```toml
[auth]
admin_api_key_env_var = "ZOBOX_ADMIN_API_KEY"
read_api_key_env_var  = "ZOBOX_READ_API_KEY"
required = true
```

## Endpoints

### GET /health

Health check endpoint.

**Authentication**: Optional (works with read or admin key, or without auth if `auth.required = false`)

**Request**:

```bash
curl http://localhost:8787/health
```

**Response** `200 OK`:

```json
{
  "status": "ok"
}
```

---

### POST /messages

Ingest a new message into Zobox. Supports three modes: JSON-only, JSON with base64 attachments, and multipart with binary files.

**Authentication**: Admin key required

**Content-Type**: `application/json` or `multipart/form-data`

#### Mode A: JSON Only

**Request**:

```bash
curl -X POST "http://localhost:8787/messages" \
  -H "content-type: application/json" \
  -H "x-api-key: YOUR_ADMIN_KEY" \
  -d '{
    "type": "update",
    "payload": { "text": "First idea" }
  }'
```

**Request Body**:

```json
{
  "type": "update",
  "payload": {
    "text": "First idea"
  },
  "channel": "Updates",
  "source": "api",
  "meta": {
    "tags": ["brainstorm"]
  }
}
```

**Fields**:
- `type` (required, string): Message type, must match a type defined in `zobox.config.toml`
- `payload` (optional, any): Arbitrary JSON data for this message
- `channel` (optional, string): Channel override; defaults to type's channel or `default_channel`
- `source` (optional, string): Source identifier; defaults to `"api"`
- `meta` (optional, any): Arbitrary metadata

**Response** `201 Created`:

```json
{
  "message": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "type": "update",
    "channel": "Updates",
    "createdAt": "2025-11-22T12:34:56.789Z",
    "hasAttachments": false,
    "attachmentsCount": 0
  }
}
```

#### Mode B: JSON + Base64 Attachments

**Request**:

```bash
curl -X POST "http://localhost:8787/messages" \
  -H "content-type: application/json" \
  -H "x-api-key: YOUR_ADMIN_KEY" \
  -d '{
    "type": "update",
    "payload": { "text": "Idea with file" },
    "attachments": [
      {
        "filename": "photo.jpg",
        "mimeType": "image/jpeg",
        "base64": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
      }
    ]
  }'
```

**Request Body**:

```json
{
  "type": "update",
  "payload": { "text": "Idea with file" },
  "attachments": [
    {
      "filename": "photo.jpg",
      "mimeType": "image/jpeg",
      "base64": "<base64-encoded-data>"
    }
  ]
}
```

**Attachment Fields**:
- `filename` (required, string): Original filename
- `base64` (required, string): Base64-encoded file data
- `mimeType` (optional, string): MIME type

**Response** `201 Created`:

```json
{
  "message": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "type": "update",
    "channel": "Updates",
    "createdAt": "2025-11-22T12:34:56.789Z",
    "hasAttachments": true,
    "attachmentsCount": 1
  }
}
```

#### Mode C: Multipart Form Data

**Request**:

```bash
curl -X POST "http://localhost:8787/messages" \
  -H "x-api-key: YOUR_ADMIN_KEY" \
  -F 'event={"type":"update","payload":{"text":"Photo upload"}}' \
  -F 'photo=@/path/to/photo.jpg' \
  -F 'document=@/path/to/doc.pdf'
```

**Form Fields**:
- `event` (required, string): JSON blob containing message metadata (same structure as Mode A)
  - Alternative field names: `message`, `json`
- File fields: Binary file parts (field name is arbitrary)

**Response** `201 Created`:

```json
{
  "message": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "type": "update",
    "channel": "Updates",
    "createdAt": "2025-11-22T12:34:56.789Z",
    "hasAttachments": true,
    "attachmentsCount": 2
  }
}
```

**Error Responses**:

- `400 Bad Request`: Invalid JSON, missing `type` field, or malformed multipart data

  ```json
  { "error": "Invalid JSON body" }
  ```

  ```json
  { "error": "\"type\" is required" }
  ```

- `401 Unauthorized`: Missing or invalid API key

  ```json
  { "error": "Unauthorized" }
  ```

- `403 Forbidden`: Read-only key used for write operation

  ```json
  { "error": "Forbidden: admin key required" }
  ```

- `500 Internal Server Error`: Failed to store attachments or write envelope

  ```json
  { "error": "Failed to store attachments" }
  ```

---

### GET /messages

List messages with optional filtering and pagination (response key: `items`).

**Authentication**: Read or admin key required

**Query Parameters**:

- `type` (optional, string): Filter by message type
- `channel` (optional, string): Filter by channel
- `since` (optional, ISO8601 timestamp): Filter messages created on or after this time
- `until` (optional, ISO8601 timestamp): Filter messages created on or before this time
- `limit` (optional, integer): Number of messages to return (default: `50`, max: `100`)
- `cursor` (optional, string): Opaque pagination cursor from previous response

**Request**:

```bash
curl "http://localhost:8787/messages?type=update&limit=10" \
  -H "x-api-key: YOUR_READ_KEY"
```

```bash
curl "http://localhost:8787/messages?channel=Updates&since=2025-11-20T00:00:00Z&limit=25" \
  -H "authorization: Bearer YOUR_ADMIN_KEY"
```

**Response** `200 OK`:

```json
{
  "items": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "type": "update",
      "channel": "Updates",
      "createdAt": "2025-11-22T12:34:56.789Z",
      "hasAttachments": true,
      "attachmentsCount": 2
    },
    {
      "id": "660e8400-e29b-41d4-a716-446655440001",
      "type": "update",
      "channel": "Updates",
      "createdAt": "2025-11-22T11:20:30.123Z",
      "hasAttachments": false,
      "attachmentsCount": 0
    }
  ],
  "nextCursor": "MjU="
}
```

**Response Fields**:
- `items` (array): Array of MessageView objects (lightweight projections)
  - `id` (string): Unique item ID (UUID)
  - `type` (string): Item type
  - `channel` (string): Channel name
  - `createdAt` (string): ISO8601 timestamp
  - `hasAttachments` (boolean): Whether item has attachments
  - `attachmentsCount` (number): Number of attachments
- `nextCursor` (string|null): Pagination cursor for next page, or `null` if no more results

**Pagination**:

Zobox uses cursor-based pagination. To fetch the next page:

```bash
curl "http://localhost:8787/messages?limit=50&cursor=MjU=" \
  -H "x-api-key: YOUR_READ_KEY"
```

The cursor is an opaque base64-encoded offset. Continue fetching until `nextCursor` is `null`.

**Notes**:
- Messages are sorted by `createdAt DESC, id DESC` (newest first)
- The `limit` parameter is clamped to `[1, 100]`
- Response returns MessageView projections, not full envelopes; use a future `GET /messages/:id` endpoint for full envelope retrieval

**Error Responses**:

- `401 Unauthorized`: Missing or invalid API key

  ```json
  { "error": "Unauthorized" }
  ```

---

### GET /messages/next

Worker polling endpoint to fetch unclaimed messages.

**Authentication**: Read or admin key required

**Query Parameters**:

- `subscriber` (required, string): Subscriber identifier (e.g., `"worker-1"`)
- `type` (optional, string): Filter by message type
- `channel` (optional, string): Filter by channel
- `limit` (optional, integer): Number of messages to return (default: `10`, max: `50`)

**Request**:

```bash
curl "http://localhost:8787/messages/next?subscriber=worker-1&limit=5" \
  -H "x-api-key: YOUR_READ_KEY"
```

```bash
curl "http://localhost:8787/messages/next?subscriber=processor-alpha&type=post&channel=Posts" \
  -H "authorization: Bearer YOUR_ADMIN_KEY"
```

**Response** `200 OK`:

```json
{
  "items": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "type": "update",
      "source": "api",
      "channel": "Updates",
      "payload": {
        "text": "Hello"
      },
      "attachments": [],
      "meta": null,
      "createdAt": "2025-11-22T12:34:56.789Z"
    },
    {
      "id": "660e8400-e29b-41d4-a716-446655440001",
      "type": "update",
      "source": "api",
      "channel": "Updates",
      "payload": {
        "title": "Status update",
        "body": "Working on docs"
      },
      "attachments": [
        {
          "id": "660e8400-e29b-41d4-a716-446655440001_0",
          "filename": "screenshot.png",
          "originalFilename": "screenshot.png",
          "mimeType": "image/png",
          "size": 45120,
          "path": "/home/workspace/Inbox/files/Updates/2025-11-22/660e8400-e29b-41d4-a716-446655440001/screenshot.png",
          "source": "multipart"
        }
      ],
      "meta": { "tags": ["work"] },
      "createdAt": "2025-11-22T11:20:30.123Z"
    }
  ]
}
```

**Response Fields**:
- `items` (array): Array of full MessageEnvelope objects
  - `id` (string): Unique message ID
  - `type` (string): Message type
  - `source` (string): Source identifier (e.g., `"api"`)
  - `channel` (string): Channel name
  - `payload` (any): Arbitrary JSON payload
  - `attachments` (array): Array of attachment envelopes
    - `id` (string): Attachment ID (`{messageId}_{index}`)
    - `filename` (string): Final filename (after strategy applied)
    - `originalFilename` (string): Original filename
    - `mimeType` (string): MIME type
    - `size` (number): File size in bytes
    - `path` (string): Absolute filesystem path
    - `source` (string): `"base64"` or `"multipart"`
    - `base64` (string, optional): Base64 data if `keep_base64_in_envelope = true`
  - `meta` (any): Arbitrary metadata
  - `createdAt` (string): ISO8601 timestamp

**Notes**:
- Returns messages where `subscribed_by IS NULL` (unclaimed)
- Messages are sorted by `createdAt ASC, id ASC` (oldest first, FIFO)
- The `limit` parameter is clamped to `[1, 50]`
- After fetching messages, workers should acknowledge them via `POST /messages/:id/ack` to mark them as claimed

**Error Responses**:

- `400 Bad Request`: Missing `subscriber` parameter

  ```json
  { "error": "\"subscriber\" query parameter is required" }
  ```

- `401 Unauthorized`: Missing or invalid API key

  ```json
  { "error": "Unauthorized" }
  ```

---

### POST /messages/:id/ack

Acknowledge a message as processed by a subscriber. Marks the message as claimed.

**Authentication**: Admin key required

**Path Parameters**:

- `id` (required, string): Message ID (UUID)

**Request Body** (JSON):

```json
{
  "subscriber": "worker-1"
}
```

Alternatively, `subscriber` can be provided as a query parameter:

```bash
curl -X POST "http://localhost:8787/messages/550e8400-e29b-41d4-a716-446655440000/ack?subscriber=worker-1" \
  -H "x-api-key: YOUR_ADMIN_KEY"
```

**Request**:

```bash
curl -X POST "http://localhost:8787/messages/550e8400-e29b-41d4-a716-446655440000/ack" \
  -H "content-type: application/json" \
  -H "x-api-key: YOUR_ADMIN_KEY" \
  -d '{ "subscriber": "worker-1" }'
```

**Response** `200 OK`:

```json
{
  "status": "ok",
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "subscriber": "worker-1"
}
```

**Notes**:
- Sets `subscribed_by = subscriber` and `subscribed_at = NOW()` in the SQLite index
- Idempotent: if the same subscriber re-acknowledges, it succeeds
- If a different subscriber tries to claim an already-claimed message, it fails with `409`

**Error Responses**:

- `400 Bad Request`: Missing `subscriber` in body and query

  ```json
  { "error": "\"subscriber\" must be provided in body or query string" }
  ```

- `401 Unauthorized`: Missing or invalid API key

  ```json
  { "error": "Unauthorized" }
  ```

- `403 Forbidden`: Read-only key used

  ```json
  { "error": "Forbidden: admin key required" }
  ```

- `409 Conflict`: Message not found or already claimed by another subscriber

  ```json
  { "error": "Message not found or already claimed by another subscriber" }
  ```

---

### GET /admin/config

**Status**: Reserved for future UI integrations (V1: not implemented)

**Response** `501 Not Implemented`:

```json
{
  "status": "not_implemented",
  "message": "Admin config endpoint is reserved for future UI integrations."
}
```

---

### PUT /admin/config

**Status**: Reserved for future UI integrations (V1: not implemented)

**Response** `501 Not Implemented`:

```json
{
  "status": "not_implemented",
  "message": "Admin config endpoint is reserved for future UI integrations."
}
```

---

## Error Response Format

All error responses follow this format:

```json
{
  "error": "Human-readable error message"
}
```

### HTTP Status Codes

- `200 OK`: Successful GET request
- `201 Created`: Successful POST /messages
- `400 Bad Request`: Invalid request body, missing required fields, or malformed data
- `401 Unauthorized`: Missing or invalid API key
- `403 Forbidden`: Valid API key but insufficient permissions (e.g., read key used for write operation)
- `404 Not Found`: Endpoint not found (not used in current API)
- `409 Conflict`: Message already claimed by another subscriber
- `500 Internal Server Error`: Server-side failure (attachment storage, database write, etc.)
- `501 Not Implemented`: Endpoint reserved for future use

---

## Data Types

### MessageView

Lightweight projection returned by `GET /messages`:

```typescript
{
  id: string;              // UUID
  type: string;            // Message type
  channel: string;         // Channel name
  createdAt: string;       // ISO8601 timestamp
  hasAttachments: boolean; // Whether attachments exist
  attachmentsCount: number; // Number of attachments
}
```

### MessageEnvelope

Full message object returned by `GET /messages/next`:

```typescript
{
  id: string;                    // UUID
  type: string;                  // Message type
  source?: string;               // Source identifier (default: "api")
  channel: string;               // Channel name
  payload: any;                  // Arbitrary JSON payload
  attachments: AttachmentEnvelope[]; // Array of attachments
  meta?: any;                    // Arbitrary metadata
  createdAt: string;             // ISO8601 timestamp
}
```

### AttachmentEnvelope

Attachment metadata in MessageEnvelope:

```typescript
{
  id: string;              // "{messageId}_{index}"
  filename: string;        // Final filename (after strategy)
  originalFilename?: string; // Original filename
  mimeType?: string;       // MIME type
  size?: number;           // File size in bytes
  path: string;            // Absolute filesystem path
  source: "base64" | "multipart"; // Attachment source
  base64?: string;         // Base64 data (if keep_base64_in_envelope = true)
}
```

---

## Examples

### Example 1: Create and List Messages

```bash
# Create an update
curl -X POST "http://localhost:8787/messages" \
  -H "content-type: application/json" \
  -H "x-api-key: dev-admin-key" \
  -d '{
    "type": "update",
    "payload": { "text": "First idea" }
  }'

# List all updates
curl "http://localhost:8787/messages?type=update&limit=10" \
  -H "x-api-key: dev-read-key"
```

### Example 2: Upload with Attachments

```bash
# JSON + base64
curl -X POST "http://localhost:8787/messages" \
  -H "content-type: application/json" \
  -H "x-api-key: dev-admin-key" \
  -d '{
    "type": "post",
    "payload": { "title": "My post", "body": "Content here" },
    "attachments": [
      {
        "filename": "cover.jpg",
        "mimeType": "image/jpeg",
        "base64": "'"$(base64 -w 0 cover.jpg)"'"
      }
    ]
  }'

# Multipart
curl -X POST "http://localhost:8787/messages" \
  -H "x-api-key: dev-admin-key" \
  -F 'event={"type":"post","payload":{"title":"My post"}}' \
  -F 'cover=@cover.jpg'
```

### Example 3: Worker Polling

```bash
# Fetch unclaimed messages
curl "http://localhost:8787/messages/next?subscriber=worker-1&limit=5" \
  -H "x-api-key: dev-admin-key"

# Acknowledge message
curl -X POST "http://localhost:8787/messages/550e8400-e29b-41d4-a716-446655440000/ack" \
  -H "content-type: application/json" \
  -H "x-api-key: dev-admin-key" \
  -d '{ "subscriber": "worker-1" }'
```

### Example 4: Filtering and Pagination

```bash
# Fetch posts from a specific date range
curl "http://localhost:8787/messages?type=post&since=2025-11-01T00:00:00Z&until=2025-11-30T23:59:59Z&limit=50" \
  -H "x-api-key: dev-read-key"

# Fetch next page
curl "http://localhost:8787/messages?type=post&limit=50&cursor=NTA=" \
  -H "x-api-key: dev-read-key"
```
