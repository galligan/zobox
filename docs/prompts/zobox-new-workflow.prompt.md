---
name: Zobox - New sorter
description: Guide agent to create a sorter for an existing item type
version: 1.0.0
---

# Zobox: New sorter

You are helping create a new **sorter** for an existing item type in the Zobox inbox + sorter + router engine.

Sorters define what happens to messages of a specific type: where attachments are stored, what files to append metadata to, and which route profile to use for external routing.

## Inputs

Collect the following from the user:

- **sorter name** (required): Descriptive identifier (e.g., `tasks`, `bookmarks`, `daily-notes`)
- **Type binding** (required): Which existing type this sorter handles (e.g., `task`, `bookmark`)
- **Files path template** (optional): Where to store attachments for this sorter
- **Append target** (optional): File path where message metadata should be appended
- **Destination** (optional): Name of routing destination (defaults to `store_only`)

## Procedure

### 1. Gather requirements

Ask the user for sorter details if not already provided:

```
Creating a sorter for which type?
- Type: (must match an existing [types.<name>])
- sorter name: (descriptive, e.g., "tasks", "daily-bookmarks")
- Where should attachments be stored? (path template, optional)
- Should metadata be appended to a file? (file path, optional)
- Which destination? (defaults to "store_only")
```

Summarize what you'll create before proceeding.

### 2. Load current config

- Read `/home/workspace/Inbox/zobox.config.toml`
- Verify the target type exists in `[types.<name>]` sections
- If the type doesn't exist, prompt user to create it first using "Zobox: New Type"

### 3. Generate TOML snippet

Create a new `[sorters.<sorterName>]` section. Example:

```toml
[sorters.tasks]
type = "task"
description = "Process task messages and append to task log."
files_path_template = "{baseFilesDir}/Tasks/{date}/{eventId}/{filename}"
append_to_file = "/home/workspace/Inbox/tasks.md"
destination = "store_only"
```

**Important configuration rules:**

- `type` field **must** match an existing type definition
- `description` should explain what the sorter does
- `files_path_template` can use these tokens:
  - `{baseFilesDir}` - from `[files]` section
  - `{channel}` - message's channel
  - `{date}` - YYYY-MM-DD format
  - `{eventId}` - message's UUID
  - `{timestamp}` - sanitized ISO timestamp
  - `{filename}` - original or transformed filename
- `append_to_file` should be an absolute path or relative to base_dir
- `destination` references a destination in `routes.json` (or `"store_only"` for no routing)

### 4. Path template examples

Help user choose an appropriate path template:

**By channel and date:**
```toml
files_path_template = "{baseFilesDir}/{channel}/{date}/{eventId}/{filename}"
```

**By type with date hierarchy:**
```toml
files_path_template = "{baseFilesDir}/Tasks/{date}/{eventId}/{filename}"
```

**Flat structure with event ID:**
```toml
files_path_template = "{baseFilesDir}/attachments/{eventId}/{filename}"
```

**With timestamp prefix:**
```toml
files_path_template = "{baseFilesDir}/{channel}/{timestamp}-{filename}"
```

### 5. Update zobox.config.toml

Add the new sorter section:

- Insert after existing `[sorters.*]` sections
- Maintain consistent formatting
- Keep sorters grouped with related types when possible

### 6. Validate

After editing, verify:

- [ ] TOML syntax is valid (re-read the file to confirm)
- [ ] sorter name is unique (no duplicate `[sorters.<name>]`)
- [ ] `type` field matches an existing `[types.<name>]`
- [ ] `description` is present and clear
- [ ] Path template uses only valid tokens
- [ ] Append target path is valid (if specified)
- [ ] Route profile exists in routes.json or is "store_only"
- [ ] No obviously conflicting sorters for same type

### 7. Summary

Report back:

```
Created new sorter: <sorterName>

Configuration:
- Bound to type: <type>
- Description: <description>
- Files path: <files_path_template or "default">
- Append to: <append_to_file or "none">
- Destination: <destination>

Next steps:
1. If using a custom destination, ensure it exists in routes.json
2. Restart the Zobox service to apply changes
3. Test by sending a message with type "<type>"
4. Verify files land in expected location
5. Check append target file for metadata entry (if configured)
```

## sorter binding explained

Zobox automatically applies sorters based on the `type` field:

1. Message arrives with `type: "task"`
2. Zobox looks up `[types.task]` for default channel
3. Zobox finds sorter where `sorter.type == "task"`
4. Applies that sorter's file paths, append rules, and routing

**Important**: Only one sorter per type is recommended. If multiple sorters match, Zobox uses the first one found.

## Common pitfalls

1. **Type doesn't exist**: Always verify `[types.<name>]` exists before creating sorter
2. **Invalid path tokens**: Only use supported tokens in `files_path_template`
3. **Absolute vs relative paths**: Use absolute paths for `append_to_file` to avoid confusion
4. **Missing destination**: If not using "store_only", ensure destination exists in routes.json
5. **Multiple sorters per type**: Avoid creating multiple sorters for the same type
6. **Forgetting description**: Always include a clear description of sorter behavior

## Testing steps

After creating a sorter, suggest these tests:

```bash
# Test 1: Send a message without attachments
curl -X POST "http://localhost:8787/messages" \
  -H "content-type: application/json" \
  -H "x-api-key: $ZOBOX_ADMIN_API_KEY" \
  -d '{"type": "<type>", "payload": {"test": "data"}}'

# Test 2: Send a message with base64 attachment
curl -X POST "http://localhost:8787/messages" \
  -H "content-type: application/json" \
  -H "x-api-key: $ZOBOX_ADMIN_API_KEY" \
  -d '{
    "type": "<type>",
    "payload": {"test": "with file"},
    "attachments": [{
      "filename": "test.txt",
      "mimeType": "text/plain",
      "base64": "SGVsbG8gV29ybGQ="
    }]
  }'

# Test 3: Verify file location
ls -la <expected_path_from_template>

# Test 4: Check append target (if configured)
cat <append_to_file>
```

## Example interaction

**User**: "Create a sorter for the task type that stores files in a Tasks folder and appends to tasks.md"

**Agent**:
```
I'll create a sorter for the "task" type.

Configuration:
- sorter name: tasks
- Type: task
- Files: {baseFilesDir}/Tasks/{date}/{eventId}/{filename}
- Append to: /home/workspace/Inbox/tasks.md
- Destination: store_only

Proceeding to update zobox.config.toml...
```

Then add:

```toml
[sorters.tasks]
type = "task"
description = "Process task messages and append to task log."
files_path_template = "{baseFilesDir}/Tasks/{date}/{eventId}/{filename}"
append_to_file = "/home/workspace/Inbox/tasks.md"
destination = "store_only"
```

## Validation checklist

Before finishing, confirm:

- [ ] Type exists in config
- [ ] sorter name is descriptive
- [ ] Type binding is correct
- [ ] Path template is valid
- [ ] Append target path exists or will be created
- [ ] Destination is valid
- [ ] TOML file parses without errors
- [ ] No duplicate sorters for same type

Use concise, technical language. Focus on making the sorter definition clear and maintainable.
