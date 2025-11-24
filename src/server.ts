import { serve } from "@hono/node-server";
import { type Context, Hono } from "hono";
import { loadConfig, loadDestinationsConfig } from "./config.js";
import { isZorterError } from "./errors.js";
import {
  parseRequest,
  processAndStoreMessage,
  type RuntimeContext,
  toMessageView,
} from "./handlers/messages.js";
import { checkHealth } from "./health.js";
import { logger } from "./logger.js";
import {
  ackMessage,
  findUnclaimedMessages,
  initStorage,
  listAllTags,
  queryMessages,
  searchTags,
} from "./storage.js";
import type { MessageFilters, ZoboxConfig } from "./types.js";

const BEARER_TOKEN_REGEX = /^Bearer\s+(.+)$/i;

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
    options?.baseDir || process.env.ZOBOX_BASE_DIR || "/home/workspace/Inbox";
  const port = options?.port
    ? options.port
    : Number.parseInt(process.env.ZOBOX_PORT ?? "8787", 10);

  const config = loadConfig(baseDir);
  const storage = initStorage(config);
  const routes = loadDestinationsConfig(baseDir);

  const runtime: RuntimeContext = {
    config,
    storage,
    routes,
  };

  const app = new Hono<AppEnv>();

  // Attach runtime context
  app.use("*", (c, next) => {
    c.set("runtime", runtime);
    return next();
  });

  app.get("/health", (c) => {
    const runtimeCtx = c.get("runtime");
    const health = checkHealth(runtimeCtx.storage);
    const statusCode = health.status === "ok" ? 200 : 503;
    return c.json(health, statusCode);
  });

  app.post("/messages", async (c) => {
    const runtimeCtx = c.get("runtime");
    const auth = authenticate(c, runtimeCtx.config, {
      requireAdmin: true,
    });
    if ("error" in auth) {
      return c.json(auth.error, auth.status as 401 | 403);
    }

    try {
      const { message, attachments } = await parseRequest(c);
      const envelope = await processAndStoreMessage(
        message,
        attachments,
        runtimeCtx
      );
      return c.json({ message: toMessageView(envelope) }, 201);
    } catch (err) {
      if (isZorterError(err)) {
        return c.json(
          { error: err.message, code: err.code },
          err.statusCode as 400 | 500
        );
      }
      logger.error(
        "Failed to process /messages request",
        err instanceof Error ? err : new Error(String(err))
      );
      return c.json({ error: "Internal server error" }, 500);
    }
  });

  app.get("/messages", async (c) => {
    const runtimeCtx = c.get("runtime");
    const auth = authenticate(c, runtimeCtx.config);
    if ("error" in auth) {
      return c.json(auth.error, auth.status as 401 | 403);
    }

    const query = c.req.query();
    const filters: MessageFilters = {
      type: query.type,
      channel: query.channel,
      since: query.since,
      until: query.until,
    };

    const limit = query.limit ? Number.parseInt(query.limit, 10) : 50;
    const cursor = query.cursor || undefined;

    const result = await queryMessages(
      runtimeCtx.storage,
      filters,
      limit,
      cursor
    );
    return c.json(result);
  });

  app.get("/messages/next", (c) => {
    const runtimeCtx = c.get("runtime");
    const auth = authenticate(c, runtimeCtx.config);
    if ("error" in auth) {
      return c.json(auth.error, auth.status as 401 | 403);
    }

    const query = c.req.query();
    const subscriber = query.subscriber;
    if (!subscriber) {
      return c.json({ error: '"subscriber" query parameter is required' }, 400);
    }

    const limit = query.limit ? Number.parseInt(query.limit, 10) : 10;
    const filters: MessageFilters = {
      type: query.type,
      channel: query.channel,
    };

    const items = findUnclaimedMessages(runtimeCtx.storage, filters, limit);
    return c.json({ items });
  });

  app.post("/messages/:id/ack", async (c) => {
    const runtimeCtx = c.get("runtime");
    const auth = authenticate(c, runtimeCtx.config, {
      requireAdmin: true,
    });
    if ("error" in auth) {
      return c.json(auth.error, auth.status as 401 | 403);
    }

    const id = c.req.param("id");
    let subscriber: string | undefined;

    const body = (await c.req.json().catch(() => ({}))) as unknown;
    if (
      body &&
      typeof body === "object" &&
      "subscriber" in body &&
      typeof body.subscriber === "string"
    ) {
      subscriber = body.subscriber;
    }

    const qSubscriber = c.req.query("subscriber");
    if (!subscriber && qSubscriber) {
      subscriber = qSubscriber;
    }

    if (!subscriber) {
      return c.json(
        {
          error: '"subscriber" must be provided in body or query string',
        },
        400
      );
    }

    const ok = ackMessage(runtimeCtx.storage, id, subscriber);
    if (!ok) {
      return c.json(
        {
          error: "Item not found or already claimed by another subscriber",
        },
        409
      );
    }

    return c.json({ status: "ok", id, subscriber });
  });

  // Tag management endpoints
  app.get("/tags", (c) => {
    const runtimeCtx = c.get("runtime");
    const auth = authenticate(c, runtimeCtx.config);
    if ("error" in auth) {
      return c.json(auth.error, auth.status as 401 | 403);
    }

    const query = c.req.query();
    const limit = query.limit ? Number.parseInt(query.limit, 10) : 100;
    const offset = query.offset ? Number.parseInt(query.offset, 10) : 0;
    const search = query.search;

    if (search) {
      const tags = searchTags(runtimeCtx.storage.db, search, limit);
      return c.json({ tags });
    }

    const tags = listAllTags(runtimeCtx.storage.db, limit, offset);
    return c.json({ tags });
  });

  app.post("/tags/merge", async (c) => {
    const runtimeCtx = c.get("runtime");
    const auth = authenticate(c, runtimeCtx.config, { requireAdmin: true });
    if ("error" in auth) {
      return c.json(auth.error, auth.status as 401 | 403);
    }

    try {
      const body = await c.req.json();
      const { MergeTagsInputSchema } = await import("./schemas.js");
      const input = MergeTagsInputSchema.parse(body);

      const { mergeTags } = await import("./storage.js");
      const mergedTag = mergeTags(runtimeCtx.storage.db, input);

      return c.json({ tag: mergedTag }, 200);
    } catch (err) {
      if (err instanceof Error) {
        return c.json({ error: err.message }, 400);
      }
      return c.json({ error: "Failed to merge tags" }, 500);
    }
  });

  // Reserved admin config endpoints (V1: not implemented)
  app.get("/admin/config", (c) =>
    c.json(
      {
        status: "not_implemented",
        message:
          "Admin config endpoint is reserved for future UI integrations.",
      },
      501
    )
  );

  app.put("/admin/config", (c) =>
    c.json(
      {
        status: "not_implemented",
        message:
          "Admin config endpoint is reserved for future UI integrations.",
      },
      501
    )
  );

  logger.info("Server starting", {
    url: `http://localhost:${port}`,
    baseDir: runtime.storage.baseDir,
  });

  // Bun and Node both support this - wrap to make the function properly async
  await Promise.resolve();
  serve({
    fetch: app.fetch,
    port,
  });
  logger.info("Server listening", { port });
}

