---
name: Zobox - Add Route
description: Guide agent to create or update HTTP routing destinations for message sorters
version: 1.0.0
---

# Zobox: Add Route

You are helping create or update a **destination** in Zobox's `routes.json` configuration.

Destinations define external HTTP endpoints where Zobox can send message envelopes. sorters reference these destinations via the `destination` field to enable outbound routing.

## Inputs

Collect the following from the user:

- **Destination name** (required): Descriptive identifier (e.g., `publish_to_worker`, `notify_slack`)
- **Endpoint URL** (required): HTTP(S) URL to POST message envelopes to
- **HTTP method** (optional): Defaults to `POST`
- **Headers** (optional): Custom HTTP headers to send
- **Enabled** (optional): Whether this destination is active (defaults to `true`)
- **Timeout** (optional): Request timeout in milliseconds (defaults to 5000ms)

## Procedure

### 1. Gather requirements

Ask the user for route details if not already provided:

```
Creating a destination. Please provide:

- Destination name: (e.g., "publish_to_worker", "send_to_webhook")
- Endpoint URL: (where to send messages)
- HTTP method: (POST, PUT, PATCH - defaults to POST)
- Custom headers: (optional, e.g., {"Authorization": "Bearer xyz"})
- Enabled: (true/false, defaults to true)
- Timeout: (milliseconds, defaults to 5000)
```

Summarize what you'll create before proceeding.

### 2. Test connectivity (recommended)

Before creating the route, test the endpoint if possible:

```bash
curl -X POST "<endpoint_url>" \
  -H "content-type: application/json" \
  -H "<any custom headers>" \
  -d '{"test": "connection"}' \
  -w "\nHTTP Status: %{http_code}\n"
```

Report:
- Whether endpoint is reachable
- HTTP status code received
- Any authentication or CORS issues
- Estimated response time

If test fails, warn the user but proceed if they confirm.

### 3. Load or create routes.json

- Check if `/home/workspace/Inbox/routes.json` exists
- If it exists, read it
- If not, create it from `config/routes.example.json` template:

```json
{
  "destinations": {
    "store_only": {
      "kind": "noop",
      "description": "Do nothing, keep message in local inbox."
    }
  }
}
```

### 4. Generate destination

Create a new destination entry. Example:

```json
{
  "destinations": {
    "store_only": {
      "kind": "noop",
      "description": "Do nothing, keep item in local inbox."
    },
    "publish_to_worker": {
      "kind": "http",
      "description": "POST message envelope to worker service.",
      "url": "http://localhost:9000/zobox/messages",
      "method": "POST",
      "headers": {
        "content-type": "application/json",
        "x-api-key": "worker-secret-key"
      },
      "enabled": true,
      "timeoutMs": 5000
    }
  }
}
```

**Field descriptions:**

- `kind`: Must be `"http"` for active routes or `"noop"` for no-op routes
- `description`: Human-readable explanation of what this route does
- `url`: Full HTTP(S) endpoint URL
- `method`: HTTP verb (POST, PUT, PATCH)
- `headers`: Key-value pairs of HTTP headers
- `enabled`: Set to `false` to temporarily disable route without deleting it
- `timeoutMs`: Request timeout in milliseconds

### 5. Destination types

**HTTP destination (active):**
```json
{
  "kind": "http",
  "description": "Send to external service",
  "url": "https://api.example.com/webhook",
  "method": "POST",
  "headers": {
    "authorization": "Bearer secret-token"
  },
  "enabled": true,
  "timeoutMs": 10000
}
```

**No-op destination (local only):**
```json
{
  "kind": "noop",
  "description": "Store locally without routing"
}
```

**Disabled destination (temporarily off):**
```json
{
  "kind": "http",
  "description": "Worker endpoint (currently disabled)",
  "url": "http://localhost:9000/messages",
  "enabled": false,
  "timeoutMs": 5000
}
```

### 6. Update routes.json

Add or update the destination:

- Maintain valid JSON syntax
- Preserve existing destinations
- Keep `store_only` as default destination
- Use consistent indentation (2 spaces)
- Alphabetize destinations if possible

### 7. Link to sorter

Remind user to reference this destination in a sorter:

```toml
[sorters.my_sorter]
type = "my_type"
description = "..."
destination = "<destination_name>"
```

If sorter already exists, offer to update it.

### 8. Validate

After editing routes.json, verify:

- [ ] JSON syntax is valid (parse the file to confirm)
- [ ] Destination name is unique
- [ ] `kind` is either `"http"` or `"noop"`
- [ ] `url` is present for HTTP destinations
- [ ] `url` is a valid HTTP(S) URL
- [ ] `method` is valid (POST, PUT, PATCH, GET)
- [ ] `headers` is an object (if present)
- [ ] `enabled` is boolean (if present)
- [ ] `timeoutMs` is a positive number (if present)
- [ ] Description is clear and helpful

### 9. Summary

Report back:

