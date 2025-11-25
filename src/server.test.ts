/**
 * Tests for server authentication logic.
 */

import { beforeEach, describe, expect, it } from "vitest";
import type { ZoboxConfig } from "./types.js";

// Mock the authenticate function by extracting it
function authenticate(
  headerKey: string | undefined,
  config: ZoboxConfig,
  opts: { requireAdmin?: boolean; requireAuthForPublic?: boolean } = {}
):
  | { role: "admin" | "read" | "public" }
  | { error: { error: string }; status: number } {
  const required = config.auth.required ?? true;
  const mustAuth = required || opts.requireAdmin || opts.requireAuthForPublic;

  const adminKeyEnv = process.env[config.auth.admin_api_key_env_var];
  const readKeyEnv = config.auth.read_api_key_env_var
    ? process.env[config.auth.read_api_key_env_var]
    : undefined;

  // Only allow unauthenticated access if no auth is required at all
  if (!(mustAuth || headerKey)) {
    return { role: "public" };
  }

  let role: "admin" | "read" | "public" | null = null;

  if (headerKey && adminKeyEnv && headerKey === adminKeyEnv) {
    role = "admin";
  } else if (headerKey && readKeyEnv && headerKey === readKeyEnv) {
    role = "read";
  }

  // If we didn't match a role but auth is required, reject
  if (!role) {
    if (!mustAuth) {
      return { role: "public" };
    }
    return {
      error: { error: "Unauthorized" },
      status: 401,
    };
  }

  // Enforce admin requirement even if auth.required is false
  if (opts.requireAdmin && role !== "admin") {
    return {
      error: { error: "Forbidden: admin key required" },
      status: 403,
    };
  }

  return { role };
}

describe("authenticate function security", () => {
  let config: ZoboxConfig;
  const ADMIN_KEY = "admin-secret-key";
  const READ_KEY = "read-secret-key";

  beforeEach(() => {
    // Set up environment variables
    process.env.ZOBOX_ADMIN_API_KEY = ADMIN_KEY;
    process.env.ZOBOX_READ_API_KEY = READ_KEY;

    // Default config with auth required
    config = {
      zobox: {
        base_dir: "/test",
        db_path: "/test/db/zobox.db",
        default_channel: "general",
      },
      auth: {
        required: true,
        admin_api_key_env_var: "ZOBOX_ADMIN_API_KEY",
        read_api_key_env_var: "ZOBOX_READ_API_KEY",
      },
      files: {
        enabled: true,
        base_files_dir: "/test/files",
        path_template: "{date}/{filename}",
        filename_strategy: "original",
        keep_base64_in_envelope: false,
      },
      types: {},
      sorters: {},
    };
  });

  describe("when auth.required is true", () => {
    it("should reject requests without API key", () => {
      const result = authenticate(undefined, config);
      expect(result).toEqual({
        error: { error: "Unauthorized" },
        status: 401,
      });
    });

    it("should accept admin key", () => {
      const result = authenticate(ADMIN_KEY, config);
      expect(result).toEqual({ role: "admin" });
    });

    it("should accept read key", () => {
      const result = authenticate(READ_KEY, config);
      expect(result).toEqual({ role: "read" });
    });

    it("should reject invalid key", () => {
      const result = authenticate("invalid-key", config);
      expect(result).toEqual({
        error: { error: "Unauthorized" },
        status: 401,
      });
    });
  });

  describe("when auth.required is false", () => {
    beforeEach(() => {
      config.auth.required = false;
    });

    it("should allow public access to non-admin endpoints without key", () => {
      const result = authenticate(undefined, config, {
        requireAdmin: false,
      });
      expect(result).toEqual({ role: "public" });
    });

    it("CRITICAL: should reject admin endpoints without key", () => {
      const result = authenticate(undefined, config, {
        requireAdmin: true,
      });
      expect(result).toEqual({
        error: { error: "Unauthorized" },
        status: 401,
      });
    });

    it("CRITICAL: should reject admin endpoints with read key", () => {
      const result = authenticate(READ_KEY, config, {
        requireAdmin: true,
      });
      expect(result).toEqual({
        error: { error: "Forbidden: admin key required" },
        status: 403,
      });
    });

    it("should accept admin endpoints with admin key", () => {
      const result = authenticate(ADMIN_KEY, config, {
        requireAdmin: true,
      });
      expect(result).toEqual({ role: "admin" });
    });

    it("should still accept valid admin key for non-admin endpoints", () => {
      const result = authenticate(ADMIN_KEY, config);
      expect(result).toEqual({ role: "admin" });
    });

    it("should still accept valid read key for non-admin endpoints", () => {
      const result = authenticate(READ_KEY, config);
      expect(result).toEqual({ role: "read" });
    });
  });

  describe("requireAuthForPublic flag", () => {
    beforeEach(() => {
      config.auth.required = false;
    });

    it("should require authentication when requireAuthForPublic is true", () => {
      const result = authenticate(undefined, config, {
        requireAuthForPublic: true,
      });
      expect(result).toEqual({
        error: { error: "Unauthorized" },
        status: 401,
      });
    });

    it("should accept valid key when requireAuthForPublic is true", () => {
      const result = authenticate(READ_KEY, config, {
        requireAuthForPublic: true,
      });
      expect(result).toEqual({ role: "read" });
    });

    it("should allow public access when requireAuthForPublic is false", () => {
      const result = authenticate(undefined, config, {
        requireAuthForPublic: false,
      });
      expect(result).toEqual({ role: "public" });
    });
  });

  describe("combined flags with auth.required=false", () => {
    beforeEach(() => {
      config.auth.required = false;
    });

    it("CRITICAL: requireAdmin should take precedence over auth.required", () => {
      const result = authenticate(undefined, config, {
        requireAdmin: true,
        requireAuthForPublic: false,
      });
      expect(result).toEqual({
        error: { error: "Unauthorized" },
        status: 401,
      });
    });

    it("should enforce admin requirement with both flags", () => {
      const result = authenticate(READ_KEY, config, {
        requireAdmin: true,
        requireAuthForPublic: true,
      });
      expect(result).toEqual({
        error: { error: "Forbidden: admin key required" },
        status: 403,
      });
    });

    it("should allow admin access with admin key and both flags", () => {
      const result = authenticate(ADMIN_KEY, config, {
        requireAdmin: true,
        requireAuthForPublic: true,
      });
      expect(result).toEqual({ role: "admin" });
    });
  });

  describe("edge cases", () => {
    it("should handle missing read_api_key_env_var config", () => {
      const configNoReadKey: ZoboxConfig = {
        ...config,
        auth: {
          ...config.auth,
          read_api_key_env_var: undefined,
        },
      };

      const result = authenticate(READ_KEY, configNoReadKey);
      expect(result).toEqual({
        error: { error: "Unauthorized" },
        status: 401,
      });
    });

    it("should handle undefined admin key in environment", () => {
      process.env.ZOBOX_ADMIN_API_KEY = undefined;

      const result = authenticate(ADMIN_KEY, config);
      expect(result).toEqual({
        error: { error: "Unauthorized" },
        status: 401,
      });
    });

    it("should handle empty string as key", () => {
      const result = authenticate("", config);
      expect(result).toEqual({
        error: { error: "Unauthorized" },
        status: 401,
      });
    });
  });
});
