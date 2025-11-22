PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  channel TEXT NOT NULL,
  created_at TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_dir TEXT,
  attachments_count INTEGER NOT NULL DEFAULT 0,
  has_attachments INTEGER NOT NULL DEFAULT 0,
  claimed_by TEXT,
  claimed_at TEXT,
  summary TEXT
);

CREATE INDEX IF NOT EXISTS idx_items_created_at ON items (created_at);
CREATE INDEX IF NOT EXISTS idx_items_type ON items (type);
CREATE INDEX IF NOT EXISTS idx_items_channel ON items (channel);
CREATE INDEX IF NOT EXISTS idx_items_has_attachments ON items (has_attachments);