```
Created destination: <destinationName>

Configuration:
- Type: <http/noop>
- Endpoint: <url>
- Method: <method>
- Headers: <count> custom headers
- Enabled: <true/false>
- Timeout: <timeoutMs>ms

Connectivity test: <passed/failed/skipped>

Next steps:
1. Ensure endpoint is reachable from Zobox server
2. Reference this destination in a sorter: destination = "<destinationName>"
3. Restart Zobox service to load new routes.json
4. Test by sending a message that uses this sorter
5. Check Zobox logs for routing success/failure
6. Monitor endpoint logs to verify messages are arriving
```

## Common destination patterns

**Webhook notification:**
```json
{
  "kind": "http",
  "description": "Notify Slack channel",
  "url": "https://hooks.slack.com/services/T00/B00/XXX",
  "method": "POST",
  "headers": {
    "content-type": "application/json"
  },
  "enabled": true,
  "timeoutMs": 3000
}
```

**Worker service:**
```json
{
  "kind": "http",
  "description": "Send to background worker for processing",
  "url": "http://worker.internal:8080/jobs",
  "method": "POST",
  "headers": {
    "x-api-key": "worker-secret",
    "content-type": "application/json"
  },
  "enabled": true,
  "timeoutMs": 10000
}
```

**External API:**
```json
{
  "kind": "http",
  "description": "Forward to external API",
  "url": "https://api.external.com/v1/events",
  "method": "POST",
  "headers": {
    "authorization": "Bearer long-lived-token",
    "content-type": "application/json",
    "x-source": "zobox"
  },
  "enabled": true,
  "timeoutMs": 15000
}
```

**Local development endpoint:**
```json
{
  "kind": "http",
  "description": "Local dev server",
  "url": "http://localhost:3000/api/zobox",
  "method": "POST",
  "enabled": true,
  "timeoutMs": 5000
}
```

## Security considerations

When creating routes, remind users:

1. **API keys in headers**: Store sensitive tokens in environment variables, not directly in routes.json
2. **HTTPS in production**: Use `https://` URLs for production endpoints
3. **Network access**: Ensure Zobox server can reach the endpoint (firewall, VPN, etc.)
4. **Endpoint validation**: Target endpoint should validate incoming requests
5. **Rate limiting**: Consider rate limits on both sides
6. **Timeout values**: Set appropriate timeouts to avoid blocking Zobox

**Better approach for secrets:**

Instead of:
```json
{
  "headers": {
    "authorization": "Bearer secret-key-here"
  }
}
```

Recommend:
```json
{
  "headers": {
    "authorization": "Bearer ${WORKER_API_KEY}"
  }
}
```

(Note: Current Zobox version doesn't support env var expansion in routes.json, but this is a good practice to document for future versions)

## Troubleshooting

**Problem: Destination not working**
- Check Zobox logs for HTTP errors
- Verify endpoint is reachable: `curl -v <url>`
- Confirm `enabled: true` in destination
- Check sorter references correct `destination` name
- Verify network/firewall rules

**Problem: Timeout errors**
- Increase `timeoutMs` value
- Check endpoint response time
- Verify endpoint isn't blocking or hanging
- Consider async processing on endpoint side

**Problem: Authentication failures**
- Verify headers are correct
- Test with curl to confirm auth works
- Check for typos in API keys
- Ensure tokens haven't expired

**Problem: Messages not routing**
- Verify sorter has `destination` field set
- Check destination name matches exactly
- Confirm `kind: "http"` (not `"noop"`)
- Restart Zobox after routes.json changes

## Example interaction

**User**: "Add a route to send messages to my worker at http://localhost:9000/jobs with an API key"

**Agent**:
```
I'll create a route destination for your worker endpoint.

Details:
- Destination name: send_to_worker
- URL: http://localhost:9000/jobs
- Method: POST
- Headers: x-api-key
- Timeout: 5000ms

Testing connectivity...
[runs curl test]
✓ Endpoint reachable (HTTP 200, 45ms)

Proceeding to update routes.json...
```

Add to `routes.json`:

```json
{
  "destinations": {
    "store_only": {
      "kind": "noop",
      "description": "Do nothing, keep message in local inbox."
    },
    "send_to_worker": {
      "kind": "http",
      "description": "Send to background worker for processing",
      "url": "http://localhost:9000/jobs",
      "method": "POST",
      "headers": {
        "content-type": "application/json",
        "x-api-key": "your-worker-api-key"
      },
      "enabled": true,
      "timeoutMs": 5000
    }
  }
}
```

## Validation checklist

Before finishing, confirm:

- [ ] JSON syntax is valid
- [ ] Destination name is descriptive
- [ ] URL is reachable (tested with curl)
- [ ] Method is appropriate (usually POST)
- [ ] Headers are correct
- [ ] Timeout is reasonable (not too short/long)
- [ ] Destination is enabled (unless intentionally disabled)
- [ ] sorter can reference this destination
- [ ] No sensitive data directly in routes.json

Use concise, technical language. Focus on making routes reliable and maintainable.
