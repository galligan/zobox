---
name: Zorter - New Type
description: Guide agent to create a new item type in Zorter configuration
version: 1.0.0
---

# Zorter: New Type

You are helping create a new **item type** in the Zorter inbox + sorter + router engine.

Types describe semantic categories of items (e.g., `update`, `post`, `task`, `note`, `event`). Each type can specify a default channel, description, and example payload to help agents understand how to use it.

## Inputs

Collect the following from the user:

- **Type name** (required): Short, lowercase identifier (e.g., `task`, `bookmark`, `clip`)
- **Description** (required): One-line explanation of what this type represents
- **Default channel** (optional): Where items of this type should land (defaults to "Inbox")
- **Example payload** (optional): JSON showing typical structure for this type

## Procedure

### 1. Gather requirements

Ask the user for the type details if not already provided:

```
What type are you creating?
- Name: (e.g., "task", "bookmark", "clip")
- Description: (brief explanation)
- Default channel: (optional, defaults to "Inbox")
- Example payload structure: (optional JSON example)
```

Summarize what you'll create before proceeding.

### 2. Load current config

- Read `/home/workspace/Inbox/zorter.config.toml`
- If it doesn't exist, copy `config/zorter.config.example.toml` from the Zorter repo to `/home/workspace/Inbox/zorter.config.toml` and read it

### 3. Generate TOML snippet

Create a new `[types.<typeName>]` section. Example:

```toml
[types.task]
description = "Task or todo item"
channel = "Tasks"
payload_example = """
{
  "title": "Task title",
  "due": "2025-12-31",
  "priority": "high",
  "tags": ["work", "urgent"]
}
"""
```

**Important formatting rules:**

- Use lowercase, hyphen-separated names (e.g., `quick-note`, not `QuickNote`)
- Description should be concise (one sentence)
- Channel name should be capitalized (e.g., `"Tasks"`, `"Bookmarks"`)
- Payload example should use triple-quoted strings (`"""`) for multi-line JSON
- Keep JSON example minimal but representative

### 4. Update zorter.config.toml

Add the new type section to the config file:

- Insert after existing `[types.*]` sections
- Maintain consistent formatting with existing types
- Keep alphabetical order if possible

### 5. Validate

After editing, verify:

- [ ] TOML syntax is valid (re-read the file to confirm)
- [ ] Type name is unique (no duplicate `[types.<name>]` sections)
- [ ] Description is present and clear
- [ ] Channel name is capitalized
- [ ] Payload example is valid JSON (if provided)
- [ ] No trailing whitespace or formatting issues

### 6. Summary

Report back:

```
Created new type: <typeName>

Section added to zorter.config.toml:
- Description: <description>
- Default channel: <channel>
- Payload example: <yes/no>

Next steps:
1. Consider creating a workflow for this type using the "Zorter: New Workflow" prompt
2. Restart the Zorter service to apply changes
3. Test by sending an item: POST /items with {"type": "<typeName>", "payload": {...}}
```

## Common pitfalls

1. **Using uppercase in type names**: Type names should be lowercase with hyphens (e.g., `quick-note`, not `QuickNote`)
2. **Forgetting channel capitalization**: Channels should be title-case (e.g., `"Tasks"` not `"tasks"`)
3. **Invalid JSON in payload_example**: Always validate JSON before adding to config
4. **Duplicate type names**: Check existing types before creating new ones
5. **Missing description**: Every type must have a description for agents to understand its purpose

## Example interaction

**User**: "Create a bookmark type for saving links"

**Agent**:
```
I'll create a new "bookmark" type for saving links.

Details:
- Name: bookmark
- Description: Saved link or web page
- Default channel: Bookmarks
- Payload example: { "url", "title", "tags" }

Proceeding to update zorter.config.toml...
```

Then add:

```toml
[types.bookmark]
description = "Saved link or web page"
channel = "Bookmarks"
payload_example = """
{
  "url": "https://example.com",
  "title": "Example Site",
  "tags": ["reference", "tech"]
}
"""
```

## Validation checklist

Before finishing, confirm:

- [ ] Type name is lowercase and descriptive
- [ ] Description explains the purpose clearly
- [ ] Channel is set (defaults to "Inbox" if omitted)
- [ ] Payload example shows realistic structure
- [ ] TOML file parses without errors
- [ ] No conflicts with existing types

Use concise, technical language. Focus on making the type definition clear and usable by both agents and humans.
