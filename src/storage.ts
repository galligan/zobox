import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { MessageEnvelopeSchema } from "./schemas.js";
import type {
  MessageEnvelope,
  MessageFilters,
  MessageIndexRow,
  MessageView,
  QueryMessagesResult,
  ZoboxConfig,
} from "./types";
import { parseJsonAs } from "./utils/json.js";

/**
 * SQLite database instance type from better-sqlite3.
 */
export type SQLiteDatabase = ReturnType<typeof Database>;

/**
 * Storage context containing database connection and filesystem paths.
 * Provides centralized access to all storage locations used by Zorter.
 */
export type Storage = {
  /** SQLite database instance */
  db: SQLiteDatabase;
  /** Base directory for all Zorter data */
  baseDir: string;
  /** Path to SQLite database file */
  dbPath: string;
  /** Directory containing database file */
  dbDir: string;
  /** Directory for item envelope JSON files */
  inboxDir: string;
  /** Directory for attachment files */
  filesDir: string;
  /** Directory for log files */
  logsDir: string;
  /** Directory for SQL migration files */
  migrationsDir: string;
};

/**
 * Initialize storage system from configuration.
 * Creates all required directories, ensures migration files exist, runs migrations,
 * and returns a Storage context for use throughout the application.
 *
 * @param config - Validated Zorter configuration
 * @returns Storage context with database connection and filesystem paths
 *
 * @example
 * ```typescript
 * const config = loadConfig('/home/workspace/Inbox');
 * const storage = initStorage(config);
 * // storage.db is ready for queries
 * // All directories are created and migrations applied
 * ```
 */
export function initStorage(config: ZoboxConfig): Storage {
  const baseDir = config.zobox.base_dir || "/home/workspace/Inbox";
  const dbPath = config.zobox.db_path || path.join(baseDir, "db", "zobox.db");
  const dbDir = path.dirname(dbPath);
  const inboxDir = path.join(baseDir, "inbox");
  const filesDir = config.files.base_files_dir || path.join(baseDir, "files");
  const logsDir = path.join(baseDir, "logs");
  const migrationsDir = path.join(baseDir, "db", "migrations");

  for (const dir of [
    baseDir,
    dbDir,
    inboxDir,
    filesDir,
    logsDir,
    migrationsDir,
  ]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  ensureInitMigrationFile(migrationsDir);

  const db = new Database(dbPath);
  runMigrations(db, migrationsDir);

  return {
    db,
    baseDir,
    dbPath,
    dbDir,
    inboxDir,
    filesDir,
    logsDir,
    migrationsDir,
  };
}

/**
 * Ensure initial migration file exists.
 * Creates 001_init.sql with schema if it doesn't exist.
 */
function ensureInitMigrationFile(migrationsDir: string) {
  const initPath = path.join(migrationsDir, "001_init.sql");
  if (!fs.existsSync(initPath)) {
    const sql = `
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
  subscribed_by TEXT,
  subscribed_at TEXT,
  summary TEXT
);

CREATE INDEX IF NOT EXISTS idx_messages_created_at ON items (created_at);
CREATE INDEX IF NOT EXISTS idx_messages_type ON items (type);
CREATE INDEX IF NOT EXISTS idx_messages_channel ON items (channel);
CREATE INDEX IF NOT EXISTS idx_messages_has_attachments ON items (has_attachments);
`.trimStart();
    fs.writeFileSync(initPath, sql, "utf8");
  }
}

/**
 * Run all SQL migration files in alphabetical order.
 * Executes all .sql files found in the migrations directory.
 */
function runMigrations(db: SQLiteDatabase, migrationsDir: string) {
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    db.exec(sql);
  }
}

/**
 * Write item envelope to filesystem as JSON.
 * Envelopes are stored in dated subdirectories under inbox/, organized by creation date.
 *
 * @param storage - Storage context
 * @param envelope - Item envelope to persist
 * @returns Absolute path to the written JSON file
 *
 * @example
 * ```typescript
 * const envelope: MessageEnvelope = {
 *   id: crypto.randomUUID(),
 *   type: 'note',
 *   channel: 'Inbox',
 *   payload: { text: 'Hello' },
 *   attachments: [],
 *   createdAt: new Date().toISOString(),
 *   source: 'api'
 * };
 * const filePath = writeEnvelope(storage, envelope);
 * // filePath: /home/workspace/Inbox/inbox/2025-11-22/{id}.json
 * ```
 */
