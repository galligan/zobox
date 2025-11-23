import { z } from "zod";

// ============================================================================
// Configuration Schemas
// ============================================================================

/**
 * Schema for the [zobox] section of zobox.config.toml
 */
export const ZoboxSectionSchema = z.object({
  base_dir: z.string().min(1, "base_dir must not be empty"),
  db_path: z.string().min(1, "db_path must not be empty"),
  default_channel: z.string().min(1, "default_channel must not be empty"),
});

export type ZoboxSection = z.infer<typeof ZoboxSectionSchema>;

/**
 * Schema for the [auth] section of zobox.config.toml
 */
export const AuthSectionSchema = z.object({
  admin_api_key_env_var: z
    .string()
    .min(1, "admin_api_key_env_var must not be empty")
    .regex(
      /^[A-Z][A-Z0-9_]*$/,
      "admin_api_key_env_var must be UPPER_SNAKE_CASE"
    ),
  read_api_key_env_var: z
    .string()
    .min(1)
    .regex(/^[A-Z][A-Z0-9_]*$/, "read_api_key_env_var must be UPPER_SNAKE_CASE")
    .optional(),
  required: z.boolean().default(true),
});

export type AuthSection = z.infer<typeof AuthSectionSchema>;

/**
 * Valid filename strategies for file attachments
 */
export const FilenameStrategySchema = z.enum([
  "original",
  "timestampPrefix",
  "eventIdPrefix",
  "uuid",
]);

export type FilenameStrategy = z.infer<typeof FilenameStrategySchema>;

/**
 * Schema for the [files] section of zobox.config.toml
 */
export const FilesSectionSchema = z.object({
  enabled: z.boolean().default(true),
  base_files_dir: z.string().min(1, "base_files_dir must not be empty"),
  path_template: z
    .string()
    .min(1, "path_template must not be empty")
    .refine(
      (val) =>
        val.includes("{filename}") ||
        val.includes("{baseFilesDir}") ||
        val.includes("{channel}") ||
        val.includes("{date}") ||
        val.includes("{eventId}") ||
        val.includes("{timestamp}"),
      "path_template should contain at least one template token"
    ),
  filename_strategy: FilenameStrategySchema.default("original"),
  keep_base64_in_envelope: z.boolean().default(false),
});

export type FilesSection = z.infer<typeof FilesSectionSchema>;

/**
 * Schema for a type definition [types.<name>]
 * Additional metadata is allowed via catchAll
 */
export const TypeDefinitionSchema = z
  .object({
    description: z.string().optional(),
    channel: z.string().optional(),
    payload_example: z.string().optional(),
  })
  .catchall(z.unknown());

export type TypeDefinition = z.infer<typeof TypeDefinitionSchema>;

/**
 * Schema for a workflow definition [sorters.<name>]
 * Additional metadata is allowed via catchAll
 */
export const SorterDefinitionSchema = z
  .object({
    type: z.string().min(1, "workflow type must not be empty"),
    description: z.string().optional(),
    files_path_template: z.string().optional(),
    append_to_file: z.string().optional(),
    destination: z.string().optional(),
  })
  .catchall(z.unknown());

export type SorterDefinition = z.infer<typeof SorterDefinitionSchema>;

/**
 * Complete schema for zobox.config.toml
 */
export const ZoboxConfigSchema = z.object({
  zobox: ZoboxSectionSchema,
  auth: AuthSectionSchema,
  files: FilesSectionSchema,
  types: z.record(z.string(), TypeDefinitionSchema).default({}),
  sorters: z.record(z.string(), SorterDefinitionSchema).default({}),
  tools: z.record(z.string(), z.unknown()).optional(),
});

export type ZoboxConfig = z.infer<typeof ZoboxConfigSchema>;

// ============================================================================
// Routes Configuration Schemas
// ============================================================================

/**
 * Schema for a route profile in routes.json
 */
export const DestinationSchema = z.object({
  kind: z.enum(["http", "noop"]).default("http"),
  url: z.string().url().optional(),
  method: z
    .string()
    .regex(/^(GET|POST|PUT|PATCH|DELETE)$/i, "method must be a valid HTTP verb")
    .optional(),
  headers: z.record(z.string(), z.string()).optional(),
  enabled: z.boolean().default(true),
  timeoutMs: z.number().int().positive().max(60_000).optional(),
  description: z.string().optional(),
});

export type Destination = z.infer<typeof DestinationSchema>;

/**
 * Schema for routes.json
 */
export const DestinationsConfigSchema = z.object({
  profiles: z.record(z.string(), DestinationSchema),
});

export type DestinationsConfig = z.infer<typeof DestinationsConfigSchema>;

// ============================================================================
// API Input Schemas
// ============================================================================

/**
 * Schema for new item input via POST /items
 */
export const NewMessageInputSchema = z.object({
  type: z.string().min(1, "type must not be empty"),
  payload: z.unknown(),
  channel: z.string().optional(),
  source: z.string().optional(),
  meta: z.unknown().optional(),
  tags: z.array(z.string().min(1).max(50)).max(20).optional(),
});

export type NewMessageInput = z.infer<typeof NewMessageInputSchema>;

/**
 * Schema for base64-encoded attachment input
 */
export const Base64AttachmentInputSchema = z.object({
  filename: z.string().min(1, "filename must not be empty"),
  mimeType: z.string().optional(),
  base64: z.string().min(1, "base64 data must not be empty"),
});

export type Base64AttachmentInput = z.infer<typeof Base64AttachmentInputSchema>;

