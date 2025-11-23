import { describe, expect, it } from "vitest";
import {
  AttachmentContextSchema,
  AttachmentEnvelopeSchema,
  AttachmentInputSchema,
  AuthSectionSchema,
  Base64AttachmentInputSchema,
  BinaryAttachmentInputSchema,
  FilenameStrategySchema,
  FilesSectionSchema,
  ItemEnvelopeSchema,
  ItemFiltersSchema,
  ItemIndexRowSchema,
  ItemViewSchema,
  NewItemInputSchema,
  QueryItemsResultSchema,
  RouteProfileSchema,
  RoutesConfigSchema,
  TypeDefinitionSchema,
  WorkflowDefinitionSchema,
  ZorterConfigSchema,
  ZorterSectionSchema,
} from "./schemas";

// Test regex patterns at top level for performance
const UPPER_SNAKE_CASE_REGEX = /UPPER_SNAKE_CASE/;
const TEMPLATE_TOKEN_REGEX = /template token/;
const YYYY_MM_DD_REGEX = /YYYY-MM-DD/;

// ============================================================================
// ZorterSection Tests
// ============================================================================

describe("ZorterSectionSchema", () => {
  it("should parse a valid ZorterSection", () => {
    const input = {
      base_dir: "/home/workspace/Inbox",
      db_path: "/home/workspace/Inbox/db/zorter.db",
      default_channel: "Inbox",
    };
    const result = ZorterSectionSchema.parse(input);
    expect(result).toEqual(input);
  });

  it("should reject empty base_dir", () => {
    const input = {
      base_dir: "",
      db_path: "/home/workspace/Inbox/db/zorter.db",
      default_channel: "Inbox",
    };
    expect(() => ZorterSectionSchema.parse(input)).toThrow();
  });

  it("should reject missing fields", () => {
    const input = {
      base_dir: "/home/workspace/Inbox",
    };
    expect(() => ZorterSectionSchema.parse(input)).toThrow();
  });
});

// ============================================================================
// AuthSection Tests
// ============================================================================

describe("AuthSectionSchema", () => {
  it("should parse a valid AuthSection with all fields", () => {
    const input = {
      admin_api_key_env_var: "ZORTER_ADMIN_API_KEY",
      read_api_key_env_var: "ZORTER_READ_API_KEY",
      required: true,
    };
    const result = AuthSectionSchema.parse(input);
    expect(result).toEqual(input);
  });

  it("should use default for required when not provided", () => {
    const input = {
      admin_api_key_env_var: "ZORTER_ADMIN_API_KEY",
    };
    const result = AuthSectionSchema.parse(input);
    expect(result.required).toBe(true);
  });

  it("should accept optional read_api_key_env_var", () => {
    const input = {
      admin_api_key_env_var: "ZORTER_ADMIN_API_KEY",
      required: false,
    };
    const result = AuthSectionSchema.parse(input);
    expect(result.read_api_key_env_var).toBeUndefined();
  });

  it("should reject invalid env var names (lowercase)", () => {
    const input = {
      admin_api_key_env_var: "zorter_admin_key",
      required: true,
    };
    expect(() => AuthSectionSchema.parse(input)).toThrow(
      UPPER_SNAKE_CASE_REGEX
    );
  });

  it("should reject env var names with spaces", () => {
    const input = {
      admin_api_key_env_var: "ZORTER ADMIN KEY",
      required: true,
    };
    expect(() => AuthSectionSchema.parse(input)).toThrow();
  });

  it("should reject env var names starting with numbers", () => {
    const input = {
      admin_api_key_env_var: "1ZORTER_ADMIN_KEY",
      required: true,
    };
    expect(() => AuthSectionSchema.parse(input)).toThrow();
  });
});

// ============================================================================
// FilenameStrategy Tests
// ============================================================================

describe("FilenameStrategySchema", () => {
  it("should accept all valid strategies", () => {
    expect(FilenameStrategySchema.parse("original")).toBe("original");
    expect(FilenameStrategySchema.parse("timestampPrefix")).toBe(
      "timestampPrefix"
    );
    expect(FilenameStrategySchema.parse("eventIdPrefix")).toBe("eventIdPrefix");
    expect(FilenameStrategySchema.parse("uuid")).toBe("uuid");
  });

  it("should reject invalid strategies", () => {
    expect(() => FilenameStrategySchema.parse("unknown")).toThrow();
    expect(() => FilenameStrategySchema.parse("sha256")).toThrow();
  });
});

