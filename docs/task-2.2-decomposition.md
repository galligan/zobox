# Task 2.2: POST /items Handler Decomposition

## Summary

Successfully decomposed the POST /items handler to reduce complexity from **50 to ~8**.

## Changes

### Before (src/server.ts)
- **Lines:** ~180 (lines 84-262)
- **Complexity:** 50
- **Issues:**
  - All parsing logic inline
  - Attachment processing inline
  - Envelope creation inline
  - Storage and indexing inline
  - Error handling scattered
  - Hard to test individual components

### After

#### 1. Main Handler (src/server.ts, lines 70-93)
- **Lines:** 24
- **Complexity:** ~8
- **Responsibilities:**
  - Authentication
  - Delegate to parseRequest()
  - Delegate to processAndStoreItem()
  - Error handling with ZorterError hierarchy

```typescript
app.post("/items", async (c) => {
  const runtime = c.get("runtime");
  const auth = authenticate(c, runtime.config, { requireAdmin: true });
  if ("error" in auth) {
    return c.json(auth.error, auth.status);
  }

  try {
    const { item, attachments } = await parseRequest(c);
    const envelope = await processAndStoreItem(item, attachments, runtime);
    return c.json({ item: toItemView(envelope) }, 201);
  } catch (err) {
    if (isZorterError(err)) {
      return c.json({ error: err.message, code: err.code }, err.statusCode);
    }
    logger.error("Failed to process /items request", err);
    return c.json({ error: "Internal server error" }, 500);
  }
});
```

#### 2. New Module: src/handlers/items.ts
**Exported Functions:**

- `parseRequest(c)`: Routes to multipart or JSON parser based on content-type
- `parseMultipartRequest(c)`: Handles multipart form data with file uploads
- `parseJsonRequest(c)`: Handles JSON requests with base64 attachments
- `createItemEnvelope()`: Assembles envelope from input and metadata
- `storeAndProcessItem()`: Writes envelope, index, and applies workflows
- `processAndStoreItem()`: Orchestrates the full item creation flow
- `toItemView()`: Converts envelope to API response format

**Types:**
- `RuntimeContext`: Config, storage, and routes
- `ItemMetadata`: ID, channel, timestamps
- `ParsedRequest`: Item and attachments
- `ItemView`: API response format

#### 3. Tests: src/handlers/items.test.ts
**Coverage:** 14 tests, 40 assertions
- Multipart request parsing
- JSON request parsing with base64 attachments
- File attachment handling
- Envelope creation
- Item view conversion
- Error cases

#### 4. Integration Tests: src/handlers/items.integration.test.ts
**Coverage:** 5 integration scenarios
- JSON requests without attachments
- JSON requests with base64 attachments
- Multipart requests with file uploads
- Type-specific channel resolution
- Multiple attachments

## Benefits

1. **Testability:** Each function can be tested independently
2. **Readability:** Main handler is now 24 lines vs 180 lines
3. **Maintainability:** Changes to parsing, storage, or envelope creation are isolated
4. **Reusability:** Functions can be reused in other handlers or CLI commands
5. **Error Handling:** Structured ZorterError hierarchy for consistent responses
6. **Type Safety:** Explicit types for all inputs and outputs

## Complexity Reduction

| Component | Before | After |
|-----------|--------|-------|
| Main Handler | 50 | ~8 |
| Request Parsing | N/A | ~10 (per parser) |
| Envelope Creation | N/A | ~5 |
| Storage + Processing | N/A | ~8 |

## Migration Notes

- No breaking changes to API contract
- All existing tests pass
- Error responses now include error codes for debugging
- Uses existing validation middleware patterns
- Integrates with existing workflow and attachment processing

## Files Changed

1. **Modified:**
   - `src/server.ts`: Simplified POST /items handler

2. **Added:**
   - `src/handlers/items.ts`: Decomposed handler functions
   - `src/handlers/items.test.ts`: Unit tests
   - `src/handlers/items.integration.test.ts`: Integration tests
   - `docs/task-2.2-decomposition.md`: This document

## Test Results

```
bun test src/handlers/items.test.ts
✓ 14 pass
✓ 0 fail
✓ 40 expect() calls
```

## Next Steps

- Consider extracting authentication logic to middleware
- Add more integration tests with real database
- Document handler architecture in SPEC.md
- Apply same pattern to other complex handlers (GET /items, POST /items/:id/ack)
