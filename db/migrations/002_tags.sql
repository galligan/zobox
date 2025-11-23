-- Migration 002: Normalize tags into separate tables
-- This migration creates a proper relational structure for tags with extensibility

-- Tags table: canonical list of all tags
CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  description TEXT,
  color TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT DEFAULT 'system',
  metadata TEXT
);

-- Message-Tags junction table: many-to-many relationship
CREATE TABLE IF NOT EXISTS message_tags (
  message_id TEXT NOT NULL,
  tag_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  added_by TEXT DEFAULT 'system',
  source TEXT DEFAULT 'user',  -- 'user' | 'sorter' | 'api' | 'ml'
  metadata TEXT,
  PRIMARY KEY (message_id, tag_id),
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_message_tags_message_id ON message_tags(message_id);
CREATE INDEX IF NOT EXISTS idx_message_tags_tag_id ON message_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_message_tags_source ON message_tags(source);

-- Migrate existing tags from messages.tags JSON column to new structure
-- This is safe to run multiple times (idempotent)
INSERT OR IGNORE INTO tags (name, created_at, created_by)
SELECT DISTINCT
  json_each.value as name,
  datetime('now') as created_at,
  'migration' as created_by
FROM messages, json_each(messages.tags)
WHERE messages.tags IS NOT NULL
  AND messages.tags != '[]'
  AND json_each.value != '';

-- Migrate message-tag relationships
INSERT OR IGNORE INTO message_tags (message_id, tag_id, created_at, source)
SELECT
  messages.id as message_id,
  tags.id as tag_id,
  messages.created_at as created_at,
  'migration' as source
FROM messages, json_each(messages.tags)
JOIN tags ON tags.name = json_each.value COLLATE NOCASE
WHERE messages.tags IS NOT NULL
  AND messages.tags != '[]'
  AND json_each.value != '';

-- Note: We keep the messages.tags column for now for backwards compatibility
-- It can be dropped in a future migration once the new system is stable