// ============================================================================
// FilesSection Tests
// ============================================================================

describe("FilesSectionSchema", () => {
  it("should parse a valid FilesSection", () => {
    const input = {
      enabled: true,
      base_files_dir: "/home/workspace/Inbox/files",
      path_template: "{baseFilesDir}/{channel}/{date}/{eventId}/{filename}",
      filename_strategy: "original" as const,
      keep_base64_in_envelope: false,
    };
    const result = FilesSectionSchema.parse(input);
    expect(result).toEqual(input);
  });

  it("should apply defaults for enabled and filename_strategy", () => {
    const input = {
      base_files_dir: "/home/workspace/Inbox/files",
      path_template: "{baseFilesDir}/{filename}",
    };
    const result = FilesSectionSchema.parse(input);
    expect(result.enabled).toBe(true);
    expect(result.filename_strategy).toBe("original");
    expect(result.keep_base64_in_envelope).toBe(false);
  });

  it("should accept path_template with at least one token", () => {
    const input = {
      base_files_dir: "/home/workspace/Inbox/files",
      path_template: "{filename}",
    };
    expect(() => FilesSectionSchema.parse(input)).not.toThrow();
  });

  it("should warn if path_template has no tokens (via refinement)", () => {
    const input = {
      base_files_dir: "/home/workspace/Inbox/files",
      path_template: "static/path/file.txt",
    };
    expect(() => FilesSectionSchema.parse(input)).toThrow(TEMPLATE_TOKEN_REGEX);
  });

  it("should reject empty path_template", () => {
    const input = {
      base_files_dir: "/home/workspace/Inbox/files",
      path_template: "",
    };
    expect(() => FilesSectionSchema.parse(input)).toThrow();
  });
});

// ============================================================================
// TypeDefinition Tests
// ============================================================================

describe("TypeDefinitionSchema", () => {
  it("should parse a minimal TypeDefinition", () => {
    const input = {};
    const result = TypeDefinitionSchema.parse(input);
    expect(result).toEqual({});
  });

  it("should parse a full TypeDefinition", () => {
    const input = {
      description: "Generic status update",
      channel: "Updates",
      payload_example: '{"title": "Example"}',
    };
    const result = TypeDefinitionSchema.parse(input);
    expect(result).toEqual(input);
  });

  it("should allow arbitrary additional metadata", () => {
    const input = {
      description: "Custom type",
      custom_field: "custom_value",
      nested: { foo: "bar" },
    };
    const result = TypeDefinitionSchema.parse(input);
    expect(result.custom_field).toBe("custom_value");
    expect(result.nested).toEqual({ foo: "bar" });
  });
});

// ============================================================================
// WorkflowDefinition Tests
// ============================================================================

describe("WorkflowDefinitionSchema", () => {
  it("should parse a minimal WorkflowDefinition", () => {
    const input = {
      type: "update",
    };
    const result = WorkflowDefinitionSchema.parse(input);
    expect(result).toEqual(input);
  });

  it("should parse a full WorkflowDefinition", () => {
    const input = {
      type: "update",
      description: "Append updates to a rolling log",
      files_path_template: "{baseFilesDir}/Updates/{date}/{eventId}/{filename}",
      append_to_file: "/home/workspace/Inbox/updates.md",
      route_profile: "store_only",
    };
    const result = WorkflowDefinitionSchema.parse(input);
    expect(result).toEqual(input);
  });

  it("should allow arbitrary additional metadata", () => {
    const input = {
      type: "post",
      custom_setting: 42,
    };
    const result = WorkflowDefinitionSchema.parse(input);
    expect(result.custom_setting).toBe(42);
  });

  it("should reject empty type", () => {
    const input = {
      type: "",
    };
    expect(() => WorkflowDefinitionSchema.parse(input)).toThrow();
  });

  it("should reject missing type", () => {
    const input = {
      description: "Missing type field",
    };
    expect(() => WorkflowDefinitionSchema.parse(input)).toThrow();
  });
});

