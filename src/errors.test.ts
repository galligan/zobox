import { describe, expect, test } from "vitest";
import {
  AuthenticationError,
  AuthorizationError,
  ConfigurationError,
  getErrorMessage,
  getErrorStack,
  isZorterError,
  RoutingError,
  StorageError,
  ValidationError,
  ZorterError,
} from "./errors.js";

describe("ZorterError", () => {
  test("creates error with message, code, and default status", () => {
    const err = new ZorterError("Something went wrong", "TEST_ERROR");

    expect(err.message).toBe("Something went wrong");
    expect(err.code).toBe("TEST_ERROR");
    expect(err.statusCode).toBe(500);
    expect(err.name).toBe("ZorterError");
  });

  test("creates error with custom status code", () => {
    const err = new ZorterError("Not found", "NOT_FOUND", 404);

    expect(err.statusCode).toBe(404);
  });

  test("maintains proper stack trace", () => {
    const err = new ZorterError("Test", "TEST");

    expect(err.stack).toBeDefined();
    expect(err.stack).toContain("ZorterError");
  });

  test("serializes to JSON correctly", () => {
    const err = new ZorterError("Test error", "TEST_CODE", 400);
    const json = err.toJSON();

    expect(json).toEqual({
      error: "ZorterError",
      code: "TEST_CODE",
      message: "Test error",
    });
  });

  test("instanceof works correctly", () => {
    const err = new ZorterError("Test", "TEST");

    expect(err instanceof Error).toBe(true);
    expect(err instanceof ZorterError).toBe(true);
  });
});

describe("ValidationError", () => {
  test("creates validation error with default code", () => {
    const err = new ValidationError("Invalid input");

    expect(err.message).toBe("Invalid input");
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.statusCode).toBe(400);
    expect(err.name).toBe("ValidationError");
  });

  test("creates validation error with custom code", () => {
    const err = new ValidationError("Missing field", "MISSING_FIELD");

    expect(err.code).toBe("MISSING_FIELD");
    expect(err.statusCode).toBe(400);
  });

  test("instanceof works for inheritance chain", () => {
    const err = new ValidationError("Test");

    expect(err instanceof Error).toBe(true);
    expect(err instanceof ZorterError).toBe(true);
    expect(err instanceof ValidationError).toBe(true);
  });
});

describe("StorageError", () => {
  test("creates storage error with default code", () => {
    const err = new StorageError("Database connection failed");

    expect(err.message).toBe("Database connection failed");
    expect(err.code).toBe("STORAGE_ERROR");
    expect(err.statusCode).toBe(500);
    expect(err.name).toBe("StorageError");
  });

  test("creates storage error with custom code", () => {
    const err = new StorageError("File not found", "FILE_NOT_FOUND");

    expect(err.code).toBe("FILE_NOT_FOUND");
  });
});

describe("AuthenticationError", () => {
  test("creates authentication error with default code", () => {
    const err = new AuthenticationError("Invalid API key");

    expect(err.message).toBe("Invalid API key");
    expect(err.code).toBe("AUTH_ERROR");
    expect(err.statusCode).toBe(401);
    expect(err.name).toBe("AuthenticationError");
  });

  test("creates authentication error with custom code", () => {
    const err = new AuthenticationError("Token expired", "TOKEN_EXPIRED");

    expect(err.code).toBe("TOKEN_EXPIRED");
    expect(err.statusCode).toBe(401);
  });
});

describe("AuthorizationError", () => {
  test("creates authorization error with default code", () => {
    const err = new AuthorizationError("Insufficient permissions");

    expect(err.message).toBe("Insufficient permissions");
    expect(err.code).toBe("AUTHZ_ERROR");
    expect(err.statusCode).toBe(403);
    expect(err.name).toBe("AuthorizationError");
  });

  test("creates authorization error with custom code", () => {
    const err = new AuthorizationError("Admin required", "ADMIN_REQUIRED");

    expect(err.code).toBe("ADMIN_REQUIRED");
    expect(err.statusCode).toBe(403);
  });
});

describe("RoutingError", () => {
  test("creates routing error with default code", () => {
    const err = new RoutingError("Failed to route item");

    expect(err.message).toBe("Failed to route item");
    expect(err.code).toBe("ROUTING_ERROR");
    expect(err.statusCode).toBe(500);
    expect(err.name).toBe("RoutingError");
  });

  test("creates routing error with custom code", () => {
    const err = new RoutingError("Profile not found", "PROFILE_NOT_FOUND");

    expect(err.code).toBe("PROFILE_NOT_FOUND");
  });
});

describe("ConfigurationError", () => {
  test("creates configuration error with default code", () => {
    const err = new ConfigurationError("Invalid TOML syntax");

    expect(err.message).toBe("Invalid TOML syntax");
    expect(err.code).toBe("CONFIG_ERROR");
    expect(err.statusCode).toBe(500);
    expect(err.name).toBe("ConfigurationError");
  });

  test("creates configuration error with custom code", () => {
    const err = new ConfigurationError(
      "Missing required field",
      "MISSING_CONFIG_FIELD"
    );

    expect(err.code).toBe("MISSING_CONFIG_FIELD");
  });
});

describe("isZorterError", () => {
  test("returns true for ZorterError instances", () => {
    expect(isZorterError(new ZorterError("Test", "TEST"))).toBe(true);
    expect(isZorterError(new ValidationError("Test"))).toBe(true);
    expect(isZorterError(new StorageError("Test"))).toBe(true);
    expect(isZorterError(new AuthenticationError("Test"))).toBe(true);
    expect(isZorterError(new AuthorizationError("Test"))).toBe(true);
    expect(isZorterError(new RoutingError("Test"))).toBe(true);
    expect(isZorterError(new ConfigurationError("Test"))).toBe(true);
  });

  test("returns false for non-ZorterError instances", () => {
    expect(isZorterError(new Error("Test"))).toBe(false);
    expect(isZorterError("string")).toBe(false);
    expect(isZorterError(null)).toBe(false);
    expect(isZorterError(undefined)).toBe(false);
    expect(isZorterError({ message: "test" })).toBe(false);
  });
});

describe("getErrorMessage", () => {
  test("extracts message from Error instances", () => {
    const err = new Error("Test error");
    expect(getErrorMessage(err)).toBe("Test error");
  });

  test("extracts message from ZorterError instances", () => {
    const err = new ValidationError("Invalid input");
    expect(getErrorMessage(err)).toBe("Invalid input");
  });

  test("converts non-Error values to strings", () => {
    expect(getErrorMessage("string error")).toBe("string error");
    expect(getErrorMessage(123)).toBe("123");
    expect(getErrorMessage(null)).toBe("null");
    expect(getErrorMessage(undefined)).toBe("undefined");
  });

  test("handles objects without toString", () => {
    expect(getErrorMessage({ code: "TEST" })).toBe("[object Object]");
  });
});

describe("getErrorStack", () => {
  test("extracts stack from Error instances", () => {
    const err = new Error("Test");
    const stack = getErrorStack(err);

    expect(stack).toBeDefined();
    expect(stack).toContain("Error: Test");
  });

  test("extracts stack from ZorterError instances", () => {
    const err = new ValidationError("Test");
    const stack = getErrorStack(err);

    expect(stack).toBeDefined();
    expect(stack).toContain("ValidationError");
  });

  test("returns undefined for non-Error values", () => {
    expect(getErrorStack("string")).toBeUndefined();
    expect(getErrorStack(null)).toBeUndefined();
    expect(getErrorStack(undefined)).toBeUndefined();
    expect(getErrorStack({ message: "test" })).toBeUndefined();
  });
});
