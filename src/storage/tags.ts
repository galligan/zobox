/**
 * Tag storage operations.
 * Handles tag creation, resolution, querying, and merging.
 */

import type { Database } from "bun:sqlite";
import { logger } from "../logger.js";
import type { MergeTagsInput, Tag, TagWithUsage } from "../types.js";

/**
 * Resolve tag names to tag IDs, creating new tags as needed.
 * This is the "smart" auto-creation function that makes tags easy to use.
 *
 * @param db - SQLite database instance
 * @param tagNames - Array of tag names to resolve
 * @param createdBy - Who is creating the tags (for audit)
 * @returns Array of tag IDs corresponding to the input names
 */
export function resolveTagIds(
  db: Database,
  tagNames: string[],
  createdBy = "system"
): number[] {
  if (tagNames.length === 0) {
    return [];
  }

  // Normalize and deduplicate tag names (case-insensitive)
  const uniqueNames = Array.from(
    new Set(
      tagNames.map((name) => name.trim()).filter((name) => name.length > 0)
    )
  );

  const tagIds: number[] = [];

  for (const name of uniqueNames) {
    // Try to find existing tag (case-insensitive)
    const existing = db
      .prepare("SELECT id FROM tags WHERE name = ? COLLATE NOCASE")
      .get(name) as { id: number } | undefined;

    if (existing) {
      tagIds.push(existing.id);
    } else {
      // Create new tag
      const result = db
        .prepare(
          "INSERT INTO tags (name, created_at, created_by) VALUES (?, datetime('now'), ?)"
        )
        .run(name, createdBy);

      tagIds.push(result.lastInsertRowid as number);
      logger.info("Created new tag", { name, id: result.lastInsertRowid });
    }
  }

  return tagIds;
}

/**
 * Get tag objects by their IDs.
 *
 * @param db - SQLite database instance
 * @param tagIds - Array of tag IDs to fetch
 * @returns Array of Tag objects
 */
export function getTagsByIds(db: Database, tagIds: number[]): Tag[] {
  if (tagIds.length === 0) {
    return [];
  }

  const placeholders = tagIds.map(() => "?").join(",");
  const stmt = db.prepare(`
    SELECT
      id,
      name,
      description,
      color,
      created_at as createdAt,
      created_by as createdBy,
      metadata
    FROM tags
    WHERE id IN (${placeholders})
    ORDER BY name ASC
  `);

  const rows = stmt.all(...tagIds) as Array<{
    id: number;
    name: string;
    description: string | null;
    color: string | null;
    createdAt: string;
    createdBy: string;
    metadata: string | null;
  }>;

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    color: row.color ?? undefined,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
  }));
}

/**
 * Get all tags for a specific message.
 *
 * @param db - SQLite database instance
 * @param messageId - Message ID to get tags for
 * @returns Array of Tag objects
 */
export function getTagsByMessageId(db: Database, messageId: string): Tag[] {
  const stmt = db.prepare(`
    SELECT
      t.id,
      t.name,
      t.description,
      t.color,
      t.created_at as createdAt,
      t.created_by as createdBy,
      t.metadata
    FROM tags t
    JOIN message_tags mt ON t.id = mt.tag_id
    WHERE mt.message_id = ?
    ORDER BY t.name ASC
  `);

  const rows = stmt.all(messageId) as Array<{
    id: number;
    name: string;
    description: string | null;
    color: string | null;
    createdAt: string;
    createdBy: string;
    metadata: string | null;
  }>;

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    color: row.color ?? undefined,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
  }));
}

/**
 * Add tags to a message.
 *
 * @param db - SQLite database instance
 * @param messageId - Message ID to add tags to
 * @param tagNames - Array of tag names to add (auto-creates if needed)
 * @param source - Source of the tag addition (user, sorter, api, ml)
 * @param addedBy - Who added the tags (for audit)
 */
// biome-ignore lint/nursery/useMaxParams: Function parameters are clear and necessary for audit trail
export function addTagsToMessage(
  db: Database,
  messageId: string,
  tagNames: string[],
  source: "user" | "sorter" | "api" | "ml" = "user",
  addedBy = "system"
): void {
  if (tagNames.length === 0) {
    return;
  }

  // Resolve tag names to IDs (creates new tags if needed)
  const tagIds = resolveTagIds(db, tagNames, addedBy);

  // Insert message-tag relationships (ignore duplicates)
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO message_tags (message_id, tag_id, created_at, added_by, source)
    VALUES (?, ?, datetime('now'), ?, ?)
  `);

  for (const tagId of tagIds) {
    stmt.run(messageId, tagId, addedBy, source);
  }
}

/**
 * Remove tags from a message.
 *
 * @param db - SQLite database instance
 * @param messageId - Message ID to remove tags from
 * @param tagNames - Array of tag names to remove
 */
export function removeTagsFromMessage(
  db: Database,
  messageId: string,
  tagNames: string[]
): void {
  if (tagNames.length === 0) {
    return;
  }

  // Get tag IDs for the given names
  const placeholders = tagNames.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT id FROM tags WHERE name IN (${placeholders}) COLLATE NOCASE`
    )
    .all(...tagNames) as Array<{ id: number }>;
  const tagIds = rows.map((row) => row.id);

  if (tagIds.length === 0) {
    return;
  }

  // Delete message-tag relationships
  const deletePlaceholders = tagIds.map(() => "?").join(",");
  db.prepare(
    `DELETE FROM message_tags WHERE message_id = ? AND tag_id IN (${deletePlaceholders})`
  ).run(messageId, ...tagIds);
}

