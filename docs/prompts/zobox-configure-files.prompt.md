---
name: Zobox - Configure Files
description: Guide agent through configuring attachment storage and file handling
version: 1.0.0
---

# Zobox: Configure Files

You are helping configure the **files section** in Zobox, which controls how attachments are stored, named, and organized.

The `[files]` section in `zobox.config.toml` defines global attachment behavior, while individual workflows can override the path template for specific item types.

## Inputs

Collect the following from the user:

- **Enable/disable attachments** (optional): Whether to store attachments at all
- **Base files directory** (optional): Root directory for all attachments
- **Path template** (optional): How to organize attachments in subdirectories
- **Filename strategy** (optional): How to name saved files
- **Keep base64 in envelope** (optional): Whether to preserve base64 data in JSON envelopes

## Procedure

### 1. Understand the intent

Ask the user what they want to configure:

```
What aspect of file handling would you like to configure?

- Change where attachments are stored (base_files_dir)?
- Update the path organization template (path_template)?
- Change filename strategy (original, timestampPrefix, eventIdPrefix, uuid)?
- Enable/disable attachment storage entirely?
- Keep base64 data in envelopes for backup/debugging?
```

Summarize the changes you'll make before proceeding.

### 2. Load current config

- Read `/home/workspace/Inbox/zobox.config.toml`
- If it doesn't exist, copy `config/zobox.config.example.toml` from the Zobox repo
- Examine the current `[files]` section

### 3. Files section structure

The complete `[files]` section looks like this:

```toml
[files]
enabled = true
base_files_dir = "/home/workspace/Inbox/files"
path_template = "{baseFilesDir}/{channel}/{date}/{eventId}/{filename}"
filename_strategy = "original"
keep_base64_in_envelope = false
```

**Field descriptions:**

- `enabled`: Set to `false` to disable attachment storage entirely
- `base_files_dir`: Absolute path to root attachment directory
- `path_template`: Template for organizing files (uses tokens)
- `filename_strategy`: How to transform filenames (see below)
- `keep_base64_in_envelope`: Preserve base64 data in JSON (increases storage)

### 4. Path template tokens

Available tokens for `path_template`:

| Token | Description | Example |
|-------|-------------|---------|
| `{baseFilesDir}` | Value of `base_files_dir` | `/home/workspace/Inbox/files` |
| `{channel}` | Item's channel (sanitized) | `Tasks`, `Updates` |
| `{date}` | Creation date in YYYY-MM-DD | `2025-11-22` |
| `{eventId}` | Item's UUID | `550e8400-e29b-41d4-a716-446655440000` |
| `{timestamp}` | Sanitized ISO timestamp | `20251122T123456` |
| `{filename}` | Final filename (after strategy applied) | `photo.jpg` or `uuid_photo.jpg` |

**Path template examples:**

```toml
# Organize by channel, then date, then item
path_template = "{baseFilesDir}/{channel}/{date}/{eventId}/{filename}"

# Flat structure with event ID folders
path_template = "{baseFilesDir}/{eventId}/{filename}"

# Date-first hierarchy
path_template = "{baseFilesDir}/{date}/{channel}/{eventId}/{filename}"

# Simple channel-based
path_template = "{baseFilesDir}/{channel}/{filename}"

# Timestamp-based for chronological browsing
path_template = "{baseFilesDir}/{date}/{timestamp}-{filename}"
```

### 5. Filename strategies

Four strategies control how files are named on disk:

**`original`** (default)
- Keep the original filename unchanged
- Example: `photo.jpg` → `photo.jpg`
- Risk: Name collisions if same filename appears multiple times

**`timestampPrefix`**
- Prepend sanitized timestamp
- Example: `photo.jpg` → `20251122T123456_photo.jpg`
- Good for: Chronological sorting, avoiding collisions

**`eventIdPrefix`**
- Prepend item's UUID
- Example: `photo.jpg` → `550e8400-e29b-41d4-a716-446655440000_photo.jpg`
- Good for: Guaranteed uniqueness, tracing files to items

**`uuid`**
- Replace entire filename with UUID, keep extension
- Example: `photo.jpg` → `7f8c9d2e-1234-5678-9abc-def012345678_photo.jpg`
- Good for: Maximum uniqueness, no name conflicts

**Choosing a strategy:**

- Use `original` when path template includes `{eventId}` (collision-free)
- Use `timestampPrefix` for chronological file browsers
- Use `eventIdPrefix` when you want to trace files back to items easily
- Use `uuid` for maximum uniqueness without caring about original names

### 6. Common configurations

**Default configuration (recommended):**
```toml
[files]
enabled = true
base_files_dir = "/home/workspace/Inbox/files"
path_template = "{baseFilesDir}/{channel}/{date}/{eventId}/{filename}"
filename_strategy = "original"
keep_base64_in_envelope = false
```
- Files organized by channel, date, and item ID
- Original filenames preserved (safe because of eventId folder)
- No base64 duplication

