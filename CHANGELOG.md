# zobox

## 0.1.1

### Patch Changes

- - store API keys hashed in SQLite, with CLI init generating/printing one-time admin/read keys
  - server authentication now accepts DB-backed keys in addition to env vars
  - clarify CLI help/options for admin/read key inputs during init/serve
