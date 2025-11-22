import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import type {
  ZorterConfig,
  ItemEnvelope,
  ItemIndexRow,
  ItemView,
  ItemFilters,
  QueryItemsResult,
} from './types';

export type SQLiteDatabase = Database;

export interface Storage {
  db: SQLiteDatabase;
  baseDir: string;
  dbPath: string;
  dbDir: string;
  inboxDir: string;
  filesDir: string;
  logsDir: string;
  migrationsDir: string;
}

export function initStorage(config: ZorterConfig): Storage {
  const baseDir = config.zorter.base_dir || '/home/workspace/Inbox';
  const dbPath =
    config.zorter.db_path || path.join(baseDir, 'db', 'zorter.db');
  const dbDir = path.dirname(dbPath);
  const inboxDir = path.join(baseDir, 'inbox');
  const filesDir =
    config.files.base_files_dir || path.join(baseDir, 'files');
  const logsDir = path.join(baseDir, 'logs');
  const migrationsDir = path.join(baseDir, 'db', 'migrations');

  [baseDir, dbDir, inboxDir, filesDir, logsDir, migrationsDir].forEach(
    (dir) => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    },
  );

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

function ensureInitMigrationFile(migrationsDir: string) {
  const initPath = path.join(migrationsDir, '001_init.sql');
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
  claimed_by TEXT,
  claimed_at TEXT,
  summary TEXT
);

CREATE INDEX IF NOT EXISTS idx_items_created_at ON items (created_at);
CREATE INDEX IF NOT EXISTS idx_items_type ON items (type);
CREATE INDEX IF NOT EXISTS idx_items_channel ON items (channel);
CREATE INDEX IF NOT EXISTS idx_items_has_attachments ON items (has_attachments);
`.trimStart();
    fs.writeFileSync(initPath, sql, 'utf8');
  }
}

function runMigrations(db: SQLiteDatabase, migrationsDir: string) {
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    db.exec(sql);
  }
}

export function writeEnvelope(
  storage: Storage,
  envelope: ItemEnvelope,
): string {
  const createdDate = envelope.createdAt.slice(0, 10);
  const dir = path.join(storage.inboxDir, createdDate);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const filePath = path.join(dir, `${envelope.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(envelope, null, 2), 'utf8');
  return filePath;
}

export function insertItemIndex(
  storage: Storage,
  index: ItemIndexRow,
): void {
  const stmt = storage.db.prepare(
    `
INSERT OR REPLACE INTO items (
  id,
  type,
  channel,
  created_at,
  file_path,
  file_dir,
  attachments_count,
  has_attachments,
  claimed_by,
  claimed_at,
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
  @claimedBy,
  @claimedAt,
  @summary
)
`,
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
    claimedBy: index.claimedBy ?? null,
    claimedAt: index.claimedAt ?? null,
    summary: index.summary ?? null,
  });
}

function encodeCursor(offset: number): string {
  return Buffer.from(String(offset), 'utf8').toString('base64');
}

function decodeCursor(cursor?: string | null): number {
  if (!cursor) return 0;
  try {
    const s = Buffer.from(cursor, 'base64').toString('utf8');
    const n = Number.parseInt(s, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function queryItems(
  storage: Storage,
  filters: ItemFilters,
  limit: number,
  cursor?: string | null,
): QueryItemsResult {
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  const offset = decodeCursor(cursor);

  let sql =
    'SELECT id, type, channel, created_at, has_attachments, attachments_count FROM items WHERE 1=1';
  const params: Record<string, unknown> = {};

  if (filters.type) {
    sql += ' AND type = @type';
    params.type = filters.type;
  }
  if (filters.channel) {
    sql += ' AND channel = @channel';
    params.channel = filters.channel;
  }
  if (filters.since) {
    sql += ' AND created_at >= @since';
    params.since = filters.since;
  }
  if (filters.until) {
    sql += ' AND created_at <= @until';
    params.until = filters.until;
  }

  sql += ' ORDER BY created_at DESC, id DESC';
  sql += ' LIMIT @limit OFFSET @offset';
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

  const items: ItemView[] = rows.map((row) => ({
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

export function getItemEnvelope(
  storage: Storage,
  id: string,
): ItemEnvelope | null {
  const stmt = storage.db.prepare(
    'SELECT file_path FROM items WHERE id = @id',
  );
  const row = stmt.get({ id }) as { file_path: string } | undefined;
  if (!row) return null;
  const text = fs.readFileSync(row.file_path, 'utf8');
  return JSON.parse(text) as ItemEnvelope;
}

export function findUnclaimedItems(
  storage: Storage,
  filters: ItemFilters,
  limit: number,
): ItemEnvelope[] {
  const safeLimit = Math.min(Math.max(limit, 1), 50);

  let sql =
    'SELECT id, file_path FROM items WHERE claimed_by IS NULL';
  const params: Record<string, unknown> = {};

  if (filters.type) {
    sql += ' AND type = @type';
    params.type = filters.type;
  }
  if (filters.channel) {
    sql += ' AND channel = @channel';
    params.channel = filters.channel;
  }

  sql += ' ORDER BY created_at ASC, id ASC';
  sql += ' LIMIT @limit';
  params.limit = safeLimit;

  const stmt = storage.db.prepare(sql);
  const rows = stmt.all(params) as {
    id: string;
    file_path: string;
  }[];

  const items: ItemEnvelope[] = [];
  for (const row of rows) {
    const text = fs.readFileSync(row.file_path, 'utf8');
    items.push(JSON.parse(text) as ItemEnvelope);
  }
  return items;
}

export function ackItem(
  storage: Storage,
  id: string,
  consumer: string,
): boolean {
  const now = new Date().toISOString();
  const stmt = storage.db.prepare(
    `
UPDATE items
SET claimed_by = @consumer,
    claimed_at = @claimedAt
WHERE id = @id
  AND (claimed_by IS NULL OR claimed_by = @consumer)
`,
  );
  const result = stmt.run({ id, consumer, claimedAt: now });
  return result.changes > 0;
}