**Minimal configuration:**
```toml
[files]
enabled = true
base_files_dir = "/home/workspace/Inbox/files"
path_template = "{baseFilesDir}/{date}/{filename}"
filename_strategy = "timestampPrefix"
keep_base64_in_envelope = false
```
- Simple date-based folders
- Timestamp prefixes prevent name collisions
- Space-efficient

**Debug configuration:**
```toml
[files]
enabled = true
base_files_dir = "/home/workspace/Inbox/files"
path_template = "{baseFilesDir}/{channel}/{date}/{eventId}/{filename}"
filename_strategy = "original"
keep_base64_in_envelope = true
```
- Same as default but keeps base64 in envelopes
- Useful for debugging or backup scenarios
- Warning: Doubles storage usage for attachments

**Disable attachments:**
```toml
[files]
enabled = false
base_files_dir = "/home/workspace/Inbox/files"
path_template = "{baseFilesDir}/{channel}/{date}/{eventId}/{filename}"
filename_strategy = "original"
keep_base64_in_envelope = false
```
- Zobox will not store any attachments
- Items can still be ingested, but files are ignored

### 7. Update zobox.config.toml

Modify the `[files]` section:

- Preserve existing structure
- Update only the fields the user wants to change
- Maintain TOML formatting consistency
- Keep comments if they exist

### 8. Validate

After editing, verify:

- [ ] TOML syntax is valid (re-read file to confirm)
- [ ] `base_files_dir` is an absolute path
- [ ] `path_template` uses only valid tokens
- [ ] `filename_strategy` is one of: `original`, `timestampPrefix`, `eventIdPrefix`, `uuid`
- [ ] `enabled` is a boolean (true/false)
- [ ] `keep_base64_in_envelope` is a boolean
- [ ] Path template won't create extremely deep directory structures
- [ ] Template includes `{eventId}` if using `filename_strategy = "original"`

### 9. Summary

Report back:

```
Updated [files] configuration:

Changes:
- enabled: <true/false>
- base_files_dir: <path>
- path_template: <template>
- filename_strategy: <strategy>
- keep_base64_in_envelope: <true/false>

Storage pattern:
- Files will be stored at: <example path>
- Filename example: <example filename>

Next steps:
1. Restart Zobox service to apply changes
2. Test attachment storage with a sample item
3. Verify files appear in expected location
4. Check disk usage if keep_base64_in_envelope is enabled
```

## Troubleshooting tips

**Problem: Files not appearing where expected**
- Check that `base_files_dir` exists or can be created
- Verify path template tokens are correct
- Ensure `enabled = true` in config
- Check Zobox logs for permission errors

**Problem: Filename collisions**
- Use `{eventId}` in path template for unique folders per item
- Or switch to `timestampPrefix`, `eventIdPrefix`, or `uuid` strategy

**Problem: Directories too deep or messy**
- Simplify path template (fewer tokens)
- Remove unnecessary hierarchy levels
- Consider flat structure: `{baseFilesDir}/{eventId}/{filename}`

**Problem: Can't find files later**
- Use `eventIdPrefix` or `eventIdPrefix` strategy for traceable names
- Keep `{channel}` and `{date}` in path for browsing
- Check SQLite `items.file_dir` for actual storage location

**Problem: Running out of disk space**
- Set `keep_base64_in_envelope = false` (default)
- Consider archiving old attachments
- Monitor `base_files_dir` size regularly

## Example interaction

**User**: "I want to organize attachments by date first, then by channel, and add timestamps to filenames"

**Agent**:
```
I'll configure files to organize by date → channel, with timestamp-prefixed filenames.

Changes:
- path_template: "{baseFilesDir}/{date}/{channel}/{eventId}/{filename}"
- filename_strategy: "timestampPrefix"

Example result:
- Path: /home/workspace/Inbox/files/2025-11-22/Tasks/550e.../20251122T123456_document.pdf

Proceeding to update zobox.config.toml...
```

Update to:

```toml
[files]
enabled = true
base_files_dir = "/home/workspace/Inbox/files"
path_template = "{baseFilesDir}/{date}/{channel}/{eventId}/{filename}"
filename_strategy = "timestampPrefix"
keep_base64_in_envelope = false
```

## Validation checklist

Before finishing, confirm:

- [ ] All paths are absolute (start with `/`)
- [ ] Template tokens are valid and properly formatted
- [ ] Filename strategy is valid
- [ ] Boolean fields are true/false (not strings)
- [ ] Template creates reasonable directory depth (< 6 levels)
- [ ] Configuration matches user's intent
- [ ] TOML file parses without errors

Use concise, technical language. Help users understand storage patterns and choose appropriate strategies for their use case.
