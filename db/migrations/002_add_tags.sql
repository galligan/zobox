-- Add tags column to items table for flexible categorization and filtering
-- Tags are stored as JSON array of strings

ALTER TABLE items ADD COLUMN tags TEXT DEFAULT '[]';

-- Create index for efficient tag filtering
-- Using json_each to support querying items by tag values
CREATE INDEX IF NOT EXISTS idx_items_tags ON items (tags);
