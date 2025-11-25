#!/usr/bin/env bun
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../src/config.js";
import { startServer } from "../src/server.js";
import { initStorage } from "../src/storage.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(__dirname, "..");

function printHelp() {
  console.log(`
zobox - Zo-native inbox + sorter + router

Usage:
  zobox init [--base-dir PATH] [--port PORT]   Initialize and start zobox
  zobox serve [--base-dir PATH] [--port PORT]  Start the server
  zobox migrate [--base-dir PATH]              Run database migrations
  zobox help                                   Show this help

Environment:
  ZOBOX_BASE_DIR   Base directory for inbox (default: /home/workspace/Inbox)
  ZOBOX_PORT       Port to listen on (default: 8787)

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
  showHelp: boolean;
};

function parseArgs(argv: string[]): CliArgs {
  const result: CliArgs = {
    baseDir: process.env.ZOBOX_BASE_DIR || "/home/workspace/Inbox",
    port: Number.parseInt(process.env.ZOBOX_PORT ?? "8787", 10),
    showHelp: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const nextArg = argv[i + 1];

    if (arg === "--base-dir" && nextArg) {
      result.baseDir = nextArg;
      i += 1;
    } else if ((arg === "--port" || arg === "-p") && nextArg) {
      const parsed = Number.parseInt(nextArg, 10);
      if (Number.isFinite(parsed) && parsed > 0 && parsed <= 65_535) {
        result.port = parsed;
      } else {
        throw new Error(`Invalid port: ${nextArg} (must be 1-65535)`);
      }
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      result.showHelp = true;
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

function initZobox(baseDir: string): void {
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
  initStorage(config);
  console.log("[zobox] migrations applied");
  console.log("[zobox] initialization complete");
}

async function main() {
  const argv = process.argv.slice(2);
  const command = argv[0] ?? "serve";
  const args = argv.slice(1);
  const { baseDir, port, showHelp } = parseArgs(args);

  if (showHelp) {
    printHelp();
    return;
  }

  switch (command) {
    case "init":
      initZobox(baseDir);
      console.log("[zobox] starting server...");
      await startServer({ baseDir, port });
      break;
    case "serve":
    case "start": // keep as alias for backwards compat
      await startServer({ baseDir, port });
      break;
    case "migrate": {
      const config = loadConfig(baseDir);
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
