#!/usr/bin/env bun
import { startServer } from '../src/server.js';
import { loadConfig } from '../src/config.js';
import { initStorage } from '../src/storage.js';

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

async function main() {
  const argv = process.argv.slice(2);
  const command = argv[0] ?? 'start';
  const args = argv.slice(1);

  let baseDir =
    process.env.ZORTER_BASE_DIR || '/home/workspace/Inbox';
  let port = Number.parseInt(
    process.env.ZORTER_PORT ?? '8787',
    10,
  );

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--base-dir' && i + 1 < args.length) {
      baseDir = args[i + 1];
      i += 1;
    } else if (
      (arg === '--port' || arg === '-p') &&
      i + 1 < args.length
    ) {
      const parsed = Number.parseInt(args[i + 1], 10);
      if (Number.isFinite(parsed)) {
        port = parsed;
      }
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      return;
    }
  }

  switch (command) {
    case 'start':
      await startServer({ baseDir, port });
      break;
    case 'migrate': {
      const config = loadConfig(baseDir);
      initStorage(config); // runs migrations as a side-effect
      console.log('[zorter] migrations applied');
      break;
    }
    case 'help':
    default:
      printHelp();
  }
}

main().catch((err) => {
  console.error('[zorter] fatal error', err);
  process.exit(1);
});
