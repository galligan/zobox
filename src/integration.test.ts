import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  AuthenticationError,
  isZorterError,
  ValidationError,
} from "./errors.js";
import { createChildLogger, logger } from "./logger.js";

describe("Error handling and logging integration", () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {
      // Mock implementation
    });
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {
      // Mock implementation
    });
    originalEnv = { ...process.env };
    process.env.ZOBOX_LOG_LEVEL = "debug";
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    process.env = originalEnv;
  });

  test("ValidationError logs with proper structure", () => {
    const error = new ValidationError(
      "Missing required field",
      "MISSING_FIELD"
    );

    logger.error("Validation failed", error, { field: "email" });

    expect(consoleErrorSpy).toHaveBeenCalledOnce();
    const output = JSON.parse(consoleErrorSpy.mock.calls[0][0] as string);

    expect(output.level).toBe("error");
    expect(output.message).toBe("Validation failed");
    expect(output.meta.field).toBe("email");
    expect(output.error.code).toBe("MISSING_FIELD");
    expect(output.error.name).toBe("ValidationError");
    expect(output.error.message).toBe("Missing required field");
  });

  test("AuthenticationError includes status code", () => {
    const error = new AuthenticationError("Invalid token", "TOKEN_INVALID");

    expect(error.statusCode).toBe(401);
    expect(error.code).toBe("TOKEN_INVALID");
    expect(isZorterError(error)).toBe(true);
  });

  test("Error JSON serialization works correctly", () => {
    const error = new ValidationError("Test error", "TEST_CODE");
    const json = error.toJSON();

    expect(json).toEqual({
      error: "ValidationError",
      code: "TEST_CODE",
      message: "Test error",
    });
  });

  test("Logger handles non-Error objects gracefully", () => {
    logger.error("Something went wrong", new Error("Test"));

    expect(consoleErrorSpy).toHaveBeenCalledOnce();
    const output = JSON.parse(consoleErrorSpy.mock.calls[0][0] as string);

    expect(output.error.message).toBe("Test");
    expect(output.error.stack).toBeDefined();
  });

  test("Child logger preserves parent metadata", () => {
    const child = createChildLogger({ requestId: "req-123" });

    child.info("Processing", { action: "create" });

    const output = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);

    expect(output.meta.requestId).toBe("req-123");
    expect(output.meta.action).toBe("create");
  });

  test("Multiple errors can be logged with context", () => {
    const errors = [
      new ValidationError("Invalid email", "INVALID_EMAIL"),
      new ValidationError("Invalid phone", "INVALID_PHONE"),
    ];

    for (const err of errors) {
      logger.error("Validation failed", err, { itemId: "123" });
    }

    expect(consoleErrorSpy).toHaveBeenCalledTimes(2);

    const output1 = JSON.parse(consoleErrorSpy.mock.calls[0][0] as string);
    const output2 = JSON.parse(consoleErrorSpy.mock.calls[1][0] as string);

    expect(output1.error.code).toBe("INVALID_EMAIL");
    expect(output2.error.code).toBe("INVALID_PHONE");
    expect(output1.meta.itemId).toBe("123");
    expect(output2.meta.itemId).toBe("123");
  });
});
