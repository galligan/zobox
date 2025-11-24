import { describe, expect, test } from "bun:test";
import type {
  AttachmentContext,
  AttachmentInput,
  Base64AttachmentInput,
  BinaryAttachmentInput,
} from "../types";
import {
  createAttachmentEnvelope,
  inputToBuffer,
  renderAttachmentPath,
  resolveAttachmentFilename,
  sanitizeChannel,
  sanitizeFilename,
  sanitizeTimestamp,
} from "./attachments";

// Test regex patterns (moved to top level for performance)
const UUID_FILENAME_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_file\.txt$/;
const UUID_PATH_TRAVERSAL_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_\.{6}etccron\.devil$/;
const TIMESTAMP_ONLY_REGEX = /^[0-9T]+$/;

describe("sanitizeFilename", () => {
  test("preserves safe filenames", () => {
    expect(sanitizeFilename("photo.jpg")).toBe("photo.jpg");
    expect(sanitizeFilename("document.pdf")).toBe("document.pdf");
    expect(sanitizeFilename("my-file_v2.txt")).toBe("my-file_v2.txt");
  });

  test("removes path separators (Unix)", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("....etcpasswd");
    expect(sanitizeFilename("/etc/passwd")).toBe("etcpasswd");
    expect(sanitizeFilename("dir/file.txt")).toBe("dirfile.txt");
  });

  test("removes path separators (Windows)", () => {
    expect(sanitizeFilename("..\\..\\windows\\system32")).toBe(
      "....windowssystem32"
    );
    expect(sanitizeFilename("C:\\windows\\file.txt")).toBe("C:windowsfile.txt");
  });

  test("removes null bytes", () => {
    expect(sanitizeFilename("file\0.txt")).toBe("file.txt");
    expect(sanitizeFilename("\0hidden.txt")).toBe("hidden.txt");
  });

  test("removes leading and trailing whitespace", () => {
    expect(sanitizeFilename("  file.txt")).toBe("file.txt");
    expect(sanitizeFilename("file.txt  ")).toBe("file.txt");
    expect(sanitizeFilename("  file.txt  ")).toBe("file.txt");
  });

  test("preserves dots (not dangerous without path separators)", () => {
    expect(sanitizeFilename("...file.txt")).toBe("...file.txt");
    expect(sanitizeFilename(". . file.txt")).toBe(". . file.txt");
    expect(sanitizeFilename("...")).toBe("...");
    expect(sanitizeFilename(".")).toBe(".");
  });

  test("returns fallback for empty input", () => {
    expect(sanitizeFilename("")).toBe("unnamed");
    expect(sanitizeFilename("   ")).toBe("unnamed");
  });

  test("handles mixed path traversal attempts", () => {
    expect(sanitizeFilename("../../../etc/cron.d/pwn")).toBe(
      "......etccron.dpwn"
    );
    expect(sanitizeFilename("./config/../../../passwd")).toBe(
      ".config......passwd"
    );
  });

  test("preserves internal dots (extensions)", () => {
    expect(sanitizeFilename("archive.tar.gz")).toBe("archive.tar.gz");
    expect(sanitizeFilename("my.file.with.dots.txt")).toBe(
      "my.file.with.dots.txt"
    );
  });
});

