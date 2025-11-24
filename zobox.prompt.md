
# Zobox: Configure

You are configuring the Zobox inbox + sorter + router engine that runs as a User Service on my Zo.

Zobox is driven by a TOML config file at:

- `/home/workspace/Inbox/zobox.config.toml`

and optional routing config:

- `/home/workspace/Inbox/routes.json`

## Inputs

- What I want to do:
  - Add or update a **type**
  - Add or update a **sorter**
  - Change global settings (base_dir, auth, files)
  - Add or update a **route destination**

## Procedure

1. **Understand the intent**

   - Ask me *once* what I want to change in Zobox (type, sorter, files, auth, or routes).
   - Summarize the change you plan to make before editing files.

2. **Load current config**

   - Read `/home/workspace/Inbox/zobox.config.toml`.
   - If the file does not exist, copy `config/zobox.config.example.toml` from this repo into `/home/workspace/Inbox/zobox.config.toml` and then read it.

3. **Modify config**

   - For **types**:
     - Use `[types.<typeName>]` sections.
     - Always maintain: `description`, `channel`, and `payload_example` if possible.
  - For **sorters**:
    - Use `[sorters.<sorterName>]` sections.
     - Always set: `type`, `description`.
     - Optionally set: `files_path_template`, `append_to_file`, `destination`.
   - For **files**:
     - Keep `path_template` and `base_files_dir` consistent with `/home/workspace/Inbox/files`.
     - Maintain a valid `filename_strategy` (`original`, `timestampPrefix`, `eventIdPrefix`, or `uuid`).
   - For **auth**:
     - Keep env var names simple and UPPER_SNAKE_CASE.
   - Make edits using precise TOML updates; keep formatting readable.

4. **Routing destinations**

  - If I ask to send messages to external workers or webhooks:
     - Read `/home/workspace/Inbox/routes.json` if it exists.
     - If it doesn't, create it based on `config/routes.example.json`.
     - Add/modify a `destinations.<name>` entry with:
       - `kind: "http"`
       - `url`
       - Optional `method`, `headers`, `enabled`, `timeoutMs`.

5. **Validate**

   - After editing, re-open the file and sanity-check:
     - TOML syntax is valid.
     - No obviously duplicated or conflicting type/sorter names.
     - Path templates use only supported tokens:
       - `{baseFilesDir}`, `{channel}`, `{date}`, `{eventId}`, `{timestamp}`, `{filename}`.

6. **Summarize**

   - Report back:
     - Which sections you changed.
    - New/updated types, sorters, and route destinations.
     - Any manual steps I should take next (e.g. restart the Zobox service, update env vars).

Use concise, technical language. Prefer editing the existing config over inventing new abstractions.
