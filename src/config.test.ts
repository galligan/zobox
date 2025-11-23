import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig, loadDestinationsConfig } from "./config";

// Test regex patterns (moved to top level for performance)
const FAILED_TO_PARSE_TOML_REGEX = /Failed to parse TOML/;
const CONFIG_VALIDATION_FAILED_REGEX = /Configuration validation failed/;
const FAILED_TO_LOAD_ROUTES_CONFIG_REGEX = /Failed to load routes config/;

describe("loadConfig", () => {
  let tempDir: string;

  beforeEach(() => {
    // Create a unique temp directory for each test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "zorter-test-"));
  });

  afterEach(() => {
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("loads valid config with all sections defined", () => {
    const configContent = `
[zobox]
base_dir = "/custom/base"
db_path = "/custom/db/zobox.db"
default_channel = "CustomInbox"

[auth]
admin_api_key_env_var = "CUSTOM_ADMIN_KEY"
read_api_key_env_var = "CUSTOM_READ_KEY"
required = false

[files]
enabled = true
base_files_dir = "/custom/files"
path_template = "{baseFilesDir}/{channel}/{filename}"
filename_strategy = "uuid"
keep_base64_in_envelope = true

[types.testType]
description = "Test type"
channel = "TestChannel"

[sorters.testWorkflow]
type = "testType"
description = "Test workflow"
`;

    fs.writeFileSync(path.join(tempDir, "zobox.config.toml"), configContent);

    const config = loadConfig(tempDir);

    expect(config.zobox.base_dir).toBe("/custom/base");
    expect(config.zobox.db_path).toBe("/custom/db/zobox.db");
    expect(config.zobox.default_channel).toBe("CustomInbox");

    expect(config.auth.admin_api_key_env_var).toBe("CUSTOM_ADMIN_KEY");
    expect(config.auth.read_api_key_env_var).toBe("CUSTOM_READ_KEY");
    expect(config.auth.required).toBe(false);

    expect(config.files.enabled).toBe(true);
    expect(config.files.base_files_dir).toBe("/custom/files");
    expect(config.files.path_template).toBe(
      "{baseFilesDir}/{channel}/{filename}"
    );
    expect(config.files.filename_strategy).toBe("uuid");
    expect(config.files.keep_base64_in_envelope).toBe(true);

    expect(config.types.testType).toBeDefined();
    expect(config.types.testType.description).toBe("Test type");

    expect(config.sorters.testWorkflow).toBeDefined();
    expect(config.sorters.testWorkflow.type).toBe("testType");
  });

  it("uses defaults when config file doesn't exist", () => {
    const config = loadConfig(tempDir);

    expect(config.zobox.base_dir).toBe(tempDir);
    expect(config.zobox.db_path).toBe(path.join(tempDir, "db", "zobox.db"));
    expect(config.zobox.default_channel).toBe("Inbox");

    expect(config.auth.admin_api_key_env_var).toBe("ZOBOX_ADMIN_API_KEY");
    expect(config.auth.read_api_key_env_var).toBeUndefined();
    expect(config.auth.required).toBe(true);

    expect(config.files.enabled).toBe(true);
    expect(config.files.base_files_dir).toBe(path.join(tempDir, "files"));
    expect(config.files.path_template).toBe(
      "{baseFilesDir}/{channel}/{date}/{eventId}/{filename}"
    );
    expect(config.files.filename_strategy).toBe("original");
    expect(config.files.keep_base64_in_envelope).toBe(false);

    expect(config.types).toEqual({});
    expect(config.sorters).toEqual({});
  });

  it("uses defaults for missing sections in partial config", () => {
    const configContent = `
[zobox]
default_channel = "PartialInbox"
`;

    fs.writeFileSync(path.join(tempDir, "zobox.config.toml"), configContent);

    const config = loadConfig(tempDir);

    expect(config.zobox.default_channel).toBe("PartialInbox");
    expect(config.zobox.base_dir).toBe(tempDir);
    expect(config.auth.admin_api_key_env_var).toBe("ZOBOX_ADMIN_API_KEY");
    expect(config.files.enabled).toBe(true);
  });

  it("throws descriptive error on invalid TOML syntax", () => {
    const invalidContent = `
[zorter
base_dir = "/invalid"
`;

    fs.writeFileSync(path.join(tempDir, "zobox.config.toml"), invalidContent);

    expect(() => loadConfig(tempDir)).toThrow(FAILED_TO_PARSE_TOML_REGEX);
  });

  it("throws validation error when base_dir is empty", () => {
    const configContent = `
[zobox]
base_dir = ""
db_path = "/some/path/db"
default_channel = "Inbox"
`;

    fs.writeFileSync(path.join(tempDir, "zobox.config.toml"), configContent);

    expect(() => loadConfig(tempDir)).toThrow(CONFIG_VALIDATION_FAILED_REGEX);
  });

  it("throws validation error when admin_api_key_env_var is not UPPER_SNAKE_CASE", () => {
    const configContent = `
[auth]
admin_api_key_env_var = "notUpperSnakeCase"
`;

    fs.writeFileSync(path.join(tempDir, "zobox.config.toml"), configContent);

    expect(() => loadConfig(tempDir)).toThrow(CONFIG_VALIDATION_FAILED_REGEX);
  });

  it("throws validation error when filename_strategy is invalid", () => {
    const configContent = `
[files]
base_files_dir = "/files"
path_template = "{filename}"
filename_strategy = "invalidStrategy"
`;

    fs.writeFileSync(path.join(tempDir, "zobox.config.toml"), configContent);

    expect(() => loadConfig(tempDir)).toThrow(CONFIG_VALIDATION_FAILED_REGEX);
  });

  it("accepts all valid filename strategies", () => {
    const strategies = ["original", "timestampPrefix", "eventIdPrefix", "uuid"];

    for (const strategy of strategies) {
      const configContent = `
[files]
base_files_dir = "/files"
path_template = "{filename}"
filename_strategy = "${strategy}"
`;

      fs.writeFileSync(path.join(tempDir, "zobox.config.toml"), configContent);

      const config = loadConfig(tempDir);
      expect(config.files.filename_strategy).toBe(strategy);
    }
  });

  it("validates workflow definitions have required type field", () => {
    const configContent = `
[sorters.badWorkflow]
description = "Missing type field"
`;

    fs.writeFileSync(path.join(tempDir, "zobox.config.toml"), configContent);

    expect(() => loadConfig(tempDir)).toThrow(CONFIG_VALIDATION_FAILED_REGEX);
  });
});

describe("loadDestinationsConfig", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "zorter-test-"));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("loads valid routes configuration", () => {
    const routesContent = {
      profiles: {
        webhook1: {
          kind: "http",
          url: "https://example.com/webhook",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          enabled: true,
          timeoutMs: 5000,
          description: "Example webhook",
        },
        noop1: {
          kind: "noop",
          enabled: false,
        },
      },
    };

    fs.writeFileSync(
      path.join(tempDir, "routes.json"),
      JSON.stringify(routesContent, null, 2)
    );

    const config = loadDestinationsConfig(tempDir);

    expect(config).toBeDefined();
    expect(config?.profiles.webhook1).toBeDefined();
    expect(config?.profiles.webhook1.kind).toBe("http");
    expect(config?.profiles.webhook1.url).toBe("https://example.com/webhook");
    expect(config?.profiles.noop1.kind).toBe("noop");
  });

  it("returns undefined when routes.json doesn't exist", () => {
    const config = loadDestinationsConfig(tempDir);
    expect(config).toBeUndefined();
  });

  it("throws descriptive error on invalid JSON syntax", () => {
    const invalidJson = `{ "profiles": { "test": `;

    fs.writeFileSync(path.join(tempDir, "routes.json"), invalidJson);

    expect(() => loadDestinationsConfig(tempDir)).toThrow(
      FAILED_TO_LOAD_ROUTES_CONFIG_REGEX
    );
  });

  it("throws validation error when profiles is missing", () => {
    const invalidContent = {
      notProfiles: {},
    };

    fs.writeFileSync(
      path.join(tempDir, "routes.json"),
      JSON.stringify(invalidContent)
    );

    expect(() => loadDestinationsConfig(tempDir)).toThrow(
      FAILED_TO_LOAD_ROUTES_CONFIG_REGEX
    );
  });

  it("throws validation error when URL is invalid", () => {
    const invalidRoutes = {
      profiles: {
        badUrl: {
          kind: "http",
          url: "not-a-valid-url",
        },
      },
    };

    fs.writeFileSync(
      path.join(tempDir, "routes.json"),
      JSON.stringify(invalidRoutes)
    );

    expect(() => loadDestinationsConfig(tempDir)).toThrow(
      FAILED_TO_LOAD_ROUTES_CONFIG_REGEX
    );
  });

  it("throws validation error when HTTP method is invalid", () => {
    const invalidRoutes = {
      profiles: {
        badMethod: {
          kind: "http",
          url: "https://example.com",
          method: "INVALID_METHOD",
        },
      },
    };

    fs.writeFileSync(
      path.join(tempDir, "routes.json"),
      JSON.stringify(invalidRoutes)
    );

    expect(() => loadDestinationsConfig(tempDir)).toThrow(
      FAILED_TO_LOAD_ROUTES_CONFIG_REGEX
    );
  });

  it("throws validation error when timeout exceeds maximum", () => {
    const invalidRoutes = {
      profiles: {
        longTimeout: {
          kind: "http",
          url: "https://example.com",
          timeoutMs: 70_000, // Exceeds 60000ms max
        },
      },
    };

    fs.writeFileSync(
      path.join(tempDir, "routes.json"),
      JSON.stringify(invalidRoutes)
    );

    expect(() => loadDestinationsConfig(tempDir)).toThrow(
      FAILED_TO_LOAD_ROUTES_CONFIG_REGEX
    );
  });

  it("accepts minimal valid route profile", () => {
    const minimalRoutes = {
      profiles: {
        minimal: {
          url: "https://example.com",
        },
      },
    };

    fs.writeFileSync(
      path.join(tempDir, "routes.json"),
      JSON.stringify(minimalRoutes)
    );

    const config = loadDestinationsConfig(tempDir);

    expect(config?.profiles.minimal).toBeDefined();
    expect(config?.profiles.minimal.kind).toBe("http"); // default
    expect(config?.profiles.minimal.enabled).toBe(true); // default
  });
});
