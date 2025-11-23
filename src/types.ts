/**
 * Type definitions for Zorter, all derived from Zod schemas.
 * This ensures types stay in sync with runtime validation.
 *
 * All types are exported from this module to provide a single source of truth
 * for TypeScript types across the codebase. The types are generated from Zod
 * schemas using type inference, ensuring runtime validation and TypeScript
 * types are always aligned.
 */

import type {
  AttachmentContext as ZodAttachmentContext,
  AttachmentEnvelope as ZodAttachmentEnvelope,
  AttachmentInput as ZodAttachmentInput,
  AuthSection as ZodAuthSection,
  Base64AttachmentInput as ZodBase64AttachmentInput,
  BinaryAttachmentInput as ZodBinaryAttachmentInput,
  FilenameStrategy as ZodFilenameStrategy,
  FilesSection as ZodFilesSection,
  ItemEnvelope as ZodItemEnvelope,
  ItemFilters as ZodItemFilters,
  ItemIndexRow as ZodItemIndexRow,
  ItemView as ZodItemView,
  NewItemInput as ZodNewItemInput,
  QueryItemsResult as ZodQueryItemsResult,
  RouteProfile as ZodRouteProfile,
  RoutesConfig as ZodRoutesConfig,
  TypeDefinition as ZodTypeDefinition,
  WorkflowDefinition as ZodWorkflowDefinition,
  ZorterConfig as ZodZorterConfig,
  ZorterSection as ZodZorterSection,
} from "./schemas";

// Configuration types

/**
 * Core Zorter configuration section.
 * Defines base directory, database path, and default channel.
 */
export type ZorterSection = ZodZorterSection;

/**
 * Authentication configuration section.
 * Defines API key environment variables and auth requirements.
 */
export type AuthSection = ZodAuthSection;

/**
 * Strategy for generating attachment filenames.
 * - `original`: Keep original filename
 * - `timestampPrefix`: Prefix with sanitized timestamp
 * - `eventIdPrefix`: Prefix with event/item ID
 * - `uuid`: Generate new UUID for filename
 */
export type FilenameStrategy = ZodFilenameStrategy;

/**
 * File attachment configuration section.
 * Defines storage paths, filename strategies, and base64 handling.
 */
export type FilesSection = ZodFilesSection;

/**
 * Type definition for custom item types.
 * Associates type names with default channels and metadata.
 */
export type TypeDefinition = ZodTypeDefinition;

/**
 * Workflow definition configuring side effects for item types.
 * Supports file appending and HTTP routing.
 */
export type WorkflowDefinition = ZodWorkflowDefinition;

/**
 * Complete Zorter configuration loaded from TOML.
 * Contains all configuration sections with validated defaults.
 */
export type ZorterConfig = ZodZorterConfig;

// Attachment input types

/**
 * Base64-encoded attachment input from JSON requests.
 * Contains filename, optional MIME type, and base64 data.
 */
export type Base64AttachmentInput = ZodBase64AttachmentInput;

/**
 * Binary attachment input from multipart requests.
 * Contains filename, optional MIME type, Buffer, and form field name.
 */
export type BinaryAttachmentInput = ZodBinaryAttachmentInput;

/**
 * Union of all attachment input types.
 * Can be either base64 (JSON) or binary (multipart).
 */
export type AttachmentInput = ZodAttachmentInput;

// Envelope and storage types

/**
 * Stored attachment envelope with file path and metadata.
 * Created after processing and storing an attachment to disk.
 */
export type AttachmentEnvelope = ZodAttachmentEnvelope;

/**
 * Complete item envelope containing payload, attachments, and metadata.
 * This is the canonical representation of an item stored in the inbox.
 */
export type ItemEnvelope = ZodItemEnvelope;

/**
 * Item index row stored in SQLite for fast querying.
 * Contains denormalized metadata without full payload.
 */
export type ItemIndexRow = ZodItemIndexRow;

/**
 * Lightweight item view returned by list/query endpoints.
 * Contains only essential metadata, not full payload.
 */
export type ItemView = ZodItemView;

/**
 * Query filters for listing items.
 * Supports filtering by type, channel, and time range.
 */
export type ItemFilters = ZodItemFilters;

/**
 * Paginated query result with items and next cursor.
 * Used for cursor-based pagination in list endpoints.
 */
export type QueryItemsResult = ZodQueryItemsResult;

// Routes configuration types

/**
 * Routes configuration loaded from routes.json.
 * Defines HTTP routing profiles for workflow integration.
 */
export type RoutesConfig = ZodRoutesConfig;

/**
 * HTTP route profile for posting items to external systems.
 * Configures URL, method, headers, and timeout.
 */
export type RouteProfile = ZodRouteProfile;

// API input types

/**
 * Input payload for creating a new item via POST /items.
 * Contains type, payload, optional channel, source, and metadata.
 */
export type NewItemInput = ZodNewItemInput;

// Context types

/**
 * Context object for attachment processing.
 * Contains item metadata needed for path generation and filename strategies.
 */
export type AttachmentContext = ZodAttachmentContext;
