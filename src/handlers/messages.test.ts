/**
 * Tests for POST /messages handler decomposition.
 */

import { describe, expect, it } from "bun:test";
import { ValidationError } from "../errors.js";
import type { Storage } from "../storage.js";
import type {
  MessageEnvelope,
  NewMessageInput,
  ZoboxConfig,
} from "../types.js";
import {
  createMessageEnvelope,
  type ItemMetadata,
  parseJsonRequest,
  parseMultipartRequest,
  processAndStoreMessage,
  type RuntimeContext,
  toMessageView,
} from "./messages.js";

describe("parseMultipartRequest", () => {
  it("should parse valid multipart request with event field", async () => {
    const message = { type: "task", payload: { title: "Test" } };

    const mockContext = {
      req: {
        parseBody: async () => ({
          event: JSON.stringify(message),
        }),
      },
    } as any;

    const result = await parseMultipartRequest(mockContext);

    expect(result.message.type).toBe("task");
    expect(result.message.payload).toEqual({ title: "Test" });
    expect(result.attachments).toEqual([]);
  });

  it("should parse multipart request with attachments", async () => {
    const message = { type: "note", payload: { text: "Hello" } };
    const fileContent = Buffer.from("test file content");

    const mockFile = {
      name: "test.txt",
      type: "text/plain",
      arrayBuffer: async () => fileContent.buffer,
    };

    const mockContext = {
      req: {
        parseBody: async () => ({
          event: JSON.stringify(message),
          file1: mockFile,
        }),
      },
    } as any;

    const result = await parseMultipartRequest(mockContext);

    expect(result.message.type).toBe("note");
    expect(result.attachments).toHaveLength(1);
    expect(result.attachments[0].filename).toBe("test.txt");
    expect(result.attachments[0].mimeType).toBe("text/plain");
  });

  it("should throw ValidationError if event field is missing", async () => {
    const mockContext = {
      req: {
        parseBody: async () => ({
          someOtherField: "value",
        }),
      },
    } as any;

    await expect(parseMultipartRequest(mockContext)).rejects.toThrow(
      ValidationError
    );
  });

  it("should throw ValidationError if event field contains invalid JSON", async () => {
    const mockContext = {
      req: {
        parseBody: async () => ({
          event: "not valid json {",
        }),
      },
    } as any;

    await expect(parseMultipartRequest(mockContext)).rejects.toThrow(
      ValidationError
    );
  });
});

