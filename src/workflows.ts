import fs from "node:fs";
import path from "node:path";
import { StorageError } from "./errors.js";
import { logger } from "./logger.js";
import { routeItem } from "./routing/profiles";
import type { Storage } from "./storage";
import type {
  AttachmentContext,
  AttachmentEnvelope,
  AttachmentInput,
  ItemEnvelope,
  RoutesConfig,
  WorkflowDefinition,
  ZorterConfig,
} from "./types";
import {
  createAttachmentEnvelope,
  inputToBuffer,
  renderAttachmentPath,
  resolveAttachmentFilename,
  sanitizeChannel,
  sanitizeTimestamp,
} from "./workflows/attachments";

/**
 * A workflow binding pairs a workflow name with its definition.
 * Used to apply workflow-specific file handling and side effects.
 */
export type WorkflowBinding = {
  /** Workflow identifier from config */
  name: string;
  /** Workflow configuration */
  definition: WorkflowDefinition;
};

/**
 * Result of processing attachments for an item.
 */
export type ProcessAttachmentsResult = {
  /** Array of attachment envelopes with file paths and metadata */
  attachments: AttachmentEnvelope[];
  /** Directory where attachments were stored, or null if no attachments */
  attachmentsDir: string | null;
};

/**
 * Options for processing attachments.
 */
export type ProcessAttachmentsOptions = {
  /** Zorter configuration */
  config: ZorterConfig;
  /** Storage context */
  storage: Storage;
  /** Attachment context (item metadata for path generation) */
  ctx: AttachmentContext;
  /** Array of attachment inputs (base64 or binary) */
  inputs: AttachmentInput[];
  /** Optional workflow binding for custom file path templates */
  workflowBinding?: WorkflowBinding | null;
};

/**
 * Resolve the channel for an item based on explicit channel, type definition, or default.
 * Priority: explicit channel > type.channel > default_channel.
 *
 * @param config - Zorter configuration
 * @param itemType - Type of the item
 * @param explicitChannel - Optional explicit channel from item payload
 * @returns Resolved channel name
 *
 * @example
 * ```typescript
 * const channel = resolveChannel(config, 'note', 'Work');
 * // Returns 'Work'
 *
 * const channel2 = resolveChannel(config, 'note', null);
 * // Returns type definition channel or 'Inbox' default
 * ```
 */
export function resolveChannel(
  config: ZorterConfig,
  itemType: string,
  explicitChannel?: string | null
): string {
  if (explicitChannel && explicitChannel.trim().length > 0) {
    return explicitChannel.trim();
  }
  const typeDef = config.types[itemType];
  if (typeDef?.channel) {
    return String(typeDef.channel);
  }
  return config.zorter.default_channel;
}

/**
 * Find the workflow binding for a specific item type.
 * Searches all configured workflows for one matching the given type.
 *
 * @param config - Zorter configuration
 * @param type - Item type to find workflow for
 * @returns Workflow binding if found, null otherwise
 *
 * @example
 * ```typescript
 * const workflow = getWorkflowForType(config, 'email');
 * if (workflow) {
 *   console.log(`Using workflow: ${workflow.name}`);
 *   console.log(`Append to: ${workflow.definition.append_to_file}`);
 * }
 * ```
 */
export function getWorkflowForType(
  config: ZorterConfig,
  type: string
): WorkflowBinding | null {
  for (const [name, wf] of Object.entries(config.workflows)) {
    if (wf && typeof wf.type === "string" && wf.type === type) {
      return { name, definition: wf };
    }
  }
  return null;
}

/**
 * Process attachments for an item, writing them to disk and creating envelopes.
 * Applies filename strategies, path templates, and workflow-specific configuration.
 *
 * @param options - Options for processing attachments
 * @returns Processed attachments with file paths and metadata
 *
 * @example
 * ```typescript
 * const inputs: AttachmentInput[] = [{
 *   filename: 'photo.jpg',
 *   mimeType: 'image/jpeg',
 *   base64: '...'
 * }];
 *
 * const ctx: AttachmentContext = {
 *   id: envelope.id,
 *   type: envelope.type,
 *   channel: envelope.channel,
 *   createdAt: envelope.createdAt,
 *   date: '2025-11-22'
 * };
 *
 * const result = processAttachments({
 *   config,
 *   storage,
 *   ctx,
 *   inputs,
 *   workflowBinding: workflow
 * });
 * // result.attachments[0].path: /home/workspace/Inbox/files/Inbox/2025-11-22/{id}/photo.jpg
 * ```
 */
