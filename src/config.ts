import fs from "node:fs";
import path from "node:path";
import { parse } from "toml";
import { RoutesConfigSchema, ZorterConfigSchema } from "./schemas";
import type { RoutesConfig, ZorterConfig } from "./types";
import { parseJsonAs } from "./utils/json.js";

/**
 * Load and validate Zorter configuration from TOML file.
 * Falls back to defaults when config file doesn't exist.
 *
 * @param baseDir - Base directory containing zorter.config.toml
 * @returns Validated ZorterConfig
 * @throws {Error} When TOML parsing fails or validation fails
 */
export function loadConfig(baseDir: string): ZorterConfig {
  const raw = parseTomlConfig(baseDir);
  const configWithDefaults = buildConfigWithDefaults(raw, baseDir);
  return validateConfig(configWithDefaults);
}

/**
 * Parse TOML config file, returning empty object if file doesn't exist.
 */
function parseTomlConfig(baseDir: string): Record<string, unknown> {
  const configPath = path.join(baseDir, "zorter.config.toml");

  if (!fs.existsSync(configPath)) {
    return {};
  }

  const text = fs.readFileSync(configPath, "utf8");
  try {
    return parse(text) as Record<string, unknown>;
  } catch (err) {
    throw new Error(
      `Failed to parse TOML at ${configPath}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Build config object with defaults merged with TOML values.
 */
function buildConfigWithDefaults(
  raw: Record<string, unknown>,
  baseDir: string
): unknown {
  const rawZorter = (raw.zorter ?? {}) as Record<string, unknown>;
  const rawAuth = (raw.auth ?? {}) as Record<string, unknown>;
  const rawFiles = (raw.files ?? {}) as Record<string, unknown>;

  const base_dir: string = (rawZorter.base_dir as string) ?? baseDir;
  const db_path: string =
    (rawZorter.db_path as string) ?? path.join(base_dir, "db", "zorter.db");
  const base_files_dir: string =
    (rawFiles.base_files_dir as string) ?? path.join(base_dir, "files");

  return {
    zorter: {
      base_dir,
      db_path,
      default_channel: (rawZorter.default_channel as string) ?? "Inbox",
    },
    auth: {
      admin_api_key_env_var:
        (rawAuth.admin_api_key_env_var as string) ?? "ZORTER_ADMIN_API_KEY",
      read_api_key_env_var: rawAuth.read_api_key_env_var as string | undefined,
      required: (rawAuth.required as boolean) ?? true,
    },
    files: {
      enabled: (rawFiles.enabled as boolean) ?? true,
      base_files_dir,
      path_template:
        (rawFiles.path_template as string) ??
        "{baseFilesDir}/{channel}/{date}/{eventId}/{filename}",
      filename_strategy: rawFiles.filename_strategy ?? "original",
      keep_base64_in_envelope:
        (rawFiles.keep_base64_in_envelope as boolean) ?? false,
    },
    types: (raw.types ?? {}) as Record<string, unknown>,
    workflows: (raw.workflows ?? {}) as Record<string, unknown>,
    tools: raw.tools as Record<string, unknown> | undefined,
  };
}

/**
 * Validate config object using Zod schema.
 */
function validateConfig(config: unknown): ZorterConfig {
  try {
    return ZorterConfigSchema.parse(config);
  } catch (err) {
    throw new Error(
      `Configuration validation failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Load and validate routes configuration from JSON file.
 * Returns undefined when routes.json doesn't exist.
 *
 * @param baseDir - Base directory containing routes.json
 * @returns Validated RoutesConfig or undefined
 * @throws {Error} When JSON parsing fails or validation fails
 */
export function loadRoutesConfig(baseDir: string): RoutesConfig | undefined {
  const routesPath = path.join(baseDir, "routes.json");
  if (!fs.existsSync(routesPath)) {
    return;
  }

  const text = fs.readFileSync(routesPath, "utf8");

  try {
    return parseJsonAs(text, RoutesConfigSchema);
  } catch (err) {
    throw new Error(
      `Failed to load routes config from ${routesPath}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