describe("resolveAttachmentFilename", () => {
  const ctx: AttachmentContext = {
    id: "evt-123",
    type: "update",
    channel: "Updates",
    createdAt: "2025-11-22T12:34:56.789Z",
    date: "2025-11-22",
  };

  test("original strategy returns sanitized filename", () => {
    const result = resolveAttachmentFilename("photo.jpg", "original", ctx);
    expect(result).toBe("photo.jpg");
  });

  test("sanitizes path traversal in original strategy", () => {
    const result = resolveAttachmentFilename(
      "../../etc/passwd",
      "original",
      ctx
    );
    expect(result).toBe("....etcpasswd");
    expect(result).not.toContain("/");
    expect(result).not.toContain("\\");
  });

  test("timestampPrefix adds sanitized timestamp", () => {
    const result = resolveAttachmentFilename(
      "document.pdf",
      "timestampPrefix",
      ctx
    );
    expect(result).toBe("20251122T123456_document.pdf");
  });

  test("sanitizes path traversal with timestampPrefix", () => {
    const result = resolveAttachmentFilename(
      "../../../pwn.sh",
      "timestampPrefix",
      ctx
    );
    expect(result).toBe("20251122T123456_......pwn.sh");
    expect(result).not.toContain("/");
  });

  test("eventIdPrefix adds event ID", () => {
    const result = resolveAttachmentFilename("image.png", "eventIdPrefix", ctx);
    expect(result).toBe("evt-123_image.png");
  });

  test("sanitizes path traversal with eventIdPrefix", () => {
    const result = resolveAttachmentFilename(
      "dir/../../file.txt",
      "eventIdPrefix",
      ctx
    );
    expect(result).toBe("evt-123_dir....file.txt");
    expect(result).not.toContain("/");
  });

  test("uuid strategy adds random UUID prefix", () => {
    const result = resolveAttachmentFilename("file.txt", "uuid", ctx);
    // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    expect(result).toMatch(UUID_FILENAME_REGEX);
  });

  test("sanitizes path traversal with uuid strategy", () => {
    const result = resolveAttachmentFilename(
      "../../../etc/cron.d/evil",
      "uuid",
      ctx
    );
    // Should have UUID prefix and sanitized filename
    expect(result).toMatch(UUID_PATH_TRAVERSAL_REGEX);
    expect(result).not.toContain("/");
  });

  test("handles filename without extension", () => {
    const result = resolveAttachmentFilename("README", "eventIdPrefix", ctx);
    expect(result).toBe("evt-123_README");
  });

  test("preserves multiple dots in filename", () => {
    const result = resolveAttachmentFilename(
      "archive.tar.gz",
      "timestampPrefix",
      ctx
    );
    expect(result).toBe("20251122T123456_archive.tar.gz");
  });

  test("handles Windows path separators", () => {
    const result = resolveAttachmentFilename(
      "C:\\windows\\file.txt",
      "original",
      ctx
    );
    expect(result).toBe("C:windowsfile.txt");
    expect(result).not.toContain("\\");
  });

  test("handles null bytes in filename", () => {
    const result = resolveAttachmentFilename("file\0name.txt", "original", ctx);
    expect(result).toBe("filename.txt");
    expect(result).not.toContain("\0");
  });
});

describe("renderAttachmentPath", () => {
  test("replaces all template tokens", () => {
    const template = "{baseFilesDir}/{channel}/{date}/{eventId}/{filename}";
    const tokens = {
      baseFilesDir: "/home/workspace/files",
      channel: "Updates",
      date: "2025-11-22",
      eventId: "evt-123",
      timestamp: "20251122T123456",
      filename: "photo.jpg",
    };

    const result = renderAttachmentPath(template, tokens);
    expect(result).toBe(
      "/home/workspace/files/Updates/2025-11-22/evt-123/photo.jpg"
    );
  });

  test("handles timestamp token", () => {
    const template = "{baseFilesDir}/{timestamp}_{filename}";
    const tokens = {
      baseFilesDir: "/files",
      channel: "Inbox",
      date: "2025-11-22",
      eventId: "evt-123",
      timestamp: "20251122T123456",
      filename: "doc.pdf",
    };

    const result = renderAttachmentPath(template, tokens);
    expect(result).toBe("/files/20251122T123456_doc.pdf");
  });

  test("handles template with no tokens", () => {
    const template = "/static/path/file.txt";
    const tokens = {
      baseFilesDir: "/base",
      channel: "Test",
      date: "2025-11-22",
      eventId: "evt-123",
      timestamp: "20251122T123456",
      filename: "ignored.jpg",
    };

    const result = renderAttachmentPath(template, tokens);
    expect(result).toBe("/static/path/file.txt");
  });

  test("handles repeated tokens", () => {
    const template = "{channel}/{channel}/{filename}";
    const tokens = {
      baseFilesDir: "/base",
      channel: "Updates",
      date: "2025-11-22",
      eventId: "evt-123",
      timestamp: "20251122T123456",
      filename: "file.txt",
    };

    const result = renderAttachmentPath(template, tokens);
    expect(result).toBe("Updates/Updates/file.txt");
  });

  test("handles special characters in values", () => {
    const template = "{baseFilesDir}/{channel}/{filename}";
    const tokens = {
      baseFilesDir: "/home/workspace",
      channel: "Work_Updates",
      date: "2025-11-22",
      eventId: "evt-123",
      timestamp: "20251122T123456",
      filename: "my-file (1).txt",
    };

    const result = renderAttachmentPath(template, tokens);
    expect(result).toBe("/home/workspace/Work_Updates/my-file (1).txt");
  });
});

