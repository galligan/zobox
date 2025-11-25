#!/usr/bin/env bun
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../src/config.js";
import { startServer } from "../src/server.js";
import {
  generateApiKey,
  getApiKeyByName,
  hasApiKeys,
  storeApiKey,
} from "../src/storage/api-keys.js";
import { initStorage } from "../src/storage.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(__dirname, "..");

function printHelp() {
  console.log(`
zobox - Zo-native inbox + sorter + router

Usage:
  zobox init [options]    Initialize directory, generate keys, and start
  zobox serve [options]   Start the server (assumes init already done)
  zobox migrate [options] Run database migrations only
  zobox help              Show this help

Options:
  --base-dir PATH   Base directory for inbox (default: /home/workspace/Inbox)
  --port PORT       Port to listen on (default: 8787)
  --admin-key KEY   Use this admin API key (otherwise generated or from env)
  --read-key KEY    Use this read-only API key (optional)

Environment:
  ZOBOX_BASE_DIR       Base directory for inbox
  ZOBOX_PORT           Port to listen on
  ZOBOX_ADMIN_API_KEY  Admin API key (used if --admin-key not provided)
  ZOBOX_READ_API_KEY   Read-only API key (used if --read-key not provided)

Key Generation:
  On first 'init', zobox will:
  1. Use --admin-key if provided
  2. Else use ZOBOX_ADMIN_API_KEY from environment
  3. Else generate a secure random key

  Keys are stored as SHA-256 hashes in SQLite. The plaintext key
  is shown only once during init - save it securely!

For Zo, configure a User Service with:
  Label: zobox
  Type: http
  Local port: 8787
  Entrypoint: bunx zobox serve
  Workdir: /home/workspace/Inbox
`);
}

type CliArgs = {
  baseDir: string;
  port: number;
  adminKey: string | null;
  readKey: string | null;
  showHelp: boolean;
};

function parseArgs(argv: string[]): CliArgs {
  const result: CliArgs = {
    baseDir: process.env.ZOBOX_BASE_DIR || "/home/workspace/Inbox",
    port: Number.parseInt(process.env.ZOBOX_PORT ?? "8787", 10),
    adminKey: process.env.ZOBOX_ADMIN_API_KEY || null,
    readKey: process.env.ZOBOX_READ_API_KEY || null,
    showHelp: false,
  };

  const requireValue = (flag: string, value: string | undefined): string => {
    if (!value) {
      throw new Error(`Missing value for ${flag}`);
    }
    return value;
  };

  const parsePort = (value: string): number => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65_535) {
      throw new Error(`Invalid port: ${value} (must be 1-65535)`);
    }
    return parsed;
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const nextArg = argv[i + 1];

    switch (arg) {
      case "--base-dir":
        result.baseDir = requireValue(arg, nextArg);
        i += 1;
        break;
      case "--port":
      case "-p":
        result.port = parsePort(requireValue(arg, nextArg));
        i += 1;
        break;
      case "--admin-key":
        result.adminKey = requireValue(arg, nextArg);
        i += 1;
        break;
      case "--read-key":
        result.readKey = requireValue(arg, nextArg);
        i += 1;
        break;
      case "--help":
      case "-h":
        result.showHelp = true;
        break;
      default:
        break;
    }
  }

  return result;
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    console.log(`[zobox] created ${dir}`);
  }
}

function copyIfMissing(src: string, dest: string): boolean {
  if (!existsSync(dest)) {
    if (existsSync(src)) {
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(src, dest);
      console.log(`[zobox] created ${dest}`);
      return true;
    }
    console.warn(`[zobox] warning: source not found: ${src}`);
    return false;
  }
  return false;
}

function copyMigrations(srcDir: string, destDir: string): void {
  if (!existsSync(srcDir)) {
    console.warn(`[zobox] warning: migrations source not found: ${srcDir}`);
    return;
  }
  ensureDir(destDir);
  const files = readdirSync(srcDir).filter((f) => f.endsWith(".sql"));
  for (const file of files) {
    copyIfMissing(join(srcDir, file), join(destDir, file));
  }
}

type InitResult = {
  adminKey: string;
  readKey: string | null;
  adminKeyGenerated: boolean;
  readKeyGenerated: boolean;
};