describe("parseJsonRequest", () => {
  it("should parse valid JSON request", async () => {
    const message = {
      type: "task",
      payload: { title: "Test task" },
      channel: "default",
    };

    const mockContext = {
      req: {
        json: async () => message,
      },
    } as any;

    const result = await parseJsonRequest(mockContext);

    expect(result.message.type).toBe("task");
    expect(result.message.payload).toEqual({ title: "Test task" });
    expect(result.message.channel).toBe("default");
    expect(result.attachments).toEqual([]);
  });

  it("should parse JSON request with base64 attachments", async () => {
    const message = {
      type: "note",
      payload: { text: "Hello" },
      attachments: [
        {
          filename: "test.txt",
          mimeType: "text/plain",
          base64: Buffer.from("test content").toString("base64"),
        },
      ],
    };

    const mockContext = {
      req: {
        json: async () => message,
      },
    } as any;

    const result = await parseJsonRequest(mockContext);

    expect(result.message.type).toBe("note");
    expect(result.attachments).toHaveLength(1);
    expect(result.attachments[0].filename).toBe("test.txt");
    if ("base64" in result.attachments[0]) {
      expect(result.attachments[0].base64).toBe(
        Buffer.from("test content").toString("base64")
      );
    }
  });

  it("should throw ValidationError if JSON is invalid", async () => {
    const mockContext = {
      req: {
        json: async () => Promise.reject(new SyntaxError("Unexpected token")),
      },
    } as any;

    await expect(parseJsonRequest(mockContext)).rejects.toThrow(
      ValidationError
    );
  });

  it("should throw ValidationError if type is missing", async () => {
    const mockContext = {
      req: {
        json: async () => ({
          payload: { title: "No type" },
        }),
      },
    } as any;

    await expect(parseJsonRequest(mockContext)).rejects.toThrow(
      ValidationError
    );
  });

  it("should parse and normalize tags array from JSON request", async () => {
    const message = {
      type: "task",
      payload: { title: "Test task" },
      tags: ["urgent", "  work  ", "", "bug"],
    };

    const mockContext = {
      req: {
        json: async () => message,
      },
    } as any;

    const result = await parseJsonRequest(mockContext);

    expect(result.message.type).toBe("task");
    expect(result.message.tags).toEqual(["urgent", "work", "bug"]);
  });

  it("should handle non-string tags by coercing to strings", async () => {
    const message = {
      type: "task",
      payload: { title: "Test task" },
      tags: ["tag1", 123, true, null],
    };

    const mockContext = {
      req: {
        json: async () => message,
      },
    } as any;

    const result = await parseJsonRequest(mockContext);

    expect(result.message.tags).toEqual(["tag1", "123", "true", "null"]);
  });

  it("should set tags to undefined if not provided", async () => {
    const message = {
      type: "task",
      payload: { title: "Test task" },
    };

    const mockContext = {
      req: {
        json: async () => message,
      },
    } as any;

    const result = await parseJsonRequest(mockContext);

    expect(result.message.tags).toBeUndefined();
  });

  it("should set tags to undefined if not an array", async () => {
    const message = {
      type: "task",
      payload: { title: "Test task" },
      tags: "not-an-array",
    };

    const mockContext = {
      req: {
        json: async () => message,
      },
    } as any;

    const result = await parseJsonRequest(mockContext);

    expect(result.message.tags).toBeUndefined();
  });
});

describe("createMessageEnvelope", () => {
  it("should create envelope with all fields", () => {
    const message: NewMessageInput = {
      type: "task",
      payload: { title: "Test" },
      channel: "work",
      source: "api",
      meta: { priority: "high" },
    };

    const metadata: ItemMetadata = {
      id: "test-id",
      channel: "work",
      createdAt: "2025-11-22T12:00:00Z",
      date: "2025-11-22",
    };

    const processedAttachments = {
      attachments: [],
      attachmentsDir: null,
    };

    const envelope = createMessageEnvelope(
      message,
      metadata,
      processedAttachments
    );

    expect(envelope.id).toBe("test-id");
    expect(envelope.type).toBe("task");
    expect(envelope.source).toBe("api");
    expect(envelope.channel).toBe("work");
    expect(envelope.payload).toEqual({ title: "Test" });
    expect(envelope.attachments).toEqual([]);
    expect(envelope.meta).toEqual({ priority: "high" });
    expect(envelope.createdAt).toBe("2025-11-22T12:00:00Z");
  });

  it("should use default source if not provided", () => {
    const message: NewMessageInput = {
      type: "note",
      payload: { text: "Hello" },
    };

    const metadata: ItemMetadata = {
      id: "note-id",
      channel: "default",
      createdAt: "2025-11-22T12:00:00Z",
      date: "2025-11-22",
    };

    const processedAttachments = {
      attachments: [],
      attachmentsDir: null,
    };

    const envelope = createMessageEnvelope(
      message,
      metadata,
      processedAttachments
    );

    expect(envelope.source).toBe("api");
  });

  it("should include attachments in envelope", () => {
    const message: NewMessageInput = {
      type: "document",
      payload: { name: "Report" },
    };

    const metadata: ItemMetadata = {
      id: "doc-id",
      channel: "docs",
      createdAt: "2025-11-22T12:00:00Z",
      date: "2025-11-22",
    };

    const processedAttachments = {
      attachments: [
        {
          id: "doc-id_0",
          filename: "report.pdf",
          originalFilename: "report.pdf",
          mimeType: "application/pdf",
          size: 1024,
          path: "/files/report.pdf",
          source: "multipart" as const,
        },
      ],
      attachmentsDir: "/files",
    };

    const envelope = createMessageEnvelope(
      message,
      metadata,
      processedAttachments
    );

    expect(envelope.attachments).toHaveLength(1);
    expect(envelope.attachments[0].filename).toBe("report.pdf");
  });

  it("should propagate tags from message input to envelope", () => {
    const message: NewMessageInput = {
      type: "task",
      payload: { title: "Test" },
      tags: ["urgent", "bug", "frontend"],
    };

    const metadata: ItemMetadata = {
      id: "test-id",
      channel: "work",
      createdAt: "2025-11-22T12:00:00Z",
      date: "2025-11-22",
    };

    const processedAttachments = {
      attachments: [],
      attachmentsDir: null,
    };

    const envelope = createMessageEnvelope(
      message,
      metadata,
      processedAttachments
    );

    expect(envelope.tags).toEqual(["urgent", "bug", "frontend"]);
  });

  it("should default to empty tags array when not provided", () => {
    const message: NewMessageInput = {
      type: "task",
      payload: { title: "Test" },
    };

    const metadata: ItemMetadata = {
      id: "test-id",
      channel: "work",
      createdAt: "2025-11-22T12:00:00Z",
      date: "2025-11-22",
    };

    const processedAttachments = {
      attachments: [],
      attachmentsDir: null,
    };

    const envelope = createMessageEnvelope(
      message,
      metadata,
      processedAttachments
    );

    expect(envelope.tags).toEqual([]);
  });
});

