PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  channel TEXT NOT NULL,
  created_at TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_dir TEXT,
  attachments_count INTEGER NOT NULL DEFAULT 0 CHECK (attachments_count >= 0),
  has_attachments INTEGER NOT NULL DEFAULT 0 CHECK (has_attachments IN (0, 1)),
  subscribed_by TEXT,
  subscribed_at TEXT,
  summary TEXT,
  tags TEXT,
  CHECK (has_attachments = 0 OR attachments_count > 0)
);

CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages (created_at);
CREATE INDEX IF NOT EXISTS idx_messages_type ON messages (type);
CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages (channel);
CREATE INDEX IF NOT EXISTS idx_messages_has_attachments ON messages (has_attachments);
CREATE INDEX IF NOT EXISTS idx_messages_tags ON messages (tags);

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
