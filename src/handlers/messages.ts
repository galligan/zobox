/**
 * POST /items handler decomposition.
 *
 * This module extracts handler logic to reduce complexity from 50 to ~8.
 * The main handler in server.ts is now ~20 lines, down from ~180 lines.
 *
 * Architecture:
 * - parseRequest(): Routes to multipart or JSON parser based on content-type
 * - parseMultipartRequest(): Handles multipart form data with file uploads
 * - parseJsonRequest(): Handles JSON requests with base64 attachments
 * - createMessageEnvelope(): Assembles envelope from input and metadata
 * - storeAndProcessItem(): Writes envelope, index, and applies sorters
 * - processAndStoreMessage(): Orchestrates the full item creation flow
 * - toMessageView(): Converts envelope to API response format
 *
 * Error handling uses ZorterError hierarchy for structured responses.
 */

import crypto from "node:crypto";
import type { Context } from "hono";
import { ValidationError } from "../errors.js";
import type { Storage } from "../storage.js";
import { insertMessageIndex, writeEnvelope } from "../storage.js";
import type {
  AttachmentInput,
  DestinationsConfig,
  MessageEnvelope,
  MessageIndexRow,
  NewMessageInput,
  ZoboxConfig,
} from "../types.js";
import { parseJson } from "../utils/json.js";
import {
  applySorterSideEffects,
  getSorterForType,
  type ProcessAttachmentsResult,
  processAttachments,
  resolveChannel,
  type SorterBinding,
} from "../workflows.js";

/**
 * Runtime context for handler operations.
 */
export type RuntimeContext = {
  config: ZoboxConfig;
  storage: Storage;
  routes?: DestinationsConfig;
};

/**
 * Metadata for creating item envelopes.
 */
export type ItemMetadata = {
  id: string;
  channel: string;
  createdAt: string;
  date: string;
};

/**
 * Result of parsing a multipart or JSON request.
 */
export type ParsedRequest = {
  item: NewMessageInput;
  attachments: AttachmentInput[];
};

/**
 * Result of item view conversion.
 */
export type MessageView = {
  id: string;
  type: string;
  channel: string;
  createdAt: string;
  hasAttachments: boolean;
  attachmentsCount: number;
};

/**
 * Parses multipart form data request.
 * Extracts item metadata from JSON field and attachments from file fields.
 *
 * @param c - Hono context
 * @returns Parsed item and attachments
 * @throws ValidationError if request format is invalid
 */
export async function parseMultipartRequest(
  c: Context
): Promise<ParsedRequest> {
  const body = (await c.req.parseBody()) as Record<string, unknown>;

  // Look for event/item/json field containing item metadata
  const eventRaw =
    (body.event as string | undefined) ??
    (body.item as string | undefined) ??
    (body.json as string | undefined);

  if (!eventRaw) {
    throw new ValidationError(
      'multipart/form-data must include an "event" field containing JSON metadata',
      "MISSING_EVENT_FIELD"
    );
  }

  let parsed: unknown;
  try {
    parsed = parseJson(eventRaw);
  } catch (err) {
    throw new ValidationError(
      `Invalid JSON in "event" field: ${err instanceof Error ? err.message : "parse error"}`,
      "INVALID_EVENT_JSON"
    );
  }

  const item = normalizeNewMessageInput(parsed);
  const attachments: AttachmentInput[] = [];

  // Extract file attachments from form fields
  for (const [key, value] of Object.entries(body)) {
    // biome-ignore lint/suspicious/noExplicitAny: Multipart form data has dynamic types
    const v: any = value;
    if (
      v &&
      typeof v === "object" &&
      typeof v.arrayBuffer === "function" &&
      typeof v.name === "string"
    ) {
      const arrayBuffer = await v.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      attachments.push({
        filename: v.name,
        mimeType: v.type,
        buffer,
        fieldName: key,
      });
    }
  }

  return { item, attachments };
}

/**
 * Parses JSON request body.
 * Extracts item metadata and base64 attachments.
 *
 * @param c - Hono context
 * @returns Parsed item and attachments
 * @throws ValidationError if request format is invalid
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Complex validation logic for JSON parsing
export async function parseJsonRequest(c: Context): Promise<ParsedRequest> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch (err) {
    throw new ValidationError(
      `Invalid JSON body: ${err instanceof Error ? err.message : "parse error"}`,
      "INVALID_JSON_BODY"
    );
  }

  const item = normalizeNewMessageInput(raw);
  const attachments: AttachmentInput[] = [];

  // Extract base64 attachments if present
  if (raw && typeof raw === "object") {
    // biome-ignore lint/suspicious/noExplicitAny: JSON parsing requires dynamic type checking
    const anyRaw = raw as any;
    if (Array.isArray(anyRaw.attachments)) {
      // biome-ignore lint/suspicious/noExplicitAny: Array elements have unknown structure
      for (const att of anyRaw.attachments as any[]) {
        if (!att) {
          continue;
        }
        if (!(att.filename && att.base64)) {
          continue;
        }
        attachments.push({
          filename: String(att.filename),
          mimeType: att.mimeType ? String(att.mimeType) : undefined,
          base64: String(att.base64),
        });
      }
    }
  }

  return { item, attachments };
}

/**
 * Parses request based on content type.
 * Routes to multipart or JSON parser.
 *
 * @param c - Hono context
 * @returns Parsed item and attachments
 * @throws ValidationError if request format is invalid
 */