/**
 * Schema for binary attachment input (from multipart form data)
 * Note: Buffer cannot be validated by Zod at runtime, so we use z.custom
 */
export const BinaryAttachmentInputSchema = z.object({
  filename: z.string().min(1, "filename must not be empty"),
  mimeType: z.string().optional(),
  buffer: z.custom<Buffer>(
    (val) => Buffer.isBuffer(val),
    "buffer must be a Buffer instance"
  ),
  fieldName: z.string().optional(),
});

export type BinaryAttachmentInput = z.infer<typeof BinaryAttachmentInputSchema>;

/**
 * Union schema for attachment inputs
 */
export const AttachmentInputSchema = z.union([
  Base64AttachmentInputSchema,
  BinaryAttachmentInputSchema,
]);

export type AttachmentInput = z.infer<typeof AttachmentInputSchema>;

// ============================================================================
// Tag Schemas
// ============================================================================

/**
 * Schema for a tag (canonical tag record)
 */
export const TagSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).max(50),
  description: z.string().optional(),
  color: z.string().optional(),
  createdAt: z.string().datetime(),
  createdBy: z.string().default("system"),
  metadata: z.unknown().optional(),
});

export type Tag = z.infer<typeof TagSchema>;

/**
 * Schema for tag with usage count (for listing/analytics)
 */
export const TagWithUsageSchema = TagSchema.extend({
  usageCount: z.number().int().nonnegative(),
});

export type TagWithUsage = z.infer<typeof TagWithUsageSchema>;

/**
 * Schema for message-tag relationship
 */
export const MessageTagSchema = z.object({
  messageId: z.string(),
  tagId: z.number().int().positive(),
  createdAt: z.string().datetime(),
  addedBy: z.string().default("system"),
  source: z.enum(["user", "sorter", "api", "ml"]).default("user"),
  metadata: z.unknown().optional(),
});

export type MessageTag = z.infer<typeof MessageTagSchema>;

/**
 * Schema for tag merge request
 */
export const MergeTagsInputSchema = z.object({
  sourceTagIds: z.array(z.number().int().positive()).min(1),
  targetTagId: z.number().int().positive().optional(),
  newName: z.string().min(1).max(50).optional(),
});

export type MergeTagsInput = z.infer<typeof MergeTagsInputSchema>;

// ============================================================================
// Envelope & Storage Schemas
// ============================================================================

/**
 * Schema for attachment envelope (stored in item JSON)
 */
export const AttachmentEnvelopeSchema = z.object({
  id: z.string(),
  filename: z.string(),
  originalFilename: z.string().optional(),
  mimeType: z.string().optional(),
  size: z.number().int().nonnegative().optional(),
  path: z.string(),
  source: z.enum(["base64", "multipart"]),
  base64: z.string().optional(),
});

export type AttachmentEnvelope = z.infer<typeof AttachmentEnvelopeSchema>;

/**
 * Schema for item envelope (stored in filesystem)
 */
export const MessageEnvelopeSchema = z.object({
  id: z.string(),
  type: z.string(),
  source: z.string().optional(),
  channel: z.string(),
  payload: z.unknown(),
  attachments: z.array(AttachmentEnvelopeSchema).default([]),
  meta: z.unknown().optional(),
  createdAt: z.string().datetime(),
  tags: z.array(z.string().min(1).max(50)).max(20).default([]),
});

export type MessageEnvelope = z.infer<typeof MessageEnvelopeSchema>;

/**
 * Schema for item index row (SQLite table)
 */
export const MessageIndexRowSchema = z.object({
  id: z.string(),
  type: z.string(),
  channel: z.string(),
  createdAt: z.string().datetime(),
  filePath: z.string(),
  fileDir: z.string().nullable(),
  attachmentsCount: z.number().int().nonnegative(),
  hasAttachments: z.boolean(),
  subscribedBy: z.string().nullable().optional(),
  subscribedAt: z.string().datetime().nullable().optional(),
  summary: z.string().nullable().optional(),
  tags: z.string().nullable().optional(), // JSON string in SQLite
});

export type MessageIndexRow = z.infer<typeof MessageIndexRowSchema>;

/**
 * Schema for item view (API response projection)
 */
export const MessageViewSchema = z.object({
  id: z.string(),
  type: z.string(),
  channel: z.string(),
  createdAt: z.string().datetime(),
  hasAttachments: z.boolean(),
  attachmentsCount: z.number().int().nonnegative(),
  tags: z.array(TagSchema).default([]),
});

export type MessageView = z.infer<typeof MessageViewSchema>;

/**
 * Schema for item filters (query parameters)
 */
export const MessageFiltersSchema = z.object({
  type: z.string().optional(),
  channel: z.string().optional(),
  since: z.string().datetime().optional(),
  until: z.string().datetime().optional(),
  tags: z.string().optional(), // Comma-separated tags for filtering
});

export type MessageFilters = z.infer<typeof MessageFiltersSchema>;

/**
 * Schema for query items result
 */
export const QueryMessagesResultSchema = z.object({
  items: z.array(MessageViewSchema),
  nextCursor: z.string().nullable(),
});

export type QueryMessagesResult = z.infer<typeof QueryMessagesResultSchema>;

/**
 * Schema for attachment context (used during processing)
 */
export const AttachmentContextSchema = z.object({
  id: z.string(),
  type: z.string(),
  channel: z.string(),
  createdAt: z.string().datetime(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
});

export type AttachmentContext = z.infer<typeof AttachmentContextSchema>;