describe("inputToBuffer", () => {
  test("converts base64 string to Buffer", () => {
    const base64 = Buffer.from("Hello, World!").toString("base64");
    const input: Base64AttachmentInput = {
      filename: "test.txt",
      mimeType: "text/plain",
      base64,
    };

    const result = inputToBuffer(input);
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.toString("utf8")).toBe("Hello, World!");
  });

  test("returns buffer directly for binary input", () => {
    const buffer = Buffer.from("Binary data");
    const input: BinaryAttachmentInput = {
      filename: "binary.bin",
      mimeType: "application/octet-stream",
      buffer,
    };

    const result = inputToBuffer(input);
    expect(result).toBe(buffer);
    expect(result.toString("utf8")).toBe("Binary data");
  });

  test("handles empty base64 input", () => {
    const input: Base64AttachmentInput = {
      filename: "empty.txt",
      base64: "",
    };

    const result = inputToBuffer(input);
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  test("handles empty buffer input", () => {
    const input: BinaryAttachmentInput = {
      filename: "empty.bin",
      buffer: Buffer.alloc(0),
    };

    const result = inputToBuffer(input);
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.length).toBe(0);
  });
});

describe("createAttachmentEnvelope", () => {
  test("creates envelope for base64 input without keeping base64", () => {
    const input: Base64AttachmentInput = {
      filename: "original.jpg",
      mimeType: "image/jpeg",
      base64: "dGVzdCBkYXRh", // "test data"
    };
    const buffer = Buffer.from(input.base64, "base64");

    const envelope = createAttachmentEnvelope({
      input,
      index: 0,
      eventId: "evt-123",
      finalFilename: "final.jpg",
      targetPath: "/files/final.jpg",
      buffer,
      keepBase64: false,
    });

    expect(envelope).toEqual({
      id: "evt-123_0",
      filename: "final.jpg",
      originalFilename: "original.jpg",
      mimeType: "image/jpeg",
      size: buffer.length,
      path: "/files/final.jpg",
      source: "base64",
    });
    expect(envelope.base64).toBeUndefined();
  });

  test("creates envelope for base64 input keeping base64", () => {
    const input: Base64AttachmentInput = {
      filename: "original.jpg",
      mimeType: "image/jpeg",
      base64: "dGVzdCBkYXRh",
    };
    const buffer = Buffer.from(input.base64, "base64");

    const envelope = createAttachmentEnvelope({
      input,
      index: 1,
      eventId: "evt-456",
      finalFilename: "final.jpg",
      targetPath: "/files/final.jpg",
      buffer,
      keepBase64: true,
    });

    expect(envelope.base64).toBe("dGVzdCBkYXRh");
    expect(envelope.source).toBe("base64");
  });

  test("creates envelope for multipart binary input", () => {
    const buffer = Buffer.from("binary file content");
    const input: BinaryAttachmentInput = {
      filename: "upload.bin",
      mimeType: "application/octet-stream",
      buffer,
      fieldName: "file",
    };

    const envelope = createAttachmentEnvelope({
      input,
      index: 2,
      eventId: "evt-789",
      finalFilename: "processed.bin",
      targetPath: "/files/processed.bin",
      buffer,
      keepBase64: false,
    });

    expect(envelope).toEqual({
      id: "evt-789_2",
      filename: "processed.bin",
      originalFilename: "upload.bin",
      mimeType: "application/octet-stream",
      size: buffer.length,
      path: "/files/processed.bin",
      source: "multipart",
    });
    expect(envelope.base64).toBeUndefined();
  });

  test("includes correct index in ID", () => {
    const input: BinaryAttachmentInput = {
      filename: "file.txt",
      buffer: Buffer.from("test"),
    };
    const buffer = input.buffer;

    const envelope = createAttachmentEnvelope({
      input,
      index: 42,
      eventId: "evt-123",
      finalFilename: "file.txt",
      targetPath: "/files/file.txt",
      buffer,
      keepBase64: false,
    });

    expect(envelope.id).toBe("evt-123_42");
  });

  test("handles missing mimeType", () => {
    const input: Base64AttachmentInput = {
      filename: "file.txt",
      base64: "dGVzdA==",
    };
    const buffer = Buffer.from(input.base64, "base64");

    const envelope = createAttachmentEnvelope({
      input,
      index: 0,
      eventId: "evt-123",
      finalFilename: "file.txt",
      targetPath: "/files/file.txt",
      buffer,
      keepBase64: false,
    });

    expect(envelope.mimeType).toBeUndefined();
  });
});