export function writeEnvelope(
  storage: Storage,
  envelope: MessageEnvelope
): string {
  const createdDate = envelope.createdAt.slice(0, 10);
  const dir = path.join(storage.inboxDir, createdDate);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const filePath = path.join(dir, `${envelope.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(envelope, null, 2), "utf8");
  return filePath;
}

/**
 * Insert or replace item index row in SQLite.
 * The index enables fast querying and filtering of items without reading full envelopes.
 *
 * @param storage - Storage context
 * @param index - Item index row containing metadata for fast queries
 *
 * @example
 * ```typescript
 * const index: MessageIndexRow = {
 *   id: envelope.id,
 *   type: envelope.type,
 *   channel: envelope.channel,
 *   createdAt: envelope.createdAt,
 *   filePath: '/path/to/envelope.json',
 *   fileDir: '/path/to/attachments',
 *   attachmentsCount: 2,
 *   hasAttachments: true,
 *   subscribedBy: null,
 *   subscribedAt: null,
 *   summary: null
 * };
 * insertMessageIndex(storage, index);
 * ```
 */
export function insertMessageIndex(
  storage: Storage,
  index: MessageIndexRow
): void {
  const stmt = storage.db.prepare(
    `
INSERT OR REPLACE INTO messages (
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
) VALUES (
  @id,
  @type,
  @channel,
  @createdAt,
  @filePath,
  @fileDir,
  @attachmentsCount,
  @hasAttachments,
  @subscribedBy,
  @subscribedAt,
  @summary
)
`
  );
  stmt.run({
    id: index.id,
    type: index.type,
    channel: index.channel,
    createdAt: index.createdAt,
    filePath: index.filePath,
    fileDir: index.fileDir,
    attachmentsCount: index.attachmentsCount,
    hasAttachments: index.hasAttachments ? 1 : 0,
    subscribedBy: index.subscribedBy ?? null,
    subscribedAt: index.subscribedAt ?? null,
    summary: index.summary ?? null,
  });
}

/**
 * Encode pagination offset as base64 cursor.
 */
function encodeCursor(offset: number): string {
  return Buffer.from(String(offset), "utf8").toString("base64");
}

/**
 * Decode base64 cursor to pagination offset.
 * Returns 0 for invalid or missing cursors.
 */
function decodeCursor(cursor?: string | null): number {
  if (!cursor) {
    return 0;
  }
  try {
    const s = Buffer.from(cursor, "base64").toString("utf8");
    const n = Number.parseInt(s, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

/**
 * Query items with filtering, pagination, and cursor-based navigation.
 * Returns item metadata views without full envelope payloads for efficient listing.
 *
 * @param storage - Storage context
 * @param filters - Filters to apply (type, channel, time range)
 * @param limit - Maximum items to return (clamped to 1-100)
 * @param cursor - Optional pagination cursor from previous query
 * @returns Query result with items and next cursor (if more results exist)
 *
 * @example
 * ```typescript
 * // First page
 * const result = queryMessages(storage, { type: 'note' }, 20);
 * console.log(result.items.length); // up to 20
 *
 * // Next page
 * if (result.nextCursor) {
 *   const next = queryMessages(storage, { type: 'note' }, 20, result.nextCursor);
 * }
 * ```
 */
export function queryMessages(
  storage: Storage,
  filters: MessageFilters,
  limit: number,
  cursor?: string | null
): QueryMessagesResult {
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  const offset = decodeCursor(cursor);

  let sql =
    "SELECT id, type, channel, created_at, has_attachments, attachments_count FROM messages WHERE 1=1";
  const params: Record<string, unknown> = {};

  if (filters.type) {
    sql += " AND type = @type";
    params.type = filters.type;
  }
  if (filters.channel) {
    sql += " AND channel = @channel";
    params.channel = filters.channel;
  }
  if (filters.since) {
    sql += " AND created_at >= @since";
    params.since = filters.since;
  }
  if (filters.until) {
    sql += " AND created_at <= @until";
    params.until = filters.until;
  }

  sql += " ORDER BY created_at DESC, id DESC";
  sql += " LIMIT @limit OFFSET @offset";
  params.limit = safeLimit;
  params.offset = offset;

  const stmt = storage.db.prepare(sql);
  const rows = stmt.all(params) as {
    id: string;
    type: string;
    channel: string;
    created_at: string;
    has_attachments: number;
    attachments_count: number;
  }[];

  const items: MessageView[] = rows.map((row) => ({
    id: row.id,
    type: row.type,
    channel: row.channel,
    createdAt: row.created_at,
    hasAttachments: !!row.has_attachments,
    attachmentsCount: row.attachments_count,
  }));

  const nextOffset = offset + items.length;
  const nextCursor =
    items.length === safeLimit ? encodeCursor(nextOffset) : null;

  return { items, nextCursor };
}

/**
 * Retrieve complete item envelope by ID.
 * Reads the envelope JSON file from disk and validates it.
 *
 * @param storage - Storage context
 * @param id - Item ID to retrieve
 * @returns Full item envelope or null if not found
 * @throws {Error} If envelope file is malformed or fails validation
 *
 * @example
 * ```typescript
 * const envelope = getMessageEnvelope(storage, 'some-uuid');
 * if (envelope) {
 *   console.log(envelope.payload);
 *   console.log(envelope.attachments);
 * }
 * ```
 */
export function getMessageEnvelope(
  storage: Storage,
  id: string
): MessageEnvelope | null {
  const stmt = storage.db.prepare(
    "SELECT file_path FROM messages WHERE id = @id"
  );
  const row = stmt.get({ id }) as { file_path: string } | undefined;
  if (!row) {
    return null;
  }
  const text = fs.readFileSync(row.file_path, "utf8");
  return parseJsonAs(text, MessageEnvelopeSchema);
}

/**
 * Find unclaimed items available for consumer acknowledgement.
 * Used by the /items/next endpoint to implement work queue patterns.
 * Returns oldest items first to ensure FIFO processing.
 *
 * @param storage - Storage context
 * @param filters - Filters to apply (type, channel)
 * @param limit - Maximum items to return (clamped to 1-50)
 * @returns Array of unclaimed item envelopes
 *
 * @example
 * ```typescript
 * // Get next unclaimed notes
 * const items = findUnclaimedMessages(storage, { type: 'note' }, 10);
 * for (const item of items) {
 *   // Process and acknowledge
 *   ackMessage(storage, item.id, 'worker-1');
 * }
 * ```
 */
export function findUnclaimedMessages(
  storage: Storage,
  filters: MessageFilters,
  limit: number
): MessageEnvelope[] {
  const safeLimit = Math.min(Math.max(limit, 1), 50);

  let sql = "SELECT id, file_path FROM messages WHERE subscribed_by IS NULL";
  const params: Record<string, unknown> = {};

  if (filters.type) {
    sql += " AND type = @type";
    params.type = filters.type;
  }
  if (filters.channel) {
    sql += " AND channel = @channel";
    params.channel = filters.channel;
  }

  sql += " ORDER BY created_at ASC, id ASC";
  sql += " LIMIT @limit";
  params.limit = safeLimit;

  const stmt = storage.db.prepare(sql);
  const rows = stmt.all(params) as {
    id: string;
    file_path: string;
  }[];

  const items: MessageEnvelope[] = [];
  for (const row of rows) {
    const text = fs.readFileSync(row.file_path, "utf8");
    items.push(parseJsonAs(text, MessageEnvelopeSchema));
  }
  return items;
}

/**
 * Acknowledge (claim) an item for a specific consumer.
 * Implements optimistic concurrency control - only succeeds if item is unclaimed
 * or already claimed by the same consumer (idempotent).
 *
 * @param storage - Storage context
 * @param id - Item ID to acknowledge
 * @param consumer - Consumer identifier claiming the item
 * @returns true if acknowledgement succeeded, false if item was already claimed by another consumer
 *
 * @example
 * ```typescript
 * const items = findUnclaimedMessages(storage, {}, 1);
 * if (items.length > 0) {
 *   const claimed = ackMessage(storage, items[0].id, 'worker-1');
 *   if (claimed) {
 *     // Process the item
 *   } else {
 *     // Another consumer got it first
 *   }
 * }
 * ```
 */
export function ackMessage(
  storage: Storage,
  id: string,
  consumer: string
): boolean {
  const now = new Date().toISOString();
  const stmt = storage.db.prepare(
    `
UPDATE messages
SET subscribed_by = @consumer,
    subscribed_at = @subscribedAt
WHERE id = @id
  AND (subscribed_by IS NULL OR subscribed_by = @consumer)
`
  );
  const result = stmt.run({ id, consumer, subscribedAt: now });
  return result.changes > 0;
}