// ============================================================================
// ZorterConfig Tests
// ============================================================================

describe("ZorterConfigSchema", () => {
  it("should parse a valid complete config", () => {
    const input = {
      zorter: {
        base_dir: "/home/workspace/Inbox",
        db_path: "/home/workspace/Inbox/db/zorter.db",
        default_channel: "Inbox",
      },
      auth: {
        admin_api_key_env_var: "ZORTER_ADMIN_API_KEY",
        read_api_key_env_var: "ZORTER_READ_API_KEY",
        required: true,
      },
      files: {
        enabled: true,
        base_files_dir: "/home/workspace/Inbox/files",
        path_template: "{baseFilesDir}/{channel}/{date}/{eventId}/{filename}",
        filename_strategy: "original" as const,
        keep_base64_in_envelope: false,
      },
      types: {
        update: {
          description: "Generic status update",
          channel: "Updates",
        },
      },
      workflows: {
        updates: {
          type: "update",
          description: "Append updates to a rolling log",
          append_to_file: "/home/workspace/Inbox/updates.md",
        },
      },
      tools: {
        some_tool: { enabled: true },
      },
    };
    const result = ZorterConfigSchema.parse(input);
    expect(result).toEqual(input);
  });

  it("should apply defaults for empty types and workflows", () => {
    const input = {
      zorter: {
        base_dir: "/home/workspace/Inbox",
        db_path: "/home/workspace/Inbox/db/zorter.db",
        default_channel: "Inbox",
      },
      auth: {
        admin_api_key_env_var: "ZORTER_ADMIN_API_KEY",
      },
      files: {
        base_files_dir: "/home/workspace/Inbox/files",
        path_template: "{baseFilesDir}/{filename}",
      },
    };
    const result = ZorterConfigSchema.parse(input);
    expect(result.types).toEqual({});
    expect(result.workflows).toEqual({});
    expect(result.tools).toBeUndefined();
  });

  it("should reject config with invalid auth section", () => {
    const input = {
      zorter: {
        base_dir: "/home/workspace/Inbox",
        db_path: "/home/workspace/Inbox/db/zorter.db",
        default_channel: "Inbox",
      },
      auth: {
        admin_api_key_env_var: "invalid-name",
      },
      files: {
        base_files_dir: "/home/workspace/Inbox/files",
        path_template: "{filename}",
      },
    };
    expect(() => ZorterConfigSchema.parse(input)).toThrow();
  });
});

// ============================================================================
// RouteProfile Tests
// ============================================================================

describe("RouteProfileSchema", () => {
  it("should parse a minimal HTTP profile", () => {
    const input = {
      kind: "http" as const,
      url: "http://localhost:9000/webhook",
    };
    const result = RouteProfileSchema.parse(input);
    expect(result.enabled).toBe(true);
    expect(result.kind).toBe("http");
  });

  it("should parse a full HTTP profile", () => {
    const input = {
      kind: "http" as const,
      url: "http://localhost:9000/zorter/items",
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-custom-header": "value",
      },
      enabled: true,
      timeoutMs: 5000,
      description: "Publish to worker service",
    };
    const result = RouteProfileSchema.parse(input);
    expect(result).toEqual(input);
  });

  it("should parse a noop profile", () => {
    const input = {
      kind: "noop" as const,
      description: "Do nothing",
    };
    const result = RouteProfileSchema.parse(input);
    expect(result.kind).toBe("noop");
  });

  it("should apply default kind and enabled", () => {
    const input = {
      url: "http://example.com/hook",
    };
    const result = RouteProfileSchema.parse(input);
    expect(result.kind).toBe("http");
    expect(result.enabled).toBe(true);
  });

  it("should reject invalid URL", () => {
    const input = {
      kind: "http" as const,
      url: "not-a-url",
    };
    expect(() => RouteProfileSchema.parse(input)).toThrow();
  });

  it("should reject invalid HTTP method", () => {
    const input = {
      kind: "http" as const,
      url: "http://example.com",
      method: "INVALID",
    };
    expect(() => RouteProfileSchema.parse(input)).toThrow();
  });

  it("should accept valid HTTP methods (case-insensitive)", () => {
    for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
      const input = {
        url: "http://example.com",
        method,
      };
      const result = RouteProfileSchema.parse(input);
      expect(result.method).toBe(method);
    }
  });

  it("should reject timeout greater than 60000ms", () => {
    const input = {
      url: "http://example.com",
      timeoutMs: 100_000,
    };
    expect(() => RouteProfileSchema.parse(input)).toThrow();
  });

  it("should reject negative timeout", () => {
    const input = {
      url: "http://example.com",
      timeoutMs: -1000,
    };
    expect(() => RouteProfileSchema.parse(input)).toThrow();
  });
});