async function initZobox(args: CliArgs): Promise<InitResult> {
  const { baseDir, adminKey, readKey } = args;
  console.log(`[zobox] initializing in ${baseDir}`);

  // Create directory structure
  ensureDir(baseDir);
  ensureDir(join(baseDir, "inbox"));
  ensureDir(join(baseDir, "files"));
  ensureDir(join(baseDir, "db"));
  ensureDir(join(baseDir, "db", "migrations"));
  ensureDir(join(baseDir, "logs"));

  // Copy example configs if they don't exist
  copyIfMissing(
    join(PKG_ROOT, "config", "zobox.config.example.toml"),
    join(baseDir, "zobox.config.toml")
  );
  copyIfMissing(
    join(PKG_ROOT, "config", "destinations.example.json"),
    join(baseDir, "destinations.json")
  );

  // Copy all migrations
  copyMigrations(
    join(PKG_ROOT, "db", "migrations"),
    join(baseDir, "db", "migrations")
  );

  // Run migrations
  const config = loadConfig(baseDir);
  const storage = initStorage(config);
  console.log("[zobox] migrations applied");

  // Setup API keys
  const result: InitResult = {
    adminKey: adminKey || "",
    readKey,
    adminKeyGenerated: false,
    readKeyGenerated: false,
  };

  // Check if we already have keys
  if (hasApiKeys(storage.db)) {
    const existingAdmin = getApiKeyByName(storage.db, "admin");
    if (existingAdmin) {
      console.log(
        `[zobox] existing admin key found (${existingAdmin.keyPrefix})`
      );
      // If user provided a key, warn them we're using the existing one
      if (adminKey) {
        console.log(
          "[zobox] note: --admin-key ignored, using existing key from database"
        );
      }
      result.adminKey = ""; // Don't expose the existing key
    }
  } else {
    // No keys exist, set them up
    let finalAdminKey = adminKey;
    if (!finalAdminKey) {
      finalAdminKey = generateApiKey();
      result.adminKeyGenerated = true;
    }
    result.adminKey = finalAdminKey;

    await storeApiKey(storage.db, "admin", finalAdminKey, "admin");
    console.log("[zobox] admin key stored in database");

    // Setup read key if provided or generate if admin was generated
    if (readKey) {
      await storeApiKey(storage.db, "read", readKey, "read");
      result.readKey = readKey;
      console.log("[zobox] read key stored in database");
    } else if (result.adminKeyGenerated) {
      // Generate a read key too for convenience
      const generatedReadKey = generateApiKey();
      await storeApiKey(storage.db, "read", generatedReadKey, "read");
      result.readKey = generatedReadKey;
      result.readKeyGenerated = true;
      console.log("[zobox] read key stored in database");
    }
  }

  console.log("[zobox] initialization complete");
  return result;
}

function printGeneratedKeys(result: InitResult): void {
  if (result.adminKeyGenerated || result.readKeyGenerated) {
    console.log("");
    console.log("═".repeat(60));
    console.log("  IMPORTANT: Save these API keys - shown only once!");
    console.log("═".repeat(60));
    console.log("");
  }

  if (result.adminKeyGenerated && result.adminKey) {
    console.log("  Admin API Key (full access):");
    console.log(`    ${result.adminKey}`);
    console.log("");
  }

  if (result.readKeyGenerated && result.readKey) {
    console.log("  Read API Key (read-only):");
    console.log(`    ${result.readKey}`);
    console.log("");
  }

  if (result.adminKeyGenerated || result.readKeyGenerated) {
    console.log("  Set these as environment variables:");
    if (result.adminKeyGenerated && result.adminKey) {
      console.log(`    export ZOBOX_ADMIN_API_KEY="${result.adminKey}"`);
    }
    if (result.readKeyGenerated && result.readKey) {
      console.log(`    export ZOBOX_READ_API_KEY="${result.readKey}"`);
    }
    console.log("");
    console.log("═".repeat(60));
    console.log("");
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const command = argv[0] ?? "serve";
  const args = argv.slice(1);
  const cliArgs = parseArgs(args);

  if (cliArgs.showHelp) {
    printHelp();
    return;
  }

  switch (command) {
    case "init": {
      const result = await initZobox(cliArgs);
      printGeneratedKeys(result);
      console.log("[zobox] starting server...");
      await startServer({ baseDir: cliArgs.baseDir, port: cliArgs.port });
      break;
    }
    case "serve":
    case "start": // keep as alias for backwards compat
      await startServer({ baseDir: cliArgs.baseDir, port: cliArgs.port });
      break;
    case "migrate": {
      const config = loadConfig(cliArgs.baseDir);
      initStorage(config);
      console.log("[zobox] migrations applied");
      break;
    }
    case "help":
    case "--help":
    case "-h":
      printHelp();
      break;
    default:
      console.error(`[zobox] unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error("[zobox] fatal error", err);
  process.exit(1);
});
