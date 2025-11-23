/**
 * Error hierarchy for Zorter service.
 * Provides actionable errors with HTTP status codes and error codes for debugging.
 */

/**
 * Base error class for all Zorter errors.
 * Includes error code and HTTP status code for structured error handling.
 */
export class ZorterError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(message: string, code: string, statusCode = 500) {
    super(message);
    this.name = "ZorterError";
    this.code = code;
    this.statusCode = statusCode;

    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Serialize error for JSON responses.
   */
  toJSON(): {
    error: string;
    code: string;
    message: string;
  } {
    return {
      error: this.name,
      code: this.code,
      message: this.message,
    };
  }
}

/**
 * Validation errors (invalid input, schema violations, etc.)
 */
export class ValidationError extends ZorterError {
  constructor(message: string, code = "VALIDATION_ERROR") {
    super(message, code, 400);
    this.name = "ValidationError";
  }
}

/**
 * Storage errors (filesystem, database, etc.)
 */
export class StorageError extends ZorterError {
  constructor(message: string, code = "STORAGE_ERROR") {
    super(message, code, 500);
    this.name = "StorageError";
  }
}

/**
 * Authentication errors (missing/invalid credentials)
 */
export class AuthenticationError extends ZorterError {
  constructor(message: string, code = "AUTH_ERROR") {
    super(message, code, 401);
    this.name = "AuthenticationError";
  }
}

/**
 * Authorization errors (insufficient permissions)
 */
export class AuthorizationError extends ZorterError {
  constructor(message: string, code = "AUTHZ_ERROR") {
    super(message, code, 403);
    this.name = "AuthorizationError";
  }
}

/**
 * Routing errors (workflow routing, HTTP routing)
 */
export class RoutingError extends ZorterError {
  constructor(message: string, code = "ROUTING_ERROR") {
    super(message, code, 500);
    this.name = "RoutingError";
  }
}

/**
 * Configuration errors (invalid config, missing required settings)
 */
export class ConfigurationError extends ZorterError {
  constructor(message: string, code = "CONFIG_ERROR") {
    super(message, code, 500);
    this.name = "ConfigurationError";
  }
}

/**
 * Type guard to check if an error is a ZorterError.
 */
export function isZorterError(error: unknown): error is ZorterError {
  return error instanceof ZorterError;
}

/**
 * Extract error message from unknown error type.
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Extract stack trace from error, if available.
 */
export function getErrorStack(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.stack;
  }
  return;
}