// ============================================================================
// RoutesConfig Tests
// ============================================================================

describe("RoutesConfigSchema", () => {
  it("should parse a valid RoutesConfig", () => {
    const input = {
      profiles: {
        store_only: {
          kind: "noop" as const,
          description: "Do nothing",
          enabled: true,
        },
        publish_to_worker: {
          kind: "http" as const,
          url: "http://localhost:9000/zorter/items",
          method: "POST",
          enabled: true,
        },
      },
    };
    const result = RoutesConfigSchema.parse(input);
    expect(result).toEqual(input);
  });

  it("should reject missing profiles", () => {
    const input = {};
    expect(() => RoutesConfigSchema.parse(input)).toThrow();
  });

  it("should accept empty profiles object", () => {
    const input = {
      profiles: {},
    };
    const result = RoutesConfigSchema.parse(input);
    expect(result.profiles).toEqual({});
  });
});

// ============================================================================
// NewItemInput Tests
// ============================================================================

describe("NewItemInputSchema", () => {
  it("should parse a minimal NewItemInput", () => {
    const input = {
      type: "update",
      payload: { text: "Hello" },
    };
    const result = NewItemInputSchema.parse(input);
    expect(result).toEqual(input);
  });

  it("should parse a full NewItemInput", () => {
    const input = {
      type: "update",
      payload: { text: "Hello" },
      channel: "Updates",
      source: "api",
      meta: { user_id: "123" },
    };
    const result = NewItemInputSchema.parse(input);
    expect(result).toEqual(input);
  });

  it("should reject empty type", () => {
    const input = {
      type: "",
      payload: {},
    };
    expect(() => NewItemInputSchema.parse(input)).toThrow();
  });

  it("should reject missing type", () => {
    const input = {
      payload: {},
    };
    expect(() => NewItemInputSchema.parse(input)).toThrow();
  });

  it("should allow any payload type", () => {
    const inputs = [
      { type: "test", payload: null },
      { type: "test", payload: "string" },
      { type: "test", payload: 123 },
      { type: "test", payload: [1, 2, 3] },
      { type: "test", payload: { nested: { data: true } } },
    ];
    for (const input of inputs) {
      expect(() => NewItemInputSchema.parse(input)).not.toThrow();
    }
  });
});

// ============================================================================
// Attachment Input Tests
// ============================================================================

describe("Base64AttachmentInputSchema", () => {
  it("should parse a valid base64 attachment", () => {
    const input = {
      filename: "photo.jpg",
      mimeType: "image/jpeg",
      base64:
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    };
    const result = Base64AttachmentInputSchema.parse(input);
    expect(result).toEqual(input);
  });

  it("should parse without mimeType", () => {
    const input = {
      filename: "file.txt",
      base64: "SGVsbG8gd29ybGQ=",
    };
    const result = Base64AttachmentInputSchema.parse(input);
    expect(result.mimeType).toBeUndefined();
  });

  it("should reject empty filename", () => {
    const input = {
      filename: "",
      base64: "data",
    };
    expect(() => Base64AttachmentInputSchema.parse(input)).toThrow();
  });

  it("should reject empty base64", () => {
    const input = {
      filename: "file.txt",
      base64: "",
    };
    expect(() => Base64AttachmentInputSchema.parse(input)).toThrow();
  });
});