export function processAttachments(
  options: ProcessAttachmentsOptions
): ProcessAttachmentsResult {
  const { config, storage, ctx, inputs, workflowBinding } = options;

  if (!(inputs.length && config.files.enabled)) {
    return { attachments: [], attachmentsDir: null };
  }

  const baseFilesDir = config.files.base_files_dir || storage.filesDir;
  const template =
    workflowBinding?.definition.files_path_template ??
    config.files.path_template;
  const keepBase64 = !!config.files.keep_base64_in_envelope;

  const attachments: AttachmentEnvelope[] = [];
  let attachmentsDir: string | null = null;

  const timestamp = sanitizeTimestamp(ctx.createdAt);
  const safeChannel = sanitizeChannel(ctx.channel);

  for (let i = 0; i < inputs.length; i += 1) {
    const input = inputs[i];
    const originalFilename = input.filename;

    const finalFilename = resolveAttachmentFilename(
      originalFilename,
      config.files.filename_strategy,
      ctx
    );

    const rendered = renderAttachmentPath(template, {
      baseFilesDir,
      channel: safeChannel,
      date: ctx.date,
      eventId: ctx.id,
      timestamp,
      filename: finalFilename,
    });

    const targetPath = path.isAbsolute(rendered)
      ? rendered
      : path.join(baseFilesDir, rendered);

    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const buffer = inputToBuffer(input);

    fs.writeFileSync(targetPath, buffer);

    if (!attachmentsDir) {
      attachmentsDir = dir;
    }

    const attachment = createAttachmentEnvelope({
      input,
      index: i,
      eventId: ctx.id,
      finalFilename,
      targetPath,
      buffer,
      keepBase64,
    });

    attachments.push(attachment);
  }

  return { attachments, attachmentsDir };
}

/**
 * Build a text entry for appending to workflow files.
 * Format: - [timestamp] (type) preview (id: uuid)
 */
function buildAppendEntry(envelope: ItemEnvelope): string {
  const createdAt = envelope.createdAt;
  const preview = buildPayloadPreview(envelope.payload);
  return `- [${createdAt}] (${envelope.type}) ${preview} (id: ${envelope.id})\n`;
}

/**
 * Type guard to check if value is a record with string keys.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Build a short preview of the payload for append entries.
 * Extracts common fields (title, text, body) or truncates JSON.
 */
function buildPayloadPreview(payload: unknown): string {
  if (payload == null) {
    return "";
  }
  if (typeof payload === "string") {
    return payload.slice(0, 120);
  }
  if (isRecord(payload)) {
    if (typeof payload.title === "string") {
      return payload.title;
    }
    if (typeof payload.text === "string") {
      return payload.text.slice(0, 120);
    }
    if (typeof payload.body === "string") {
      return payload.body.slice(0, 120);
    }
    try {
      return JSON.stringify(payload).slice(0, 120);
    } catch {
      return "";
    }
  }
  return String(payload).slice(0, 120);
}

/**
 * Append item entry to a file (workflow side effect).
 * Creates parent directories if needed.
 */
function appendToFile(target: string, envelope: ItemEnvelope, baseDir: string) {
  const filePath = path.isAbsolute(target)
    ? target
    : path.join(baseDir, target);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const entry = buildAppendEntry(envelope);
  fs.appendFileSync(filePath, entry, "utf8");
}

/**
 * Apply workflow side effects after item storage.
 * Handles file appending and HTTP routing based on workflow configuration.
 *
 * @param workflowBinding - Workflow binding to apply (null for no workflow)
 * @param envelope - Item envelope that was stored
 * @param storage - Storage context
 * @param routesConfig - Optional routes configuration for HTTP routing
 *
 * @example
 * ```typescript
 * const workflow = getWorkflowForType(config, 'note');
 * await applyWorkflowSideEffects(workflow, envelope, storage, routes);
 * // May append to workflow file and/or POST to HTTP endpoint
 * ```
 */
export async function applyWorkflowSideEffects(
  workflowBinding: WorkflowBinding | null,
  envelope: ItemEnvelope,
  storage: Storage,
  routesConfig?: RoutesConfig
): Promise<void> {
  if (!workflowBinding) {
    return;
  }

  const wf = workflowBinding.definition;

  if (wf.append_to_file) {
    try {
      appendToFile(wf.append_to_file, envelope, storage.baseDir);
    } catch (err) {
      logger.error(
        "Failed to append to file",
        err instanceof Error ? err : new StorageError(String(err)),
        { filePath: wf.append_to_file, itemId: envelope.id }
      );
    }
  }

  if (wf.route_profile) {
    await routeItem(wf.route_profile, envelope, routesConfig);
  }
}
