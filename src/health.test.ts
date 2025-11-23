import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkHealth } from "./health.js";
import type { Storage } from "./storage.js";

describe("checkHealth", () => {
  let testDir: string;
  let storage: Storage;

  beforeEach(() => {
    // Create a temporary directory for testing
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "zorter-health-test-"));

    const dbPath = path.join(testDir, "db", "test.db");
    const dbDir = path.dirname(dbPath);
    const inboxDir = path.join(testDir, "inbox");
    const filesDir = path.join(testDir, "files");
    const logsDir = path.join(testDir, "logs");
    const migrationsDir = path.join(dbDir, "migrations");

    // Create directories
    for (const dir of [dbDir, inboxDir, filesDir, logsDir, migrationsDir]) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Initialize database
    const db = new Database(dbPath);
    db.exec(`
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
    `);

    storage = {
      db,
      baseDir: testDir,
      dbPath,
      dbDir,
      inboxDir,
      filesDir,
      logsDir,
      migrationsDir,
    };
  });

  afterEach(() => {
    // Clean up
    if (storage?.db) {
      storage.db.close();
    }
    if (testDir && fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("returns 'ok' status when all checks pass", () => {
    const health = checkHealth(storage);

    expect(health.status).toBe("ok");
    expect(health.checks.database).toBe(true);
    expect(health.checks.filesystem).toBe(true);
    expect(health.version).toBeDefined();
    expect(typeof health.uptime).toBe("number");
    expect(health.uptime).toBeGreaterThanOrEqual(0);
  });

  it("returns 'degraded' status when database fails", () => {
    // Close the database to simulate a failure
    storage.db.close();

    const health = checkHealth(storage);

    expect(health.status).toBe("degraded");
    expect(health.checks.database).toBe(false);
    expect(health.checks.filesystem).toBe(true);
  });

  it("returns 'degraded' status when filesystem check fails", () => {
    // Remove one of the critical directories
    fs.rmSync(storage.inboxDir, { recursive: true, force: true });

    const health = checkHealth(storage);

    expect(health.status).toBe("degraded");
    expect(health.checks.database).toBe(true);
    expect(health.checks.filesystem).toBe(false);
  });

  it("returns 'down' status when both checks fail", () => {
    // Close database and remove directories
    storage.db.close();
    fs.rmSync(storage.inboxDir, { recursive: true, force: true });

    const health = checkHealth(storage);

    expect(health.status).toBe("down");
    expect(health.checks.database).toBe(false);
    expect(health.checks.filesystem).toBe(false);
  });

  it("includes version information", () => {
    const health = checkHealth(storage);

    expect(health.version).toBeDefined();
    expect(typeof health.version).toBe("string");
    // Version should be either from package.json or 'unknown'
    expect(health.version.length).toBeGreaterThan(0);
  });

  it("tracks uptime correctly", async () => {
    const health1 = checkHealth(storage);

    // Wait a bit
    await new Promise((resolve) => setTimeout(resolve, 100));

    const health2 = checkHealth(storage);

    expect(health2.uptime).toBeGreaterThanOrEqual(health1.uptime);
    expect(typeof health2.uptime).toBe("number");
  });

  it("handles database query errors gracefully", () => {
    // Create a mock that throws an error
    const originalPrepare = storage.db.prepare.bind(storage.db);
    storage.db.prepare = vi.fn().mockImplementation(() => {
      throw new Error("Database error");
    });

    const health = checkHealth(storage);

    expect(health.checks.database).toBe(false);
    expect(health.status).toBe("degraded");

    // Restore original
    storage.db.prepare = originalPrepare;
  });

  it("checks all critical directories for filesystem health", () => {
    // This should pass with all directories intact
    const health = checkHealth(storage);
    expect(health.checks.filesystem).toBe(true);

    // Remove base directory
    storage.db.close();
    fs.rmSync(testDir, { recursive: true, force: true });

    const health2 = checkHealth(storage);
    expect(health2.checks.filesystem).toBe(false);
  });
});
