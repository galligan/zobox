#!/usr/bin/env bun
import { loadConfig } from "../src/config.js";
import { startServer } from "../src/server.js";
import { initStorage } from "../src/storage.js";

function printHelp() {
  console.log(`
zorter - Zo-native inbox + sorter + router

Usage:
  zorter start [--base-dir PATH] [--port PORT]
  zorter migrate [--base-dir PATH]
  zorter help

Environment:
  ZORTER_BASE_DIR   Base directory for inbox (default: /home/workspace/Inbox)
  ZORTER_PORT       Port to listen on (default: 8787)

For Zo, configure a User Service with:
  Label: zorter
  Type: http
  Local port: 8787
  Entrypoint: bunx zorter start
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
    baseDir: process.env.ZORTER_BASE_DIR || "/home/workspace/Inbox",
    port: Number.parseInt(process.env.ZORTER_PORT ?? "8787", 10),
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
      if (Number.isFinite(parsed)) {
        result.port = parsed;
      }
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      result.showHelp = true;
    }
  }

  return result;
}

async function main() {
  const argv = process.argv.slice(2);
  const command = argv[0] ?? "start";
  const args = argv.slice(1);
  const { baseDir, port, showHelp } = parseArgs(args);

  if (showHelp) {
    printHelp();
    return;
  }

  switch (command) {
    case "start":
      await startServer({ baseDir, port });
      break;
    case "migrate": {
      const config = loadConfig(baseDir);
      initStorage(config); // runs migrations as a side-effect
      console.log("[zorter] migrations applied");
      break;
    }
    default:
      printHelp();
  }
}

main().catch((err) => {
  console.error("[zorter] fatal error", err);
  process.exit(1);
});
