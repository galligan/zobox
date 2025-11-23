/**
 * Structured logger for Zorter service.
 * Outputs JSON-formatted logs with timestamps, levels, and metadata.
 */

import { getErrorMessage, getErrorStack } from "./errors.js";

export type LogLevel = "debug" | "info" | "warn" | "error";

type LogEntry = {
  timestamp: string;
  level: LogLevel;
  message: string;
  meta?: Record<string, unknown>;
  error?: {
    message: string;
    stack?: string;
    code?: string;
    name?: string;
  };
};

/**
 * Get current log level from environment variable.
 * Defaults to "info" in production, "debug" in development.
 */
function getLogLevel(): LogLevel {
  const envLevel = process.env.ZORTER_LOG_LEVEL?.toLowerCase();
  const validLevels: LogLevel[] = ["debug", "info", "warn", "error"];

  if (envLevel && validLevels.includes(envLevel as LogLevel)) {
    return envLevel as LogLevel;
  }

  // Default to debug in dev, info in production
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

/**
 * Map log levels to numeric values for comparison.
 */
const LOG_LEVEL_VALUES: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Check if a log should be emitted based on current log level.
 */
function shouldLog(level: LogLevel): boolean {
  const currentLevel = getLogLevel();
  return LOG_LEVEL_VALUES[level] >= LOG_LEVEL_VALUES[currentLevel];
}

/**
 * Format and emit a log entry.
 */
function emit(entry: LogEntry): void {
  const output = JSON.stringify(entry);

  // Use stderr for warn/error, stdout for debug/info
  if (entry.level === "error" || entry.level === "warn") {
    console.error(output);
  } else {
    console.log(output);
  }
}

/**
 * Build a log entry object.
 */
function buildLogEntry(
  level: LogLevel,
  message: string,
  meta?: Record<string, unknown>,
  error?: Error
): LogEntry {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
  };

  if (meta && Object.keys(meta).length > 0) {
    entry.meta = meta;
  }

  if (error) {
    entry.error = {
      message: getErrorMessage(error),
      stack: getErrorStack(error),
      name: error.name,
    };

    // Include error code if available (ZorterError)
    if ("code" in error && typeof error.code === "string") {
      entry.error.code = error.code;
    }
  }

  return entry;
}

/**
 * Structured logger instance.
 */
export const logger = {
  /**
   * Log debug message (development diagnostics).
   */
  debug: (msg: string, meta?: Record<string, unknown>): void => {
    if (!shouldLog("debug")) {
      return;
    }
    emit(buildLogEntry("debug", msg, meta));
  },

  /**
   * Log info message (normal operations).
   */
  info: (msg: string, meta?: Record<string, unknown>): void => {
    if (!shouldLog("info")) {
      return;
    }
    emit(buildLogEntry("info", msg, meta));
  },

  /**
   * Log warning message (unexpected but handled).
   */
  warn: (msg: string, meta?: Record<string, unknown>): void => {
    if (!shouldLog("warn")) {
      return;
    }
    emit(buildLogEntry("warn", msg, meta));
  },

  /**
   * Log error message (failures, exceptions).
   */
  error: (msg: string, error?: Error, meta?: Record<string, unknown>): void => {
    if (!shouldLog("error")) {
      return;
    }
    emit(buildLogEntry("error", msg, meta, error));
  },
};

/**
 * Create a child logger with pre-populated metadata.
 * Useful for request-scoped logging with correlation IDs.
 */
export function createChildLogger(
  parentMeta: Record<string, unknown>
): typeof logger {
  return {
    debug: (msg: string, meta?: Record<string, unknown>) =>
      logger.debug(msg, { ...parentMeta, ...meta }),
    info: (msg: string, meta?: Record<string, unknown>) =>
      logger.info(msg, { ...parentMeta, ...meta }),
    warn: (msg: string, meta?: Record<string, unknown>) =>
      logger.warn(msg, { ...parentMeta, ...meta }),
    error: (msg: string, error?: Error, meta?: Record<string, unknown>) =>
      logger.error(msg, error, { ...parentMeta, ...meta }),
  };
}