/**
 * List all tags with usage counts.
 *
 * @param db - SQLite database instance
 * @param limit - Maximum number of tags to return
 * @param offset - Number of tags to skip
 * @returns Array of TagWithUsage objects
 */
export function listAllTags(
  db: Database,
  limit = 100,
  offset = 0
): TagWithUsage[] {
  const stmt = db.prepare(`
    SELECT
      t.id,
      t.name,
      t.description,
      t.color,
      t.created_at as createdAt,
      t.created_by as createdBy,
      t.metadata,
      COUNT(mt.message_id) as usageCount
    FROM tags t
    LEFT JOIN message_tags mt ON t.id = mt.tag_id
    GROUP BY t.id
    ORDER BY usageCount DESC, t.name ASC
    LIMIT ? OFFSET ?
  `);

  const rows = stmt.all(limit, offset) as Array<{
    id: number;
    name: string;
    description: string | null;
    color: string | null;
    createdAt: string;
    createdBy: string;
    metadata: string | null;
    usageCount: number;
  }>;

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    color: row.color ?? undefined,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    usageCount: row.usageCount,
  }));
}

/**
 * Merge multiple tags into a single tag.
 * This is the power-user feature for consolidating accidentally created tags.
 *
 * @param db - SQLite database instance
 * @param input - Merge configuration (source tags, target tag, optional new name)
 * @returns The resulting merged tag
 */
export function mergeTags(db: Database, input: MergeTagsInput): Tag {
  const { sourceTagIds, targetTagId, newName } = input;

  // Validate inputs
  if (sourceTagIds.length === 0) {
    throw new Error("At least one source tag must be provided");
  }

  // Determine the target tag
  let finalTargetId: number;

  if (targetTagId) {
    // Merging into an existing tag
    finalTargetId = targetTagId;

    // Ensure target is not in source list
    if (sourceTagIds.includes(targetTagId)) {
      throw new Error("Target tag cannot be in source tags list");
    }
  } else if (newName) {
    // Creating a new tag for the merge
    const result = db
      .prepare(
        "INSERT INTO tags (name, created_at, created_by) VALUES (?, datetime('now'), 'merge')"
      )
      .run(newName);
    finalTargetId = result.lastInsertRowid as number;
  } else {
    // Use the first source tag as the target
    finalTargetId = sourceTagIds[0];
    sourceTagIds.shift(); // Remove it from sources
  }

  // Optional: Rename the target tag if newName provided
  if (newName && targetTagId) {
    db.prepare("UPDATE tags SET name = ? WHERE id = ?").run(
      newName,
      finalTargetId
    );
  }

  // Migrate all message-tag relationships from source tags to target
  // Use INSERT OR IGNORE to handle duplicates gracefully
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO message_tags (message_id, tag_id, created_at, added_by, source, metadata)
    SELECT message_id, ?, created_at, added_by, source, metadata
    FROM message_tags
    WHERE tag_id = ?
  `);

  for (const sourceTagId of sourceTagIds) {
    stmt.run(finalTargetId, sourceTagId);
  }

  // Delete the source tags (CASCADE will handle message_tags)
  const placeholders = sourceTagIds.map(() => "?").join(",");
  if (sourceTagIds.length > 0) {
    db.prepare(`DELETE FROM tags WHERE id IN (${placeholders})`).run(
      ...sourceTagIds
    );
  }

  logger.info("Merged tags", {
    sourceTagIds,
    targetTagId: finalTargetId,
    newName,
  });

  // Return the merged tag
  const mergedTags = getTagsByIds(db, [finalTargetId]);
  return mergedTags[0];
}

/**
 * Search tags by name prefix (for autocomplete).
 *
 * @param db - SQLite database instance
 * @param prefix - Name prefix to search for
 * @param limit - Maximum number of results
 * @returns Array of matching tags
 */
export function searchTags(db: Database, prefix: string, limit = 10): Tag[] {
  const stmt = db.prepare(`
    SELECT
      id,
      name,
      description,
      color,
      created_at as createdAt,
      created_by as createdBy,
      metadata
    FROM tags
    WHERE name LIKE ? COLLATE NOCASE
    ORDER BY name ASC
    LIMIT ?
  `);

  const rows = stmt.all(`${prefix}%`, limit) as Array<{
    id: number;
    name: string;
    description: string | null;
    color: string | null;
    createdAt: string;
    createdBy: string;
    metadata: string | null;
  }>;

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    color: row.color ?? undefined,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
  }));
}