describe("BinaryAttachmentInputSchema", () => {
  it("should parse a valid binary attachment", () => {
    const input = {
      filename: "photo.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from("binary data"),
      fieldName: "file",
    };
    const result = BinaryAttachmentInputSchema.parse(input);
    expect(result).toEqual(input);
  });

  it("should reject non-Buffer values", () => {
    const input = {
      filename: "file.txt",
      buffer: "not a buffer",
    };
    expect(() => BinaryAttachmentInputSchema.parse(input)).toThrow();
  });
});

describe("AttachmentInputSchema", () => {
  it("should accept base64 attachments", () => {
    const input = {
      filename: "file.txt",
      base64: "SGVsbG8=",
    };
    const result = AttachmentInputSchema.parse(input);
    expect(result).toHaveProperty("base64");
  });

  it("should accept binary attachments", () => {
    const input = {
      filename: "file.txt",
      buffer: Buffer.from("data"),
    };
    const result = AttachmentInputSchema.parse(input);
    expect(result).toHaveProperty("buffer");
  });
});

// ============================================================================
// Envelope & Storage Tests
// ============================================================================

describe("AttachmentEnvelopeSchema", () => {
  it("should parse a valid attachment envelope", () => {
    const input = {
      id: "item123_0",
      filename: "photo.jpg",
      originalFilename: "my-photo.jpg",
      mimeType: "image/jpeg",
      size: 1024,
      path: "/home/workspace/Inbox/files/Updates/2025-11-22/item123/photo.jpg",
      source: "base64" as const,
    };
    const result = AttachmentEnvelopeSchema.parse(input);
    expect(result).toEqual(input);
  });

  it("should parse with minimal fields", () => {
    const input = {
      id: "item123_0",
      filename: "file.txt",
      path: "/path/to/file.txt",
      source: "multipart" as const,
    };
    const result = AttachmentEnvelopeSchema.parse(input);
    expect(result.originalFilename).toBeUndefined();
    expect(result.size).toBeUndefined();
  });

  it("should reject invalid source", () => {
    const input = {
      id: "item123_0",
      filename: "file.txt",
      path: "/path/to/file.txt",
      source: "invalid",
    };
    expect(() => AttachmentEnvelopeSchema.parse(input)).toThrow();
  });

  it("should reject negative size", () => {
    const input = {
      id: "item123_0",
      filename: "file.txt",
      path: "/path/to/file.txt",
      source: "base64" as const,
      size: -100,
    };
    expect(() => AttachmentEnvelopeSchema.parse(input)).toThrow();
  });
});

describe("ItemEnvelopeSchema", () => {
  it("should parse a valid item envelope", () => {
    const input = {
      id: "01HP123",
      type: "update",
      source: "api",
      channel: "Updates",
      payload: { text: "Hello" },
      attachments: [],
      meta: { user_id: "123" },
      createdAt: "2025-11-22T12:34:56.789Z",
    };
    const result = ItemEnvelopeSchema.parse(input);
    expect(result).toEqual(input);
  });

  it("should apply default empty array for attachments", () => {
    const input = {
      id: "01HP123",
      type: "update",
      channel: "Updates",
      payload: {},
      createdAt: "2025-11-22T12:34:56.789Z",
    };
    const result = ItemEnvelopeSchema.parse(input);
    expect(result.attachments).toEqual([]);
  });

  it("should reject invalid datetime", () => {
    const input = {
      id: "01HP123",
      type: "update",
      channel: "Updates",
      payload: {},
      createdAt: "not-a-datetime",
    };
    expect(() => ItemEnvelopeSchema.parse(input)).toThrow();
  });
});

