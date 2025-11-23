# Error Handling & Structured Logging

This document describes the error handling and structured logging implementation in Zobox.

## Error Hierarchy

All Zobox errors extend from `ZoboxError`, which includes:
- `message`: Human-readable error description
- `code`: Machine-readable error code for debugging
- `statusCode`: HTTP status code for API responses

### Error Classes

#### `ZoboxError`
Base error class for all Zobox-specific errors.

```typescript
throw new ZoboxError("Something went wrong", "GENERIC_ERROR", 500);
```

#### `ValidationError` (400)
Invalid input, schema violations, missing required fields.

```typescript
throw new ValidationError("Invalid item body", "INVALID_ITEM_BODY");
```

#### `StorageError` (500)
Filesystem operations, database failures.

```typescript
throw new StorageError("Failed to write envelope", "ENVELOPE_WRITE_FAILED");
```

#### `AuthenticationError` (401)
Missing or invalid credentials.

```typescript
throw new AuthenticationError("Invalid API key", "INVALID_API_KEY");
```

#### `AuthorizationError` (403)
Insufficient permissions for requested operation.

```typescript
throw new AuthorizationError("Admin required", "ADMIN_REQUIRED");
```

#### `RoutingError` (500)
Workflow routing failures, HTTP routing errors.

```typescript
throw new RoutingError("Profile not found", "PROFILE_NOT_FOUND");
```

#### `ConfigurationError` (500)
Invalid configuration, missing required settings.

```typescript
throw new ConfigurationError("Invalid TOML", "INVALID_TOML");
```

## Structured Logger

The logger outputs JSON-formatted logs with timestamps, levels, and metadata.

### Log Levels

Controlled via `ZOBOX_LOG_LEVEL` environment variable:
- `debug`: Development diagnostics (default in dev)
- `info`: Normal operations (default in production)
- `warn`: Unexpected but handled situations
- `error`: Failures and exceptions

### Usage

```typescript
import { logger } from "./logger.js";

// Basic logging
logger.info("Server started", { port: 8787 });
logger.warn("Invalid configuration", { field: "timeout" });
logger.error("Database connection failed", error);

// With metadata
logger.error("Failed to process item", error, {
  itemId: "123",
  itemType: "email"
});
```

### Output Format

```json
{
  "timestamp": "2025-01-22T10:30:45.123Z",
  "level": "error",
  "message": "Failed to process attachments",
  "meta": {
    "itemId": "abc-123",
    "itemType": "email"
  },
  "error": {
    "message": "ENOENT: no such file or directory",
    "name": "Error",
    "stack": "Error: ENOENT...",
    "code": "STORAGE_ERROR"
  }
}
```

### Child Loggers

Create request-scoped loggers with pre-populated metadata:

```typescript
import { createChildLogger } from "./logger.js";

const requestLogger = createChildLogger({ requestId: "req-123" });

requestLogger.info("Processing item");
// Outputs: { timestamp: "...", level: "info", message: "Processing item", meta: { requestId: "req-123" } }
```

## Migration Notes

All `console.log`, `console.error`, and `console.warn` calls have been replaced with structured logger calls:

- `console.log` → `logger.info`
- `console.error` → `logger.error`
- `console.warn` → `logger.warn`

Error objects are properly extracted and included in log metadata with stack traces and error codes.

## Best Practices

1. **Use specific error classes**: Choose the most specific error type for better categorization
2. **Include error codes**: Provide unique codes for easier debugging
3. **Add context metadata**: Include relevant IDs, types, and paths in log metadata
4. **Log at appropriate levels**: Debug for diagnostics, Info for operations, Warn for recoverable issues, Error for failures
5. **Don't log sensitive data**: Avoid logging API keys, passwords, or PII in metadata
