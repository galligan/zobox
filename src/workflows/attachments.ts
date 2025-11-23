import crypto from "node:crypto";
import type {
  AttachmentContext,
  AttachmentEnvelope,
  AttachmentInput,
  Base64AttachmentInput,
  BinaryAttachmentInput,
  FilenameStrategy,
} from "../types";

/**
 * Context object for processing attachments, reducing parameter count.
 */
export type AttachmentProcessingContext = {
  config: {
    baseFilesDir: string;
    pathTemplate: string;
    filenameStrategy: FilenameStrategy;
    keepBase64: boolean;
  };
  metadata: AttachmentContext;
};

/**
 * Path template tokens that can be used in file path templates.
 */
export type PathTemplateTokens = {
  baseFilesDir: string;
  channel: string;
  date: string;
  eventId: string;
  timestamp: string;
  filename: string;
};

/**
 * Type guard to check if an attachment input is base64-encoded.
 *
 * @param input - Attachment input to check
 * @returns True if input contains base64 data
 */
export function isBase64Attachment(
  input: AttachmentInput
): input is Base64AttachmentInput {
  return "base64" in input && typeof input.base64 === "string";
}

/**
 * Type guard to check if an attachment input is binary (Buffer).
 *
 * @param input - Attachment input to check
 * @returns True if input contains a Buffer
 */
export function isBinaryAttachment(
  input: AttachmentInput
): input is BinaryAttachmentInput {
  return "buffer" in input && Buffer.isBuffer(input.buffer);
}

/**
 * Applies a filename strategy to an original filename.
 *
 * @param original - The original filename
 * @param strategy - Strategy to apply: original, timestampPrefix, eventIdPrefix, or uuid
 * @param ctx - Attachment context for generating prefixes
 * @returns The filename after applying the strategy
 */
export function resolveAttachmentFilename(
  original: string,
  strategy: FilenameStrategy,
  ctx: AttachmentContext
): string {
  if (strategy === "original") {
    return original;
  }

  const lastDot = original.lastIndexOf(".");
  const name = lastDot > -1 ? original.slice(0, lastDot) : original;
  const ext = lastDot > -1 ? original.slice(lastDot) : "";

  let prefix = "";
  switch (strategy) {
    case "timestampPrefix":
      prefix = `${sanitizeTimestamp(ctx.createdAt)}_`;
      break;
    case "eventIdPrefix":
      prefix = `${ctx.id}_`;
      break;
    case "uuid":
      prefix = `${crypto.randomUUID()}_`;
      break;
    default:
      prefix = "";
  }

  return `${prefix}${name}${ext}`;
}

/**
 * Renders a path template by replacing all tokens with their values.
 *
 * @param template - Template string with tokens like {baseFilesDir}, {channel}, etc.
 * @param tokens - Object containing values for all template tokens
 * @returns Rendered path string
 */
export function renderAttachmentPath(
  template: string,
  tokens: PathTemplateTokens
): string {
  let result = template;

  const replacements: Record<string, string> = {
    baseFilesDir: tokens.baseFilesDir,
    channel: tokens.channel,
    date: tokens.date,
    eventId: tokens.eventId,
    timestamp: tokens.timestamp,
    filename: tokens.filename,
  };

  for (const [key, value] of Object.entries(replacements)) {
    const re = new RegExp(`\\{${key}\\}`, "g");
    result = result.replace(re, value);
  }

  return result;
}

/**
 * Converts an attachment input (base64 or binary) to a Buffer.
 *
 * @param input - Attachment input from API (either base64 or binary)
 * @returns Buffer containing the file data
 */
export function inputToBuffer(input: AttachmentInput): Buffer {
  if (isBase64Attachment(input)) {
    return Buffer.from(input.base64, "base64");
  }

  if (isBinaryAttachment(input)) {
    return input.buffer;
  }

  throw new Error("Invalid attachment input: missing base64 or buffer");
}

/**
 * Options for creating an attachment envelope.
 */
export type CreateAttachmentEnvelopeOptions = {
  /** Original attachment input */
  input: AttachmentInput;
  /** Index of this attachment in the array */
  index: number;
  /** ID of the parent event/item */
  eventId: string;
  /** Filename after strategy application */
  finalFilename: string;
  /** Full filesystem path where file is stored */
  targetPath: string;
  /** File content as Buffer */
  buffer: Buffer;
  /** Whether to include base64 in envelope */
  keepBase64: boolean;
};

/**
 * Creates an attachment envelope from input and processed metadata.
 *
 * @param options - Options for creating the envelope
 * @returns Complete attachment envelope
 */
export function createAttachmentEnvelope(
  options: CreateAttachmentEnvelopeOptions
): AttachmentEnvelope {
  const {
    input,
    index,
    eventId,
    finalFilename,
    targetPath,
    buffer,
    keepBase64,
  } = options;

  const isBase64 = isBase64Attachment(input);
  const originalFilename = input.filename;

  const envelope: AttachmentEnvelope = {
    id: `${eventId}_${index}`,
    filename: finalFilename,
    originalFilename,
    mimeType: input.mimeType,
    size: buffer.length,
    path: targetPath,
    source: isBase64 ? "base64" : "multipart",
  };

  if (keepBase64 && isBase64) {
    envelope.base64 = input.base64;
  }

  return envelope;
}

/**
 * Sanitizes a channel name for use in filesystem paths.
 *
 * @param channel - Raw channel name
 * @returns Sanitized channel name (only alphanumeric, dots, dashes, underscores)
 */
export function sanitizeChannel(channel: string): string {
  return channel.replace(/[^A-Za-z0-9._-]+/g, "_");
}

/**
 * Sanitizes an ISO timestamp for use in filenames and paths.
 * Keeps only numbers and T, removing punctuation and timezone info.
 *
 * @param iso - ISO 8601 timestamp string
 * @returns Sanitized timestamp (e.g., "20251122T123456")
 */
export function sanitizeTimestamp(iso: string): string {
  return iso.replace(/[^0-9T]/g, "").slice(0, 15);
}
