import crypto from 'node:crypto';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { loadConfig, loadRoutesConfig } from './config.js';
import {
  initStorage,
  writeEnvelope,
  insertItemIndex,
  queryItems,
  findUnclaimedItems,
  ackItem,
} from './storage.js';
import {
  resolveChannel,
  getWorkflowForType,
  processAttachments,
  applyWorkflowSideEffects,
} from './workflows.js';
import type {
  ZorterConfig,
  RoutesConfig,
  NewItemInput,
  AttachmentInput,
  ItemEnvelope,
  ItemFilters,
  ItemIndexRow,
} from './types.js';
import type { Storage } from './storage.js';

interface RuntimeContext {
  config: ZorterConfig;
  storage: Storage;
  routes?: RoutesConfig;
}

type AppEnv = {
  Variables: {
    runtime: RuntimeContext;
  };
};

export async function startServer(options?: {
  baseDir?: string;
  port?: number;
}): Promise<void> {
  const baseDir =
    options?.baseDir ||
    process.env.ZORTER_BASE_DIR ||
    '/home/workspace/Inbox';
  const port = options?.port
    ? options.port
    : Number.parseInt(process.env.ZORTER_PORT ?? '8787', 10);

  const config = loadConfig(baseDir);
  const storage = initStorage(config);
  const routes = loadRoutesConfig(baseDir);

  const runtime: RuntimeContext = {
    config,
    storage,
    routes,
  };

  const app = new Hono<AppEnv>();

  // Attach runtime context
  app.use('*', async (c, next) => {
    c.set('runtime', runtime);
    return next();
  });

  app.get('/health', (c) => c.json({ status: 'ok' }));

  app.post('/items', async (c) => {
    const runtimeCtx = c.get('runtime');
    const auth = authenticate(c, runtimeCtx.config, {
      requireAdmin: true,
    });
    if ('error' in auth) {
      return c.json(auth.error, auth.status);
    }

    const contentType = (c.req.header('content-type') || '').toLowerCase();
    const attachments: AttachmentInput[] = [];
    let item: NewItemInput;

    try {
      if (contentType.includes('multipart/form-data')) {
        const body = (await c.req.parseBody()) as Record<
          string,
          unknown
        >;

        const eventRaw =
          (body['event'] as string | undefined) ??
          (body['item'] as string | undefined) ??
          (body['json'] as string | undefined);

        if (!eventRaw) {
          return c.json(
            {
              error:
                'multipart/form-data must include an "event" field containing JSON metadata',
            },
            400,
          );
        }

        let parsed: any;
        try {
          parsed = JSON.parse(eventRaw);
        } catch {
          return c.json({ error: 'Invalid JSON in "event" field' }, 400);
        }

        item = normalizeNewItemInput(parsed);

        for (const [key, value] of Object.entries(body)) {
          const v: any = value;
          if (
            v &&
            typeof v === 'object' &&
            typeof v.arrayBuffer === 'function' &&
            typeof v.name === 'string'
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
      } else {
        let raw: any;
        try {
          raw = await c.req.json();
        } catch {
          return c.json({ error: 'Invalid JSON body' }, 400);
        }

        item = normalizeNewItemInput(raw);

        if (Array.isArray(raw.attachments)) {
          for (const att of raw.attachments as any[]) {
            if (!att) continue;
            if (!att.filename || !att.base64) continue;
            attachments.push({
              filename: String(att.filename),
              mimeType: att.mimeType ? String(att.mimeType) : undefined,
              base64: String(att.base64),
            });
          }
        }
      }
    } catch (err) {
      console.error('[zorter] error parsing /items request', err);
      return c.json({ error: 'Failed to parse request' }, 400);
    }

    const now = new Date();
    const createdAt = now.toISOString();
    const date = createdAt.slice(0, 10);
    const id = crypto.randomUUID();

    const channel = resolveChannel(
      runtimeCtx.config,
      item.type,
      item.channel,
    );
    const workflowBinding = getWorkflowForType(
      runtimeCtx.config,
      item.type,
    );

    let processedAttachments: {
      attachments: AttachmentInput[];
      attachmentsDir: string | null;
      normalizedAttachments: ItemEnvelope['attachments'];
    };

    try {
      const { attachments: normalized, attachmentsDir } = processAttachments(
        runtimeCtx.config,
        runtimeCtx.storage,
        { id, type: item.type, channel, createdAt, date },
        attachments,
        workflowBinding,
      );

      processedAttachments = {
        attachments,
        attachmentsDir,
        normalizedAttachments: normalized,
      };
    } catch (err) {
      console.error(
        '[zorter] error processing attachments',
        err,
      );
      return c.json(
        { error: 'Failed to store attachments' },
        500,
      );
    }

    const envelope: ItemEnvelope = {
      id,
      type: item.type,
      source: item.source ?? 'api',
      channel,
      payload: item.payload,
      attachments: processedAttachments.normalizedAttachments,
      meta: item.meta,
      createdAt,
    };

    const filePath = writeEnvelope(runtimeCtx.storage, envelope);

    const index: ItemIndexRow = {
      id,
      type: envelope.type,
      channel: envelope.channel,
      createdAt,
      filePath,
      fileDir: processedAttachments.attachmentsDir,
      attachmentsCount: envelope.attachments.length,
      hasAttachments: envelope.attachments.length > 0,
      claimedBy: null,
      claimedAt: null,
      summary: null,
    };

    insertItemIndex(runtimeCtx.storage, index);

    await applyWorkflowSideEffects(
      workflowBinding,
      envelope,
      runtimeCtx.storage,
      runtimeCtx.routes,
    );

    return c.json(
      {
        item: {
          id,
          type: envelope.type,
          channel: envelope.channel,
          createdAt,
          hasAttachments: envelope.attachments.length > 0,
          attachmentsCount: envelope.attachments.length,
        },
      },
      201,
    );
  });

  app.get('/items', (c) => {
    const runtimeCtx = c.get('runtime');
    const auth = authenticate(c, runtimeCtx.config);
    if ('error' in auth) {
      return c.json(auth.error, auth.status);
    }

    const query = c.req.query();
    const filters: ItemFilters = {
      type: query.type,
      channel: query.channel,
      since: query.since,
      until: query.until,
    };

    const limit = query.limit
      ? Number.parseInt(query.limit, 10)
      : 50;
    const cursor = query.cursor || undefined;

    const result = queryItems(runtimeCtx.storage, filters, limit, cursor);
    return c.json(result);
  });

  app.get('/items/next', (c) => {
    const runtimeCtx = c.get('runtime');
    const auth = authenticate(c, runtimeCtx.config);
    if ('error' in auth) {
      return c.json(auth.error, auth.status);
    }

    const query = c.req.query();
    const consumer = query.consumer;
    if (!consumer) {
      return c.json(
        { error: '"consumer" query parameter is required' },
        400,
      );
    }

    const limit = query.limit
      ? Number.parseInt(query.limit, 10)
      : 10;
    const filters: ItemFilters = {
      type: query.type,
      channel: query.channel,
    };

    const items = findUnclaimedItems(
      runtimeCtx.storage,
      filters,
      limit,
    );
    return c.json({ items });
  });

  app.post('/items/:id/ack', async (c) => {
    const runtimeCtx = c.get('runtime');
    const auth = authenticate(c, runtimeCtx.config, {
      requireAdmin: true,
    });
    if ('error' in auth) {
      return c.json(auth.error, auth.status);
    }

    const id = c.req.param('id');
    let consumer: string | undefined;

    try {
      const body = (await c.req
        .json()
        .catch(() => ({}))) as any;
      if (body && typeof body.consumer === 'string') {
        consumer = body.consumer;
      }
    } catch {
      // ignore body parse errors, handled below
    }

    const qConsumer = c.req.query('consumer');
    if (!consumer && qConsumer) {
      consumer = qConsumer;
    }

    if (!consumer) {
      return c.json(
        {
          error:
            '"consumer" must be provided in body or query string',
        },
        400,
      );
    }

    const ok = ackItem(runtimeCtx.storage, id, consumer);
    if (!ok) {
      return c.json(
        {
          error:
            'Item not found or already claimed by another consumer',
        },
        409,
      );
    }

    return c.json({ status: 'ok', id, consumer });
  });

  // Reserved admin config endpoints (V1: not implemented)
  app.get('/admin/config', (c) =>
    c.json(
      {
        status: 'not_implemented',
        message:
          'Admin config endpoint is reserved for future UI integrations.',
      },
      501,
    ),
  );

  app.put('/admin/config', (c) =>
    c.json(
      {
        status: 'not_implemented',
        message:
          'Admin config endpoint is reserved for future UI integrations.',
      },
      501,
    ),
  );

  console.log(
    `[zorter] Listening on http://localhost:${port} (baseDir=${runtime.storage.baseDir})`,
  );

  // Bun and Node both support this
  serve({
    fetch: app.fetch,
    port,
  });
}

function normalizeNewItemInput(raw: any): NewItemInput {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid item body');
  }
  const type = String(raw.type ?? '').trim();
  if (!type) {
    throw new Error('"type" is required');
  }
  const payload =
    raw.payload !== undefined ? raw.payload : (raw.data ?? {});
  const channel =
    typeof raw.channel === 'string' ? raw.channel : undefined;
  const source =
    typeof raw.source === 'string' ? raw.source : undefined;
  const meta = raw.meta;
  return { type, payload, channel, source, meta };
}

function extractBearerToken(
  authHeader?: string | null,
): string | undefined {
  if (!authHeader) return undefined;
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : undefined;
}

function authenticate(
  c: Hono.Context<AppEnv>,
  config: ZorterConfig,
  opts: { requireAdmin?: boolean; requireAuthForPublic?: boolean } = {},
):
  | { role: 'admin' | 'read' | 'public' }
  | { error: { error: string }; status: number } {
  const required = config.auth.required ?? true;
  const headerKey =
    c.req.header('x-api-key') ??
    extractBearerToken(c.req.header('authorization'));
  const adminKeyEnv =
    process.env[config.auth.admin_api_key_env_var];
  const readKeyEnv =
    config.auth.read_api_key_env_var
      ? process.env[config.auth.read_api_key_env_var]
      : undefined;

  if (!required && !headerKey) {
    return { role: 'public' };
  }

  let role: 'admin' | 'read' | 'public' | null = null;

  if (headerKey && adminKeyEnv && headerKey === adminKeyEnv) {
    role = 'admin';
  } else if (headerKey && readKeyEnv && headerKey === readKeyEnv) {
    role = 'read';
  }

  if (!role) {
    if (!required && !opts.requireAuthForPublic) {
      return { role: 'public' };
    }
    return {
      error: { error: 'Unauthorized' },
      status: 401,
    };
  }

  if (opts.requireAdmin && role !== 'admin') {
    return {
      error: { error: 'Forbidden: admin key required' },
      status: 403,
    };
  }

  return { role };
}
