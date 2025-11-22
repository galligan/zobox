import fs from 'node:fs';
import path from 'node:path';
import * as toml from 'toml';
import type { ZorterConfig, RoutesConfig } from './types';

export function loadConfig(baseDir: string): ZorterConfig {
  const configPath = path.join(baseDir, 'zorter.config.toml');
  let raw: any = {};
  if (fs.existsSync(configPath)) {
    const text = fs.readFileSync(configPath, 'utf8');
    raw = toml.parse(text);
  }

  return normalizeConfig(raw, baseDir);
}

function normalizeConfig(raw: any, baseDir: string): ZorterConfig {
  const rawZorter = raw.zorter ?? {};
  const base_dir: string = rawZorter.base_dir ?? baseDir;
  const db_path: string =
    rawZorter.db_path ?? path.join(base_dir, 'db', 'zorter.db');
  const default_channel: string = rawZorter.default_channel ?? 'Inbox';

  const rawAuth = raw.auth ?? {};
  const auth = {
    admin_api_key_env_var:
      rawAuth.admin_api_key_env_var ?? 'ZORTER_ADMIN_API_KEY',
    read_api_key_env_var:
      rawAuth.read_api_key_env_var ?? 'ZORTER_READ_API_KEY',
    required:
      typeof rawAuth.required === 'boolean' ? rawAuth.required : true,
  };

  const rawFiles = raw.files ?? {};
  const base_files_dir: string =
    rawFiles.base_files_dir ?? path.join(base_dir, 'files');
  const path_template: string =
    rawFiles.path_template ??
    '{baseFilesDir}/{channel}/{date}/{eventId}/{filename}';
  const filename_strategy =
    rawFiles.filename_strategy ?? 'original';
  const keep_base64_in_envelope =
    typeof rawFiles.keep_base64_in_envelope === 'boolean'
      ? rawFiles.keep_base64_in_envelope
      : false;

  const files = {
    enabled:
      typeof rawFiles.enabled === 'boolean' ? rawFiles.enabled : true,
    base_files_dir,
    path_template,
    filename_strategy,
    keep_base64_in_envelope,
  };

  const types = raw.types ?? {};
  const workflows = raw.workflows ?? {};
  const tools = raw.tools ?? {};

  const config: ZorterConfig = {
    zorter: {
      base_dir,
      db_path,
      default_channel,
    },
    auth,
    files,
    types,
    workflows,
    tools,
  };

  return config;
}

export function loadRoutesConfig(baseDir: string): RoutesConfig | undefined {
  const routesPath = path.join(baseDir, 'routes.json');
  if (!fs.existsSync(routesPath)) {
    return undefined;
  }
  const text = fs.readFileSync(routesPath, 'utf8');
  const raw = JSON.parse(text);
  if (!raw.profiles || typeof raw.profiles !== 'object') {
    throw new Error('routes.json must contain a "profiles" object');
  }
  return raw as RoutesConfig;
}
