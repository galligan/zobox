# Zobox Documentation

Complete documentation for the Zobox inbox + sorter + router engine.

## Documentation Index

### [API Reference](API.md)

Complete HTTP API documentation covering:

- Base URL and versioning
- Authentication (admin and read-only keys)
- All endpoints with request/response examples
- Error responses and status codes
- Pagination details
- Data types and schemas

**Quick Links**:

- [POST /items](API.md#post-items) - Ingest items
- [GET /items](API.md#get-items) - List items
- [GET /items/next](API.md#get-itemsnext) - Worker polling
- [POST /items/:id/ack](API.md#post-itemsidack) - Acknowledge processing
- [Authentication](API.md#authentication) - API key setup

### [Configuration Guide](CONFIGURATION.md)

Comprehensive configuration reference covering:

- TOML schema for all sections (`[zobox]`, `[auth]`, `[files]`, `[types.*]`, `[workflows.*]`)
- Path template tokens (`{channel}`, `{date}`, `{eventId}`, `{filename}`)
- Filename strategies (original, timestampPrefix, eventIdPrefix, uuid)
- Route profiles (HTTP, noop)
- Workflow examples for common use cases

**Quick Links**:

- [Configuration File Structure](CONFIGURATION.md#configuration-file-structure)
- [Path Template Tokens](CONFIGURATION.md#path-template-tokens)
- [Filename Strategies](CONFIGURATION.md#filename-strategies)
- [Route Profiles](CONFIGURATION.md#route-profiles)
- [Workflow Examples](CONFIGURATION.md#workflow-examples)

## Quick Start

New to Zobox? Start here:

1. Read the [main README](../README.md) for quick setup
2. Review the [API Reference](API.md) to understand available endpoints
3. Explore the [Configuration Guide](CONFIGURATION.md) to customize behavior

## Common Use Cases

### Simple Inbox (Store Only)

Store items locally without routing:

```toml
[workflows.updates]
type = "update"
route_profile = "store_only"
```

See: [Simple Updates Example](CONFIGURATION.md#example-1-simple-updates-store-only)

### Webhook Integration

Send items to external webhooks:

```toml
[workflows.posts]
type = "post"
route_profile = "publish_to_worker"
```

Configure in `routes.json`:

```json
{
  "profiles": {
    "publish_to_worker": {
      "kind": "http",
      "url": "https://api.example.com/webhooks/zobox"
    }
  }
}
```

See: [Blog Posts Example](CONFIGURATION.md#example-2-blog-posts-publish-to-worker)

### Worker Polling

Build distributed consumers:

```bash
# Worker fetches unclaimed items
curl "http://localhost:8787/items/next?consumer=worker-1"

# Worker acknowledges processing
curl -X POST "http://localhost:8787/items/{id}/ack" \
  -d '{"consumer":"worker-1"}'
```

See: [GET /items/next](API.md#get-itemsnext), [POST /items/:id/ack](API.md#post-itemsidack)

### Attachment Handling

Three modes for file attachments:

1. **Multipart**: Binary files via `multipart/form-data`
2. **Base64**: Embedded in JSON payload
3. **Mixed**: Both in same request

See: [POST /items - Mode C](API.md#mode-c-multipart-form-data)

## Additional Resources

- **[SPEC.md](../SPEC.md)**: Original specification and design philosophy
- **[AGENTS.md](../AGENTS.md)**: Repository guidelines for AI agents
- **[zobox.prompt.md](../zobox.prompt.md)**: Configuration prompt for agents

## Getting Help

- Check the [Troubleshooting](CONFIGURATION.md#troubleshooting) section
- Review [Error Response Format](API.md#error-response-format)
- Inspect server logs for detailed error messages

## Contributing

Zobox is open source. To contribute:

1. Fork the repository
2. Make changes and add tests
3. Update documentation as needed
4. Submit a pull request

See [AGENTS.md](../AGENTS.md) for commit and PR guidelines.
