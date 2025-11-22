import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type {
  ZorterConfig,
  WorkflowDefinition,
  AttachmentInput,
  AttachmentContext,
  AttachmentEnvelope,
  RoutesConfig,
  ItemEnvelope,
  FilenameStrategy,
} from './types';
import type { Storage } from './storage';

export interface WorkflowBinding {
  name: string;
  definition: WorkflowDefinition;
}

export interface ProcessAttachmentsResult {
  attachments: AttachmentEnvelope[];
  attachmentsDir: string | null;
}

export function resolveChannel(
  config: ZorterConfig,
  itemType: string,
  explicitChannel?: string | null,
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

export function getWorkflowForType(
  config: ZorterConfig,
  type: string,
): WorkflowBinding | null {
  for (const [name, wf] of Object.entries(config.workflows)) {
    if (wf && typeof wf.type === 'string' && wf.type === type) {
      return { name, definition: wf };
    }
  }
  return null;
}

export function processAttachments(
  config: ZorterConfig,
  storage: Storage,
  ctx: AttachmentContext,
  inputs: AttachmentInput[],
  workflowBinding?: WorkflowBinding | null,
): ProcessAttachmentsResult {
  if (!inputs.length || !config.files.enabled) {
    return { attachments: [], attachmentsDir: null };
  }

  const baseFilesDir =
    config.files.base_files_dir || storage.filesDir;
  const template =
    workflowBinding?.definition.files_path_template ??
    config.files.path_template;
  const keepBase64 = !!config.files.keep_base64_in_envelope;

  const attachments: AttachmentEnvelope[] = [];
  let attachmentsDir: string | null = null;

  const timestamp = sanitizeTimestamp(ctx.createdAt);
  const safeChannel = sanitizeChannel(ctx.channel);

  for (let i = 0; i < inputs.length; i += 1) {
    const input = inputs[i] as any;
    const isBase64 = typeof input.base64 === 'string';
    const originalFilename = input.filename as string;
    const finalFilename = applyFilenameStrategy(
      originalFilename,
      config.files.filename_strategy,
      ctx,
    );

    const rendered = renderPathTemplate(template, {
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

    const buffer: Buffer = isBase64
      ? Buffer.from(input.base64, 'base64')
      : input.buffer;

    fs.writeFileSync(targetPath, buffer);

    if (!attachmentsDir) {
      attachmentsDir = dir;
    }

    const attachment: AttachmentEnvelope = {
      id: `${ctx.id}_${i}`,
      filename: finalFilename,
      originalFilename,
      mimeType: input.mimeType,
      size: buffer.length,
      path: targetPath,
      source: isBase64 ? 'base64' : 'multipart',
    };

    if (keepBase64 && isBase64) {
      attachment.base64 = input.base64;
    }

    attachments.push(attachment);
  }

  return { attachments, attachmentsDir };
}

function sanitizeChannel(channel: string): string {
  return channel.replace(/[^A-Za-z0-9._-]+/g, '_');
}

function sanitizeTimestamp(iso: string): string {
  // Keep numbers and T; drop punctuation and timezone fluff
  return iso.replace(/[^0-9T]/g, '').slice(0, 15);
}

function applyFilenameStrategy(
  original: string,
  strategy: FilenameStrategy,
  ctx: AttachmentContext,
): string {
  if (strategy === 'original') return original;

  const lastDot = original.lastIndexOf('.');
  const name = lastDot > -1 ? original.slice(0, lastDot) : original;
  const ext = lastDot > -1 ? original.slice(lastDot) : '';

  let prefix = '';
  switch (strategy) {
    case 'timestampPrefix':
      prefix = `${sanitizeTimestamp(ctx.createdAt)}_`;
      break;
    case 'eventIdPrefix':
      prefix = `${ctx.id}_`;
      break;
    case 'uuid':
      prefix = `${crypto.randomUUID()}_`;
      break;
    default:
      prefix = '';
  }

  return `${prefix}${name}${ext}`;
}

function renderPathTemplate(
  template: string,
  ctx: {
    baseFilesDir: string;
    channel: string;
    date: string;
    eventId: string;
    timestamp: string;
    filename: string;
  },
): string {
  let result = template;
  const map: Record<string, string> = {
    baseFilesDir: ctx.baseFilesDir,
    channel: ctx.channel,
    date: ctx.date,
    eventId: ctx.eventId,
    timestamp: ctx.timestamp,
    filename: ctx.filename,
  };

  for (const [key, value] of Object.entries(map)) {
    const re = new RegExp(`\\{${key}\\}`, 'g');
    result = result.replace(re, value);
  }

  return result;
}

function buildAppendEntry(envelope: ItemEnvelope): string {
  const createdAt = envelope.createdAt;
  const preview = buildPayloadPreview(envelope.payload);
  return `- [${createdAt}] (${envelope.type}) ${preview} (id: ${envelope.id})\n`;
}

function buildPayloadPreview(payload: unknown): string {
  if (payload == null) return '';
  if (typeof payload === 'string') {
    return payload.slice(0, 120);
  }
  if (typeof payload === 'object') {
    const anyPayload = payload as any;
    if (typeof anyPayload.title === 'string') {
      return anyPayload.title;
    }
    if (typeof anyPayload.text === 'string') {
      return anyPayload.text.slice(0, 120);
    }
    if (typeof anyPayload.body === 'string') {
      return anyPayload.body.slice(0, 120);
    }
    try {
      return JSON.stringify(anyPayload).slice(0, 120);
    } catch {
      return '';
    }
  }
  return String(payload).slice(0, 120);
}

function appendToFile(
  target: string,
  envelope: ItemEnvelope,
  baseDir: string,
) {
  const filePath = path.isAbsolute(target)
    ? target
    : path.join(baseDir, target);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const entry = buildAppendEntry(envelope);
  fs.appendFileSync(filePath, entry, 'utf8');
}

async function routeItem(
  profileName: string,
  envelope: ItemEnvelope,
  routesConfig?: RoutesConfig,
): Promise<void> {
  if (!profileName || profileName === 'store_only') return;

  if (!routesConfig) {
    console.warn(
      `[zorter] route profile "${profileName}" requested but no routes.json loaded`,
    );
    return;
  }

  const profile = routesConfig.profiles[profileName];
  if (!profile) {
    console.warn(
      `[zorter] route profile "${profileName}" not found in routes.json`,
    );
    return;
  }
  if (profile.enabled === false) return;
  if ((profile.kind && profile.kind !== 'http') || !profile.url) {
    console.warn(
      `[zorter] route profile "${profileName}" is not an HTTP profile or missing url`,
    );
    return;
  }

  const method = (profile.method || 'POST').toUpperCase();
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(profile.headers ?? {}),
  };

  try {
    const res = await fetch(profile.url, {
      method,
      headers,
      body: JSON.stringify(envelope),
    });
    if (!res.ok) {
      console.warn(
        `[zorter] route "${profileName}" HTTP ${res.status} when sending to ${profile.url}`,
      );
    }
  } catch (err) {
    console.error(
      `[zorter] route "${profileName}" failed:`,
      err instanceof Error ? err.message : err,
    );
  }
}

export async function applyWorkflowSideEffects(
  workflowBinding: WorkflowBinding | null,
  envelope: ItemEnvelope,
  storage: Storage,
  routesConfig?: RoutesConfig,
): Promise<void> {
  if (!workflowBinding) return;

  const wf = workflowBinding.definition;

  if (wf.append_to_file) {
    try {
      appendToFile(wf.append_to_file, envelope, storage.baseDir);
    } catch (err) {
      console.error(
        `[zorter] Failed to append to ${wf.append_to_file}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  if (wf.route_profile) {
    await routeItem(wf.route_profile, envelope, routesConfig);
  }
}