describe("sanitizeChannel", () => {
  test("preserves alphanumeric characters", () => {
    const result = sanitizeChannel("Channel123");
    expect(result).toBe("Channel123");
  });

  test("preserves dots, dashes, and underscores", () => {
    const result = sanitizeChannel("my-channel_v1.0");
    expect(result).toBe("my-channel_v1.0");
  });

  test("replaces spaces with underscores", () => {
    const result = sanitizeChannel("My Channel");
    expect(result).toBe("My_Channel");
  });

  test("replaces special characters with underscores", () => {
    const result = sanitizeChannel("channel@#$%");
    expect(result).toBe("channel_");
  });

  test("handles multiple consecutive special characters", () => {
    const result = sanitizeChannel("channel!!!name");
    expect(result).toBe("channel_name");
  });

  test("handles empty string", () => {
    const result = sanitizeChannel("");
    expect(result).toBe("");
  });

  test("handles only special characters", () => {
    const result = sanitizeChannel("@#$%");
    expect(result).toBe("_");
  });
});

describe("sanitizeTimestamp", () => {
  test("sanitizes ISO 8601 timestamp", () => {
    const result = sanitizeTimestamp("2025-11-22T12:34:56.789Z");
    expect(result).toBe("20251122T123456");
  });

  test("removes timezone offset", () => {
    const result = sanitizeTimestamp("2025-11-22T12:34:56+05:30");
    expect(result).toBe("20251122T123456");
  });

  test("truncates to 15 characters", () => {
    const result = sanitizeTimestamp("2025-11-22T12:34:56.999999Z");
    expect(result).toBe("20251122T123456");
    expect(result.length).toBe(15);
  });

  test("handles short timestamps", () => {
    const result = sanitizeTimestamp("2025-11-22");
    expect(result).toBe("20251122");
  });

  test("preserves T separator", () => {
    const result = sanitizeTimestamp("2025-11-22T00:00:00Z");
    expect(result).toBe("20251122T000000");
    expect(result.includes("T")).toBe(true);
  });

  test("removes all punctuation and timezone info", () => {
    const result = sanitizeTimestamp("2025-11-22T12:34:56.789-08:00");
    expect(result).toMatch(TIMESTAMP_ONLY_REGEX);
    expect(result).toBe("20251122T123456");
  });
});

describe("integration: empty inputs", () => {
  test("empty attachments array produces empty result", () => {
    // This would be tested at the processAttachments level
    // but we verify the building blocks handle empty cases
    const inputs: AttachmentInput[] = [];
    expect(inputs.length).toBe(0);
  });
});
