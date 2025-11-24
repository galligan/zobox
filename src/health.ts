import fs from "node:fs";
import { logger } from "./logger.js";
import type { Storage } from "./storage.js";
import { parseJson } from "./utils/json.js";

/**
 * Health status response structure
 */
export type HealthStatus = {
  status: "ok" | "degraded" | "down";
  version: string;
  uptime: number;
  checks: {
    database: boolean;
    filesystem: boolean;
  };
};

// Track server start time for uptime calculation
const startTime = Date.now();

/**
 * Get the current package version
 */
function getVersion(): string {
  try {
    // In production, read from package.json
    const text = fs.readFileSync(
      new URL("../package.json", import.meta.url),
      "utf8"
    );
    const packageJson = parseJson(text) as { version?: string };
    return packageJson.version || "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Check if the database is accessible by running a simple query
 */
function checkDatabase(storage: Storage): boolean {
  try {
    // Simple SELECT to verify database connectivity
    const stmt = storage.db.prepare("SELECT 1 as result");
    const result = stmt.get() as { result: number } | undefined;
    return result?.result === 1;
  } catch (err) {
    logger.error(
      "Database health check failed",
      err instanceof Error ? err : new Error(String(err))
    );
    return false;
  }
}

/**
 * Check if critical filesystem directories are accessible
 */
function checkFilesystem(storage: Storage): boolean {
  try {
    // Check if critical directories exist and are accessible
    const criticalDirs = [
      storage.baseDir,
      storage.inboxDir,
      storage.filesDir,
      storage.dbDir,
    ];

    for (const dir of criticalDirs) {
      // Try to access the directory to verify read permissions
      // biome-ignore lint/suspicious/noBitwiseOperators: Node.js fs.constants uses bitwise OR for permissions
      fs.accessSync(dir, fs.constants.R_OK | fs.constants.W_OK);
    }

    return true;
  } catch (err) {
    logger.error(
      "Filesystem health check failed",
      err instanceof Error ? err : new Error(String(err))
    );
    return false;
  }
}

/**
 * Perform a comprehensive health check of the system
 *
 * @param storage - The Storage instance to check
 * @returns HealthStatus with overall status and individual check results
 */
export function checkHealth(storage: Storage): HealthStatus {
  const version = getVersion();
  const uptime = Math.floor((Date.now() - startTime) / 1000);

  // Run both checks
  const databaseOk = checkDatabase(storage);
  const filesystemOk = checkFilesystem(storage);

  // Determine overall status
  let status: "ok" | "degraded" | "down";
  if (databaseOk && filesystemOk) {
    status = "ok";
  } else if (databaseOk || filesystemOk) {
    status = "degraded";
  } else {
    status = "down";
  }

  return {
    status,
    version,
    uptime,
    checks: {
      database: databaseOk,
      filesystem: filesystemOk,
    },
  };
}