export async function parseRequest(c: Context): Promise<ParsedRequest> {
  const contentType = (c.req.header("content-type") || "").toLowerCase();

  if (contentType.includes("multipart/form-data")) {
    return await parseMultipartRequest(c);
  }

  return await parseJsonRequest(c);
}

/**
 * Creates an item envelope from input and metadata.
 *
 * @param item - New item input
 * @param metadata - Item metadata (id, channel, timestamps)
 * @param processedAttachments - Result of attachment processing
 * @returns Complete item envelope
 */
export function createMessageEnvelope(
  item: NewMessageInput,
  metadata: ItemMetadata,
  processedAttachments: ProcessAttachmentsResult
): MessageEnvelope {
  return {
    id: metadata.id,
    type: item.type,
    source: item.source ?? "api",
    channel: metadata.channel,
    payload: item.payload,
    attachments: processedAttachments.attachments,
    meta: item.meta,
    createdAt: metadata.createdAt,
    tags: item.tags ?? [],
  };
}

/**
 * Stores item envelope and index, then applies sorter side effects.
 *
 * @param envelope - Item envelope to store
 * @param processedAttachments - Result of attachment processing
 * @param sorter - Sorter binding if applicable
 * @param runtime - Runtime context
 */
export async function storeAndProcessItem(
  envelope: MessageEnvelope,
  processedAttachments: ProcessAttachmentsResult,
  sorter: SorterBinding | null,
  runtime: RuntimeContext
): Promise<void> {
  const filePath = writeEnvelope(runtime.storage, envelope);

  const index: MessageIndexRow = {
    id: envelope.id,
    type: envelope.type,
    channel: envelope.channel,
    createdAt: envelope.createdAt,
    filePath,
    fileDir: processedAttachments.attachmentsDir,
    attachmentsCount: envelope.attachments.length,
    hasAttachments: envelope.attachments.length > 0,
    subscribedBy: null,
    subscribedAt: null,
    summary: null,
  };

  insertMessageIndex(runtime.storage, index);

  await applySorterSideEffects(
    sorter,
    envelope,
    runtime.storage,
    runtime.routes
  );
}

/**
 * Processes and stores a new item with attachments.
 * Orchestrates the full item creation flow.
 *
 * @param item - New item input
 * @param attachments - Attachment inputs
 * @param runtime - Runtime context
 * @returns Created item envelope
 */
export async function processAndStoreMessage(
  item: NewMessageInput,
  attachments: AttachmentInput[],
  runtime: RuntimeContext
): Promise<MessageEnvelope> {
  const now = new Date();
  const createdAt = now.toISOString();
  const date = createdAt.slice(0, 10);
  const id = crypto.randomUUID();

  const channel = resolveChannel(runtime.config, item.type, item.channel);
  const sorter = getSorterForType(runtime.config, item.type);

  const processedAttachments = processAttachments({
    config: runtime.config,
    storage: runtime.storage,
    ctx: { id, type: item.type, channel, createdAt, date },
    inputs: attachments,
    sorterBinding: sorter,
  });

  const metadata: ItemMetadata = { id, channel, createdAt, date };
  const envelope = createMessageEnvelope(item, metadata, processedAttachments);

  await storeAndProcessItem(envelope, processedAttachments, sorter, runtime);

  return envelope;
}

/**
 * Converts an item envelope to a view for API responses.
 *
 * @param envelope - Item envelope
 * @returns Item view for API response
 */
export function toMessageView(envelope: MessageEnvelope): MessageView {
  return {
    id: envelope.id,
    type: envelope.type,
    channel: envelope.channel,
    createdAt: envelope.createdAt,
    hasAttachments: envelope.attachments.length > 0,
    attachmentsCount: envelope.attachments.length,
  };
}

/**
 * Normalizes raw input into NewMessageInput.
 * Validates required fields and provides defaults.
 *
 * @param raw - Raw request body
 * @returns Normalized NewMessageInput
 * @throws ValidationError if input is invalid
 */
function normalizeNewMessageInput(raw: unknown): NewMessageInput {
  if (!raw || typeof raw !== "object") {
    throw new ValidationError("Invalid item body", "INVALID_ITEM_BODY");
  }

  // biome-ignore lint/suspicious/noExplicitAny: Dynamic JSON input requires runtime validation
  const anyRaw = raw as any;
  const type = String(anyRaw.type ?? "").trim();
  if (!type) {
    throw new ValidationError('"type" is required', "MISSING_ITEM_TYPE");
  }

  const payload =
    anyRaw.payload !== undefined ? anyRaw.payload : (anyRaw.data ?? {});
  const channel =
    typeof anyRaw.channel === "string" ? anyRaw.channel : undefined;
  const source = typeof anyRaw.source === "string" ? anyRaw.source : undefined;
  const meta = anyRaw.meta;

  return { type, payload, channel, source, meta };
}
