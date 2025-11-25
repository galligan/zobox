import type { SQLiteDatabase } from "../storage.js";

/**
 * API key entry stored in the database.
 */
export type ApiKeyEntry = {
  id: number;
  name: string;
  keyHash: string;
  keyPrefix: string;
  role: "admin" | "read";
  createdAt: string;
  lastUsedAt: string | null;
  enabled: boolean;
  metadata: Record<string, unknown> | null;
};

/**
 * Result of validating an API key.
 */
export type ValidateKeyResult = {
  valid: boolean;
  role?: "admin" | "read";
  name?: string;
};

/**
 * Generate a cryptographically secure random API key.
 * Format: zk_{32 random hex characters}
 *
 * @returns Generated API key string
 *
 * @example
 * ```typescript
 * const key = generateApiKey();
 * // Returns something like: zk_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
 * ```
 */
export function generateApiKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `zk_${hex}`;
}

/**
 * Hash an API key using SHA-256.
 * Keys are never stored in plaintext - only their hashes.
 *
 * @param key - The plaintext API key to hash
 * @returns SHA-256 hash of the key as hex string
 *
 * @example
 * ```typescript
 * const hash = await hashApiKey('zk_abc123...');
 * // Returns 64-character hex string
 * ```
 */
export async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Extract the prefix from an API key for identification.
 * The prefix is safe to store/display since it doesn't reveal the full key.
 *
 * @param key - The full API key
 * @returns First 8 characters of the key (e.g., "zk_a1b2...")
 */
export function getKeyPrefix(key: string): string {
  return `${key.slice(0, 8)}...`;
}

/**
 * Store an API key in the database.
 * The key is hashed before storage - only the hash is persisted.
 *
 * @param db - SQLite database instance
 * @param name - Unique name for this key (e.g., 'admin', 'read')
 * @param key - The plaintext API key to store (will be hashed)
 * @param role - Role for this key ('admin' or 'read')
 * @returns The stored key entry (without the plaintext key)
 *
 * @example
 * ```typescript
 * const key = generateApiKey();
 * const entry = await storeApiKey(db, 'admin', key, 'admin');
 * console.log(`Key stored: ${entry.keyPrefix}`);
 * ```
 */
