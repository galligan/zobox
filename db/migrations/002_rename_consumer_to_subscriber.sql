-- Migration: Rename consumer to subscriber
-- Changes subscribed_by -> subscribed_by, subscribed_at -> subscribed_at

-- SQLite doesn't support column renaming directly, so we need to:
-- 1. Create new columns
-- 2. Copy data
-- 3. Drop old columns (via table recreation)

-- Create temporary table with new schema
CREATE TABLE messages_new (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  channel TEXT NOT NULL,
  created_at TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_dir TEXT,
  attachments_count INTEGER NOT NULL DEFAULT 0,
  has_attachments INTEGER NOT NULL DEFAULT 0,
  subscribed_by TEXT,
  subscribed_at TEXT,
  summary TEXT
);

-- Copy data from old table
INSERT INTO messages_new (
  id,
  type,
  channel,
  created_at,
  file_path,
  file_dir,
  attachments_count,
  has_attachments,
  subscribed_by,
  subscribed_at,
  summary
)
SELECT
  id,
  type,
  channel,
  created_at,
  file_path,
  file_dir,
  attachments_count,
  has_attachments,
  subscribed_by,
  subscribed_at,
  summary
FROM messages;

-- Drop old table
DROP TABLE messages;

-- Rename new table to original name
ALTER TABLE messages_new RENAME TO messages;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages (created_at);
CREATE INDEX IF NOT EXISTS idx_messages_type ON messages (type);
CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages (channel);
CREATE INDEX IF NOT EXISTS idx_messages_has_attachments ON messages (has_attachments);