describe("ItemIndexRowSchema", () => {
  it("should parse a valid item index row", () => {
    const input = {
      id: "01HP123",
      type: "update",
      channel: "Updates",
      createdAt: "2025-11-22T12:34:56.789Z",
      filePath: "/home/workspace/Inbox/inbox/2025-11-22/01HP123.json",
      fileDir: "/home/workspace/Inbox/files/Updates/2025-11-22/01HP123",
      attachmentsCount: 2,
      hasAttachments: true,
      claimedBy: "worker-1",
      claimedAt: "2025-11-22T12:35:00.000Z",
      summary: "Quick summary",
    };
    const result = ItemIndexRowSchema.parse(input);
    expect(result).toEqual(input);
  });

  it("should accept null values for optional fields", () => {
    const input = {
      id: "01HP123",
      type: "update",
      channel: "Updates",
      createdAt: "2025-11-22T12:34:56.789Z",
      filePath: "/path/to/file.json",
      fileDir: null,
      attachmentsCount: 0,
      hasAttachments: false,
    };
    const result = ItemIndexRowSchema.parse(input);
    expect(result.claimedBy).toBeUndefined();
    expect(result.claimedAt).toBeUndefined();
    expect(result.summary).toBeUndefined();
  });

  it("should reject negative attachmentsCount", () => {
    const input = {
      id: "01HP123",
      type: "update",
      channel: "Updates",
      createdAt: "2025-11-22T12:34:56.789Z",
      filePath: "/path/to/file.json",
      fileDir: null,
      attachmentsCount: -1,
      hasAttachments: false,
    };
    expect(() => ItemIndexRowSchema.parse(input)).toThrow();
  });
});

describe("ItemViewSchema", () => {
  it("should parse a valid item view", () => {
    const input = {
      id: "01HP123",
      type: "update",
      channel: "Updates",
      createdAt: "2025-11-22T12:34:56.789Z",
      hasAttachments: true,
      attachmentsCount: 2,
    };
    const result = ItemViewSchema.parse(input);
    expect(result).toEqual(input);
  });

  it("should reject invalid datetime", () => {
    const input = {
      id: "01HP123",
      type: "update",
      channel: "Updates",
      createdAt: "invalid",
      hasAttachments: false,
      attachmentsCount: 0,
    };
    expect(() => ItemViewSchema.parse(input)).toThrow();
  });
});

describe("ItemFiltersSchema", () => {
  it("should parse all filter fields", () => {
    const input = {
      type: "update",
      channel: "Updates",
      since: "2025-11-22T00:00:00.000Z",
      until: "2025-11-22T23:59:59.999Z",
    };
    const result = ItemFiltersSchema.parse(input);
    expect(result).toEqual(input);
  });

  it("should accept empty filters", () => {
    const input = {};
    const result = ItemFiltersSchema.parse(input);
    expect(result).toEqual({});
  });

  it("should reject invalid datetime in since/until", () => {
    expect(() => ItemFiltersSchema.parse({ since: "not-a-date" })).toThrow();
    expect(() => ItemFiltersSchema.parse({ until: "not-a-date" })).toThrow();
  });
});

describe("QueryItemsResultSchema", () => {
  it("should parse a valid query result", () => {
    const input = {
      items: [
        {
          id: "01HP123",
          type: "update",
          channel: "Updates",
          createdAt: "2025-11-22T12:34:56.789Z",
          hasAttachments: false,
          attachmentsCount: 0,
        },
      ],
      nextCursor: "base64cursor",
    };
    const result = QueryItemsResultSchema.parse(input);
    expect(result).toEqual(input);
  });

  it("should accept null nextCursor", () => {
    const input = {
      items: [],
      nextCursor: null,
    };
    const result = QueryItemsResultSchema.parse(input);
    expect(result.nextCursor).toBeNull();
  });
});

describe("AttachmentContextSchema", () => {
  it("should parse a valid attachment context", () => {
    const input = {
      id: "01HP123",
      type: "update",
      channel: "Updates",
      createdAt: "2025-11-22T12:34:56.789Z",
      date: "2025-11-22",
    };
    const result = AttachmentContextSchema.parse(input);
    expect(result).toEqual(input);
  });

  it("should reject invalid date format", () => {
    const input = {
      id: "01HP123",
      type: "update",
      channel: "Updates",
      createdAt: "2025-11-22T12:34:56.789Z",
      date: "11/22/2025",
    };
    expect(() => AttachmentContextSchema.parse(input)).toThrow(
      YYYY_MM_DD_REGEX
    );
  });

  it("should reject invalid datetime in createdAt", () => {
    const input = {
      id: "01HP123",
      type: "update",
      channel: "Updates",
      createdAt: "not-a-datetime",
      date: "2025-11-22",
    };
    expect(() => AttachmentContextSchema.parse(input)).toThrow();
  });
});
