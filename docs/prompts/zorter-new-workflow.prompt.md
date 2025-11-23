---
name: Zorter - New Workflow
description: Guide agent to create a workflow for an existing item type
version: 1.0.0
---

# Zorter: New Workflow

You are helping create a new **workflow** for an existing item type in the Zorter inbox + sorter + router engine.

Workflows define what happens to items of a specific type: where attachments are stored, what files to append metadata to, and which route profile to use for external routing.

## Inputs

Collect the following from the user:

- **Workflow name** (required): Descriptive identifier (e.g., `tasks`, `bookmarks`, `daily-notes`)
- **Type binding** (required): Which existing type this workflow handles (e.g., `task`, `bookmark`)
- **Files path template** (optional): Where to store attachments for this workflow
- **Append target** (optional): File path where item metadata should be appended
- **Route profile** (optional): Name of routing profile (defaults to `store_only`)

## Procedure

### 1. Gather requirements

Ask the user for workflow details if not already provided:

```
Creating a workflow for which type?
- Type: (must match an existing [types.<name>])
- Workflow name: (descriptive, e.g., "tasks", "daily-bookmarks")
- Where should attachments be stored? (path template, optional)
- Should metadata be appended to a file? (file path, optional)
- Which route profile? (defaults to "store_only")
```

Summarize what you'll create before proceeding.

### 2. Load current config

- Read `/home/workspace/Inbox/zorter.config.toml`
- Verify the target type exists in `[types.<name>]` sections
- If the type doesn't exist, prompt user to create it first using "Zorter: New Type"

### 3. Generate TOML snippet

Create a new `[workflows.<workflowName>]` section. Example:

```toml
[workflows.tasks]
type = "task"
description = "Process task items and append to task log."
files_path_template = "{baseFilesDir}/Tasks/{date}/{eventId}/{filename}"
append_to_file = "/home/workspace/Inbox/tasks.md"
route_profile = "store_only"
```

**Important configuration rules:**

- `type` field **must** match an existing type definition
- `description` should explain what the workflow does
- `files_path_template` can use these tokens:
  - `{baseFilesDir}` - from `[files]` section
  - `{channel}` - item's channel
  - `{date}` - YYYY-MM-DD format
  - `{eventId}` - item's UUID
  - `{timestamp}` - sanitized ISO timestamp
  - `{filename}` - original or transformed filename
- `append_to_file` should be an absolute path or relative to base_dir
- `route_profile` references a profile in `routes.json` (or `"store_only"` for no routing)

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

### 5. Update zorter.config.toml

Add the new workflow section:

- Insert after existing `[workflows.*]` sections
- Maintain consistent formatting
- Keep workflows grouped with related types when possible

### 6. Validate

After editing, verify:

- [ ] TOML syntax is valid (re-read the file to confirm)
- [ ] Workflow name is unique (no duplicate `[workflows.<name>]`)
- [ ] `type` field matches an existing `[types.<name>]`
- [ ] `description` is present and clear
- [ ] Path template uses only valid tokens
- [ ] Append target path is valid (if specified)
- [ ] Route profile exists in routes.json or is "store_only"
- [ ] No obviously conflicting workflows for same type

### 7. Summary

Report back:

```
Created new workflow: <workflowName>

Configuration:
- Bound to type: <type>
- Description: <description>
- Files path: <files_path_template or "default">
- Append to: <append_to_file or "none">
- Route profile: <route_profile>

Next steps:
1. If using a custom route profile, ensure it exists in routes.json
2. Restart the Zorter service to apply changes
3. Test by sending an item with type "<type>"
4. Verify files land in expected location
5. Check append target file for metadata entry (if configured)
```

## Workflow binding explained

Zorter automatically applies workflows based on the `type` field:

1. Item arrives with `type: "task"`
2. Zorter looks up `[types.task]` for default channel
3. Zorter finds workflow where `workflow.type == "task"`
4. Applies that workflow's file paths, append rules, and routing

**Important**: Only one workflow per type is recommended. If multiple workflows match, Zorter uses the first one found.

## Common pitfalls

1. **Type doesn't exist**: Always verify `[types.<name>]` exists before creating workflow
2. **Invalid path tokens**: Only use supported tokens in `files_path_template`
3. **Absolute vs relative paths**: Use absolute paths for `append_to_file` to avoid confusion
4. **Missing route profile**: If not using "store_only", ensure profile exists in routes.json
5. **Multiple workflows per type**: Avoid creating multiple workflows for the same type
6. **Forgetting description**: Always include a clear description of workflow behavior

## Testing steps

After creating a workflow, suggest these tests:

```bash
# Test 1: Send an item without attachments
curl -X POST "http://localhost:8787/items" \
  -H "content-type: application/json" \
  -H "x-api-key: $ZORTER_ADMIN_API_KEY" \
  -d '{"type": "<type>", "payload": {"test": "data"}}'

# Test 2: Send an item with base64 attachment
curl -X POST "http://localhost:8787/items" \
  -H "content-type: application/json" \
  -H "x-api-key: $ZORTER_ADMIN_API_KEY" \
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

**User**: "Create a workflow for the task type that stores files in a Tasks folder and appends to tasks.md"

**Agent**:
```
I'll create a workflow for the "task" type.

Configuration:
- Workflow name: tasks
- Type: task
- Files: {baseFilesDir}/Tasks/{date}/{eventId}/{filename}
- Append to: /home/workspace/Inbox/tasks.md
- Route: store_only

Proceeding to update zorter.config.toml...
```

Then add:

```toml
[workflows.tasks]
type = "task"
description = "Process task items and append to task log."
files_path_template = "{baseFilesDir}/Tasks/{date}/{eventId}/{filename}"
append_to_file = "/home/workspace/Inbox/tasks.md"
route_profile = "store_only"
```

## Validation checklist

Before finishing, confirm:

- [ ] Type exists in config
- [ ] Workflow name is descriptive
- [ ] Type binding is correct
- [ ] Path template is valid
- [ ] Append target path exists or will be created
- [ ] Route profile is valid
- [ ] TOML file parses without errors
- [ ] No duplicate workflows for same type

Use concise, technical language. Focus on making the workflow definition clear and maintainable.
