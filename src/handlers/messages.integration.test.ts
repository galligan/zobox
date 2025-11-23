/**
 * Integration tests for POST /items handler with decomposed functions.
 * Tests the full handler flow with real Hono context.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Hono } from "hono";
import { initStorage } from "../storage.js";
import type { ZoboxConfig } from "../types.js";
import {
  parseRequest,
  processAndStoreMessage,
  type RuntimeContext,
  toMessageView,
} from "./messages.js";

describe("POST /items handler integration", () => {
  let tempDir: string;
  let runtime: RuntimeContext;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "zorter-items-test-"));

    // Create directory structure
    fs.mkdirSync(path.join(tempDir, "inbox"), { recursive: true });
    fs.mkdirSync(path.join(tempDir, "files"), { recursive: true });
    fs.mkdirSync(path.join(tempDir, "db"), { recursive: true });

    // Copy migration
    const migrationsDir = path.join(tempDir, "db", "migrations");
    fs.mkdirSync(migrationsDir, { recursive: true });
    fs.copyFileSync(
      path.join(process.cwd(), "db", "migrations", "001_init.sql"),
      path.join(migrationsDir, "001_init.sql")
    );

    const config: ZoboxConfig = {
      zorter: {
        base_dir: tempDir,
        db_path: path.join(tempDir, "db", "zobox.db"),
        default_channel: "default",
      },
      auth: {
        admin_api_key_env_var: "ZOBOX_ADMIN_API_KEY",
        required: true,
      },
      files: {
        enabled: true,
        base_files_dir: path.join(tempDir, "files"),
        path_template: "{baseFilesDir}/{channel}/{date}/{filename}",
        filename_strategy: "original",
        keep_base64_in_envelope: false,
      },
      types: {
        task: {
          description: "Task items",
          channel: "tasks",
        },
      },
      sorters: {},
    };

    const storage = initStorage(config);
    runtime = { config, storage };
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should handle JSON request without attachments", async () => {
    const _app = new Hono();

    const mockContext = {
      req: {
        json: async () => ({
          type: "task",
          payload: { title: "Test task", priority: "high" },
          channel: "work",
        }),
        header: (name: string) => {
          if (name === "content-type") {
            return "application/json";
          }
          return null;
        },
      },
    } as any;

    const { item, attachments } = await parseRequest(mockContext);

    expect(item.type).toBe("task");
    expect(item.payload).toEqual({ title: "Test task", priority: "high" });
    expect(item.channel).toBe("work");
    expect(attachments).toEqual([]);

    const envelope = await processAndStoreMessage(item, attachments, runtime);

    expect(envelope.id).toBeDefined();
    expect(envelope.type).toBe("task");
    expect(envelope.channel).toBe("work");
    expect(envelope.attachments).toEqual([]);

    const view = toMessageView(envelope);
    expect(view.hasAttachments).toBe(false);
    expect(view.attachmentsCount).toBe(0);

    // Verify envelope was written
    const envelopeFile = path.join(
      tempDir,
      "inbox",
      envelope.channel,
      envelope.createdAt.slice(0, 10),
      `${envelope.id}.json`
    );
    expect(fs.existsSync(envelopeFile)).toBe(true);
  });

  it("should handle JSON request with base64 attachments", async () => {
    const fileContent = "Hello, world!";
    const base64Content = Buffer.from(fileContent).toString("base64");

    const mockContext = {
      req: {
        json: async () => ({
          type: "note",
          payload: { text: "Note with attachment" },
          attachments: [
            {
              filename: "hello.txt",
              mimeType: "text/plain",
              base64: base64Content,
            },
          ],
        }),
        header: (name: string) => {
          if (name === "content-type") {
            return "application/json";
          }
          return null;
        },
      },
    } as any;

    const { item, attachments } = await parseRequest(mockContext);

    expect(item.type).toBe("note");
    expect(attachments).toHaveLength(1);
    expect(attachments[0].filename).toBe("hello.txt");
    if ("base64" in attachments[0]) {
      expect(attachments[0].base64).toBe(base64Content);
    }

    const envelope = await processAndStoreMessage(item, attachments, runtime);

    expect(envelope.attachments).toHaveLength(1);
    expect(envelope.attachments[0].filename).toBe("hello.txt");
    expect(envelope.attachments[0].size).toBe(fileContent.length);

    const view = toMessageView(envelope);
    expect(view.hasAttachments).toBe(true);
    expect(view.attachmentsCount).toBe(1);

    // Verify attachment file was written
    const attachmentPath = envelope.attachments[0].path;
    expect(fs.existsSync(attachmentPath)).toBe(true);
    const writtenContent = fs.readFileSync(attachmentPath, "utf8");
    expect(writtenContent).toBe(fileContent);
  });

  it("should handle multipart request with file attachments", async () => {
    const fileContent = "Test file content";
    const mockFile = {
      name: "test.txt",
      type: "text/plain",
      arrayBuffer: async () => Buffer.from(fileContent).buffer,
    };

    const mockContext = {
      req: {
        parseBody: async () => ({
          event: JSON.stringify({
            type: "document",
            payload: { name: "Test document" },
          }),
          file1: mockFile,
        }),
        header: (name: string) => {
          if (name === "content-type") {
            return "multipart/form-data";
          }
          return null;
        },
      },
    } as any;

    const { item, attachments } = await parseRequest(mockContext);

    expect(item.type).toBe("document");
    expect(attachments).toHaveLength(1);
    expect(attachments[0].filename).toBe("test.txt");

    const envelope = await processAndStoreMessage(item, attachments, runtime);

    expect(envelope.attachments).toHaveLength(1);
    expect(envelope.attachments[0].filename).toBe("test.txt");
    expect(envelope.attachments[0].mimeType).toBe("text/plain");

    // Verify attachment was written
    const attachmentPath = envelope.attachments[0].path;
    expect(fs.existsSync(attachmentPath)).toBe(true);
  });

  it("should use type-specific channel from config", async () => {
    const mockContext = {
      req: {
        json: async () => ({
          type: "task",
          payload: { title: "Task with default channel" },
          // No explicit channel provided
        }),
        header: (name: string) => {
          if (name === "content-type") {
            return "application/json";
          }
          return null;
        },
      },
    } as any;

    const { item, attachments } = await parseRequest(mockContext);
    const envelope = await processAndStoreMessage(item, attachments, runtime);

    // Should use channel from type definition
    expect(envelope.channel).toBe("tasks");
  });

  it("should handle multiple attachments", async () => {
    const base64Content1 = Buffer.from("File 1").toString("base64");
    const base64Content2 = Buffer.from("File 2").toString("base64");

    const mockContext = {
      req: {
        json: async () => ({
          type: "report",
          payload: { title: "Monthly report" },
          attachments: [
            {
              filename: "data.csv",
              mimeType: "text/csv",
              base64: base64Content1,
            },
            {
              filename: "summary.pdf",
              mimeType: "application/pdf",
              base64: base64Content2,
            },
          ],
        }),
        header: (name: string) => {
          if (name === "content-type") {
            return "application/json";
          }
          return null;
        },
      },
    } as any;

    const { item, attachments } = await parseRequest(mockContext);

    expect(attachments).toHaveLength(2);

    const envelope = await processAndStoreMessage(item, attachments, runtime);

    expect(envelope.attachments).toHaveLength(2);
    expect(envelope.attachments[0].filename).toBe("data.csv");
    expect(envelope.attachments[1].filename).toBe("summary.pdf");

    const view = toMessageView(envelope);
    expect(view.attachmentsCount).toBe(2);
  });
});