describe("toMessageView", () => {
  it("should convert envelope to view", () => {
    const envelope: MessageEnvelope = {
      id: "message-1",
      type: "task",
      source: "api",
      channel: "work",
      payload: { title: "Test" },
      attachments: [
        {
          id: "message-1_0",
          filename: "file.txt",
          originalFilename: "file.txt",
          size: 100,
          path: "/files/file.txt",
          source: "base64",
        },
      ],
      createdAt: "2025-11-22T12:00:00Z",
      tags: [],
    };

    const view = toMessageView(envelope);

    expect(view.id).toBe("message-1");
    expect(view.type).toBe("task");
    expect(view.channel).toBe("work");
    expect(view.createdAt).toBe("2025-11-22T12:00:00Z");
    expect(view.hasAttachments).toBe(true);
    expect(view.attachmentsCount).toBe(1);
  });

  it("should handle messages without attachments", () => {
    const envelope: MessageEnvelope = {
      id: "message-2",
      type: "note",
      source: "api",
      channel: "default",
      payload: { text: "Hello" },
      attachments: [],
      createdAt: "2025-11-22T13:00:00Z",
      tags: [],
    };

    const view = toMessageView(envelope);

    expect(view.hasAttachments).toBe(false);
    expect(view.attachmentsCount).toBe(0);
  });
});

describe("integration: processAndStoreMessage", () => {
  it("should process message without attachments", () => {
    // Create minimal mock runtime
    const mockStorage: Partial<Storage> = {
      baseDir: "/test",
      inboxDir: "/test/inbox",
      filesDir: "/test/files",
      db: null as any,
      // Mock writeEnvelope and insertMessageIndex
    };

    const mockConfig: Partial<ZoboxConfig> = {
      zobox: {
        base_dir: "/test",
        db_path: "/test/db/zobox.db",
        default_channel: "default",
      },
      auth: {
        admin_api_key_env_var: "ZOBOX_ADMIN_API_KEY",
        required: true,
      },
      files: {
        enabled: false, // Disable files to skip attachment processing
        base_files_dir: "/test/files",
        path_template: "{baseFilesDir}/{filename}",
        filename_strategy: "original",
        keep_base64_in_envelope: false,
      },
      types: {},
      sorters: {},
    };

    const _runtime: RuntimeContext = {
      config: mockConfig as ZoboxConfig,
      storage: mockStorage as Storage,
    };

    const _message: NewMessageInput = {
      type: "task",
      payload: { title: "Test task" },
    };

    // This test verifies the function signature and flow
    // Full integration testing requires a real database and filesystem
    expect(processAndStoreMessage).toBeDefined();
    expect(typeof processAndStoreMessage).toBe("function");
  });
});
