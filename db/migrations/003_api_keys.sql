-- Migration: Add API keys table for secure key storage
-- Keys are stored as SHA-256 hashes for security

CREATE TABLE IF NOT EXISTS api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,           -- 'admin' or 'read'
  key_hash TEXT NOT NULL,              -- SHA-256 hash of the key
  key_prefix TEXT NOT NULL,            -- First 8 chars for identification (e.g., "zk_a1b2...")
  role TEXT NOT NULL DEFAULT 'admin',  -- 'admin' or 'read'
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  metadata TEXT                        -- JSON for future extensibility
);

CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_role ON api_keys(role);