export async function storeApiKey(
  db: SQLiteDatabase,
  name: string,
  key: string,
  role: "admin" | "read"
): Promise<ApiKeyEntry> {
  const keyHash = await hashApiKey(key);
  const keyPrefix = getKeyPrefix(key);
  const createdAt = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO api_keys (
      name, key_hash, key_prefix, role, created_at, enabled
    ) VALUES (
      $name, $keyHash, $keyPrefix, $role, $createdAt, 1
    )
  `);

  stmt.run({
    $name: name,
    $keyHash: keyHash,
    $keyPrefix: keyPrefix,
    $role: role,
    $createdAt: createdAt,
  });

  // Retrieve the inserted row
  const selectStmt = db.prepare("SELECT * FROM api_keys WHERE name = $name");
  const row = selectStmt.get({ $name: name }) as {
    id: number;
    name: string;
    key_hash: string;
    key_prefix: string;
    role: string;
    created_at: string;
    last_used_at: string | null;
    enabled: number;
    metadata: string | null;
  };

  return {
    id: row.id,
    name: row.name,
    keyHash: row.key_hash,
    keyPrefix: row.key_prefix,
    role: row.role as "admin" | "read",
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    enabled: !!row.enabled,
    metadata: row.metadata ? JSON.parse(row.metadata) : null,
  };
}

/**
 * Validate an API key against stored hashes.
 * Returns the role if valid, or invalid result if not found/disabled.
 *
 * @param db - SQLite database instance
 * @param key - The plaintext API key to validate
 * @returns Validation result with role if valid
 *
 * @example
 * ```typescript
 * const result = await validateApiKey(db, 'zk_abc123...');
 * if (result.valid) {
 *   console.log(`Valid ${result.role} key: ${result.name}`);
 * }
 * ```
 */
export async function validateApiKey(
  db: SQLiteDatabase,
  key: string
): Promise<ValidateKeyResult> {
  const keyHash = await hashApiKey(key);

  const stmt = db.prepare(`
    SELECT name, role, enabled FROM api_keys
    WHERE key_hash = $keyHash
  `);

  const row = stmt.get({ $keyHash: keyHash }) as {
    name: string;
    role: string;
    enabled: number;
  } | null;

  if (!row) {
    return { valid: false };
  }

  if (!row.enabled) {
    return { valid: false };
  }

  // Update last_used_at
  const updateStmt = db.prepare(`
    UPDATE api_keys SET last_used_at = $now WHERE key_hash = $keyHash
  `);
  updateStmt.run({ $keyHash: keyHash, $now: new Date().toISOString() });

  return {
    valid: true,
    role: row.role as "admin" | "read",
    name: row.name,
  };
}

/**
 * Check if any API keys exist in the database.
 * Used to determine if keys need to be generated during init.
 *
 * @param db - SQLite database instance
 * @returns true if at least one key exists
 */
export function hasApiKeys(db: SQLiteDatabase): boolean {
  const stmt = db.prepare("SELECT COUNT(*) as count FROM api_keys");
  const row = stmt.get() as { count: number };
  return row.count > 0;
}

/**
 * Get an API key entry by name (without the hash/key).
 * Useful for checking if a specific key exists.
 *
 * @param db - SQLite database instance
 * @param name - Name of the key to retrieve
 * @returns Key entry or null if not found
 */
export function getApiKeyByName(
  db: SQLiteDatabase,
  name: string
): ApiKeyEntry | null {
  const stmt = db.prepare("SELECT * FROM api_keys WHERE name = $name");
  const row = stmt.get({ $name: name }) as {
    id: number;
    name: string;
    key_hash: string;
    key_prefix: string;
    role: string;
    created_at: string;
    last_used_at: string | null;
    enabled: number;
    metadata: string | null;
  } | null;

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    keyHash: row.key_hash,
    keyPrefix: row.key_prefix,
    role: row.role as "admin" | "read",
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    enabled: !!row.enabled,
    metadata: row.metadata ? JSON.parse(row.metadata) : null,
  };
}

/**
 * List all API keys (without exposing hashes).
 *
 * @param db - SQLite database instance
 * @returns Array of key entries
 */
export function listApiKeys(db: SQLiteDatabase): ApiKeyEntry[] {
  const stmt = db.prepare("SELECT * FROM api_keys ORDER BY created_at ASC");
  const rows = stmt.all() as {
    id: number;
    name: string;
    key_hash: string;
    key_prefix: string;
    role: string;
    created_at: string;
    last_used_at: string | null;
    enabled: number;
    metadata: string | null;
  }[];

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    keyHash: row.key_hash,
    keyPrefix: row.key_prefix,
    role: row.role as "admin" | "read",
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    enabled: !!row.enabled,
    metadata: row.metadata ? JSON.parse(row.metadata) : null,
  }));
}

/**
 * Disable an API key without deleting it.
 *
 * @param db - SQLite database instance
 * @param name - Name of the key to disable
 * @returns true if key was found and disabled
 */
export function disableApiKey(db: SQLiteDatabase, name: string): boolean {
  const stmt = db.prepare("UPDATE api_keys SET enabled = 0 WHERE name = $name");
  const result = stmt.run({ $name: name });
  return result.changes > 0;
}

/**
 * Delete an API key permanently.
 *
 * @param db - SQLite database instance
 * @param name - Name of the key to delete
 * @returns true if key was found and deleted
 */
export function deleteApiKey(db: SQLiteDatabase, name: string): boolean {
  const stmt = db.prepare("DELETE FROM api_keys WHERE name = $name");
  const result = stmt.run({ $name: name });
  return result.changes > 0;
}