function extractBearerToken(authHeader?: string | null): string | undefined {
  if (!authHeader) {
    return;
  }
  const m = authHeader.match(BEARER_TOKEN_REGEX);
  return m ? m[1] : undefined;
}

function authenticate(
  c: Context<AppEnv>,
  config: ZoboxConfig,
  opts: { requireAdmin?: boolean; requireAuthForPublic?: boolean } = {}
):
  | { role: "admin" | "read" | "public" }
  | { error: { error: string }; status: number } {
  const required = config.auth.required ?? true;
  const headerKey =
    c.req.header("x-api-key") ??
    extractBearerToken(c.req.header("authorization"));
  const adminKeyEnv = process.env[config.auth.admin_api_key_env_var];
  const readKeyEnv = config.auth.read_api_key_env_var
    ? process.env[config.auth.read_api_key_env_var]
    : undefined;

  if (!(required || headerKey)) {
    return { role: "public" };
  }

  let role: "admin" | "read" | "public" | null = null;

  if (headerKey && adminKeyEnv && headerKey === adminKeyEnv) {
    role = "admin";
  } else if (headerKey && readKeyEnv && headerKey === readKeyEnv) {
    role = "read";
  }

  if (!role) {
    if (!(required || opts.requireAuthForPublic)) {
      return { role: "public" };
    }
    return {
      error: { error: "Unauthorized" },
      status: 401,
    };
  }

  if (opts.requireAdmin && role !== "admin") {
    return {
      error: { error: "Forbidden: admin key required" },
      status: 403,
    };
  }

  return { role };
}
