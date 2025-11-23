import { serve } from "@hono/node-server";
import { type Context, Hono } from "hono";
import { loadConfig, loadRoutesConfig } from "./config.js";
import { isZorterError } from "./errors.js";
import {
  parseRequest,
  processAndStoreItem,
  type RuntimeContext,
  toItemView,
} from "./handlers/items.js";
import { checkHealth } from "./health.js";
import { logger } from "./logger.js";
import {
  ackItem,
  findUnclaimedItems,
  initStorage,
  queryItems,
} from "./storage.js";
import type { ItemFilters, ZorterConfig } from "./types.js";

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
    options?.baseDir || process.env.ZORTER_BASE_DIR || "/home/workspace/Inbox";
  const port = options?.port
    ? options.port
    : Number.parseInt(process.env.ZORTER_PORT ?? "8787", 10);

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

  app.post("/items", async (c) => {
    const runtimeCtx = c.get("runtime");
    const auth = authenticate(c, runtimeCtx.config, {
      requireAdmin: true,
    });
    if ("error" in auth) {
      return c.json(auth.error, auth.status as 401 | 403);
    }

    try {
      const { item, attachments } = await parseRequest(c);
      const envelope = await processAndStoreItem(item, attachments, runtimeCtx);
      return c.json({ item: toItemView(envelope) }, 201);
    } catch (err) {
      if (isZorterError(err)) {
        return c.json(
          { error: err.message, code: err.code },
          err.statusCode as 400 | 500
        );
      }
      logger.error(
        "Failed to process /items request",
        err instanceof Error ? err : new Error(String(err))
      );
      return c.json({ error: "Internal server error" }, 500);
    }
  });

  app.get("/items", (c) => {
    const runtimeCtx = c.get("runtime");
    const auth = authenticate(c, runtimeCtx.config);
    if ("error" in auth) {
      return c.json(auth.error, auth.status as 401 | 403);
    }

    const query = c.req.query();
    const filters: ItemFilters = {
      type: query.type,
      channel: query.channel,
      since: query.since,
      until: query.until,
    };

    const limit = query.limit ? Number.parseInt(query.limit, 10) : 50;
    const cursor = query.cursor || undefined;

    const result = queryItems(runtimeCtx.storage, filters, limit, cursor);
    return c.json(result);
  });

  app.get("/items/next", (c) => {
    const runtimeCtx = c.get("runtime");
    const auth = authenticate(c, runtimeCtx.config);
    if ("error" in auth) {
      return c.json(auth.error, auth.status as 401 | 403);
    }

    const query = c.req.query();
    const consumer = query.consumer;
    if (!consumer) {
      return c.json({ error: '"consumer" query parameter is required' }, 400);
    }

    const limit = query.limit ? Number.parseInt(query.limit, 10) : 10;
    const filters: ItemFilters = {
      type: query.type,
      channel: query.channel,
    };

    const items = findUnclaimedItems(runtimeCtx.storage, filters, limit);
    return c.json({ items });
  });

  app.post("/items/:id/ack", async (c) => {
    const runtimeCtx = c.get("runtime");
    const auth = authenticate(c, runtimeCtx.config, {
      requireAdmin: true,
    });
    if ("error" in auth) {
      return c.json(auth.error, auth.status as 401 | 403);
    }

    const id = c.req.param("id");
    let consumer: string | undefined;

    try {
      const body = (await c.req.json().catch(() => ({}))) as unknown;
      if (
        body &&
        typeof body === "object" &&
        "consumer" in body &&
        typeof body.consumer === "string"
      ) {
        consumer = body.consumer;
      }
    } catch {
      // ignore body parse errors, handled below
    }

    const qConsumer = c.req.query("consumer");
    if (!consumer && qConsumer) {
      consumer = qConsumer;
    }

    if (!consumer) {
      return c.json(
        {
          error: '"consumer" must be provided in body or query string',
        },
        400
      );
    }

    const ok = ackItem(runtimeCtx.storage, id, consumer);
    if (!ok) {
      return c.json(
        {
          error: "Item not found or already claimed by another consumer",
        },
        409
      );
    }

    return c.json({ status: "ok", id, consumer });
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
  config: ZorterConfig,
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
