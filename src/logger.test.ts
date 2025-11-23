import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ValidationError } from "./errors.js";
import { createChildLogger, logger } from "./logger.js";

// Test regex patterns (moved to top level for performance)
const ISO_TIMESTAMP_REGEX = /^\d{4}-\d{2}-\d{2}T/;

describe("logger", () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Spy on console methods
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {
      // Mock implementation
    });
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {
      // Mock implementation
    });

    // Save original environment
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore console and environment
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    process.env = originalEnv;
  });

  describe("debug", () => {
    test("logs debug message with timestamp and level", () => {
      process.env.ZOBOX_LOG_LEVEL = "debug";

      logger.debug("Test debug message");

      expect(consoleLogSpy).toHaveBeenCalledOnce();
      const output = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);

      expect(output.level).toBe("debug");
      expect(output.message).toBe("Test debug message");
      expect(output.timestamp).toMatch(ISO_TIMESTAMP_REGEX);
    });

    test("includes metadata when provided", () => {
      process.env.ZOBOX_LOG_LEVEL = "debug";

      logger.debug("Debug with meta", { userId: "123", action: "test" });

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);

      expect(output.meta).toEqual({ userId: "123", action: "test" });
    });

    test("does not log when level is info", () => {
      process.env.ZOBOX_LOG_LEVEL = "info";

      logger.debug("Should not appear");

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    test("does not include meta field when empty", () => {
      process.env.ZOBOX_LOG_LEVEL = "debug";

      logger.debug("No meta");

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);

      expect(output.meta).toBeUndefined();
    });
  });

  describe("info", () => {
    test("logs info message with timestamp and level", () => {
      process.env.ZOBOX_LOG_LEVEL = "info";

      logger.info("Test info message");

      expect(consoleLogSpy).toHaveBeenCalledOnce();
      const output = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);

      expect(output.level).toBe("info");
      expect(output.message).toBe("Test info message");
      expect(output.timestamp).toMatch(ISO_TIMESTAMP_REGEX);
    });

    test("includes metadata when provided", () => {
      process.env.ZOBOX_LOG_LEVEL = "info";

      logger.info("Info with meta", { requestId: "req-123" });

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);

      expect(output.meta).toEqual({ requestId: "req-123" });
    });

    test("does not log when level is warn", () => {
      process.env.ZOBOX_LOG_LEVEL = "warn";

      logger.info("Should not appear");

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });

  describe("warn", () => {
    test("logs warning message to stderr", () => {
      process.env.ZOBOX_LOG_LEVEL = "warn";

      logger.warn("Test warning");

      expect(consoleErrorSpy).toHaveBeenCalledOnce();
      expect(consoleLogSpy).not.toHaveBeenCalled();

      const output = JSON.parse(consoleErrorSpy.mock.calls[0][0] as string);

      expect(output.level).toBe("warn");
      expect(output.message).toBe("Test warning");
    });

    test("includes metadata when provided", () => {
      process.env.ZOBOX_LOG_LEVEL = "warn";

      logger.warn("Warning with context", { route: "/items" });

      const output = JSON.parse(consoleErrorSpy.mock.calls[0][0] as string);

      expect(output.meta).toEqual({ route: "/items" });
    });

    test("does not log when level is error", () => {
      process.env.ZOBOX_LOG_LEVEL = "error";

      logger.warn("Should not appear");

      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe("error", () => {
    test("logs error message to stderr", () => {
      process.env.ZOBOX_LOG_LEVEL = "error";

      logger.error("Test error");

      expect(consoleErrorSpy).toHaveBeenCalledOnce();
      expect(consoleLogSpy).not.toHaveBeenCalled();

      const output = JSON.parse(consoleErrorSpy.mock.calls[0][0] as string);

      expect(output.level).toBe("error");
      expect(output.message).toBe("Test error");
    });

    test("includes error details when Error is provided", () => {
      process.env.ZOBOX_LOG_LEVEL = "error";
      const err = new Error("Something failed");

      logger.error("Operation failed", err);

      const output = JSON.parse(consoleErrorSpy.mock.calls[0][0] as string);

      expect(output.error).toBeDefined();
      expect(output.error.message).toBe("Something failed");
      expect(output.error.name).toBe("Error");
      expect(output.error.stack).toContain("Error: Something failed");
    });

    test("includes error code for ZorterError instances", () => {
      process.env.ZOBOX_LOG_LEVEL = "error";
      const err = new ValidationError("Invalid input", "INVALID_TYPE");

      logger.error("Validation failed", err);

      const output = JSON.parse(consoleErrorSpy.mock.calls[0][0] as string);

      expect(output.error.code).toBe("INVALID_TYPE");
      expect(output.error.name).toBe("ValidationError");
    });

    test("includes both error and metadata", () => {
      process.env.ZOBOX_LOG_LEVEL = "error";
      const err = new Error("Test error");

      logger.error("Failed", err, { context: "test" });

      const output = JSON.parse(consoleErrorSpy.mock.calls[0][0] as string);

      expect(output.error).toBeDefined();
      expect(output.meta).toEqual({ context: "test" });
    });
  });

  describe("log level filtering", () => {
    test("debug logs everything", () => {
      process.env.ZOBOX_LOG_LEVEL = "debug";

      logger.debug("debug");
      logger.info("info");
      logger.warn("warn");
      logger.error("error");

      expect(consoleLogSpy).toHaveBeenCalledTimes(2); // debug, info
      expect(consoleErrorSpy).toHaveBeenCalledTimes(2); // warn, error
    });

    test("info skips debug", () => {
      process.env.ZOBOX_LOG_LEVEL = "info";

      logger.debug("debug");
      logger.info("info");
      logger.warn("warn");
      logger.error("error");

      expect(consoleLogSpy).toHaveBeenCalledTimes(1); // info only
      expect(consoleErrorSpy).toHaveBeenCalledTimes(2); // warn, error
    });

    test("warn skips debug and info", () => {
      process.env.ZOBOX_LOG_LEVEL = "warn";

      logger.debug("debug");
      logger.info("info");
      logger.warn("warn");
      logger.error("error");

      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledTimes(2); // warn, error
    });

    test("error only logs errors", () => {
      process.env.ZOBOX_LOG_LEVEL = "error";

      logger.debug("debug");
      logger.info("info");
      logger.warn("warn");
      logger.error("error");

      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1); // error only
    });

    test("defaults to debug in development", () => {
      process.env.NODE_ENV = "development";
      process.env.ZOBOX_LOG_LEVEL = undefined;

      logger.debug("Should appear");

      expect(consoleLogSpy).toHaveBeenCalled();
    });

    test("defaults to info in production", () => {
      process.env.NODE_ENV = "production";
      process.env.ZOBOX_LOG_LEVEL = undefined;

      logger.debug("Should not appear");
      logger.info("Should appear");

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const output = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);
      expect(output.level).toBe("info");
    });

    test("ignores invalid log level values", () => {
      process.env.ZOBOX_LOG_LEVEL = "invalid";
      process.env.NODE_ENV = "production";

      logger.debug("Should not appear");
      logger.info("Should appear");

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("createChildLogger", () => {
    test("creates logger with pre-populated metadata", () => {
      process.env.ZOBOX_LOG_LEVEL = "info";
      const child = createChildLogger({ requestId: "req-123" });

      child.info("Child log");

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);

      expect(output.meta).toEqual({ requestId: "req-123" });
    });

    test("merges parent and child metadata", () => {
      process.env.ZOBOX_LOG_LEVEL = "info";
      const child = createChildLogger({ requestId: "req-123" });

      child.info("Child log", { action: "create" });

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);

      expect(output.meta).toEqual({
        requestId: "req-123",
        action: "create",
      });
    });

    test("child metadata overrides parent on conflicts", () => {
      process.env.ZOBOX_LOG_LEVEL = "info";
      const child = createChildLogger({ key: "parent" });

      child.info("Test", { key: "child" });

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);

      expect(output.meta.key).toBe("child");
    });

    test("works with all log levels", () => {
      process.env.ZOBOX_LOG_LEVEL = "debug";
      const child = createChildLogger({ context: "test" });

      child.debug("debug");
      child.info("info");
      child.warn("warn");
      child.error("error", new Error("test"));

      expect(consoleLogSpy).toHaveBeenCalledTimes(2);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);

      // Verify all have parent metadata
      const debugOut = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);
      expect(debugOut.meta.context).toBe("test");

      const errorOut = JSON.parse(consoleErrorSpy.mock.calls[1][0] as string);
      expect(errorOut.meta.context).toBe("test");
    });
  });
});
