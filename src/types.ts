
export interface ZorterSection {
  base_dir: string;
  db_path: string;
  default_channel: string;
}

export interface AuthSection {
  admin_api_key_env_var: string;
  read_api_key_env_var?: string;
  required?: boolean;
}

export type FilenameStrategy = 'original' | 'timestampPrefix' | 'eventIdPrefix' | 'uuid';

export interface FilesSection {
  enabled: boolean;
  base_files_dir: string;
  path_template: string;
  filename_strategy: FilenameStrategy;
  keep_base64_in_envelope?: boolean;
}

export interface TypeDefinition {
  description?: string;
  channel?: string;
  payload_example?: string;
  // Arbitrary additional metadata
  [key: string]: unknown;
}

export interface WorkflowDefinition {
  type: string;
  description?: string;
  files_path_template?: string;
  append_to_file?: string;
  route_profile?: string;
  // Arbitrary additional metadata
  [key: string]: unknown;
}

export interface ZorterConfig {
  zorter: ZorterSection;
  auth: AuthSection;
  files: FilesSection;
  types: Record<string, TypeDefinition>;
  workflows: Record<string, WorkflowDefinition>;
  tools?: Record<string, unknown>;
}

export interface Base64AttachmentInput {
  filename: string;
  mimeType?: string;
  base64: string;
}

export interface BinaryAttachmentInput {
  filename: string;
  mimeType?: string;
  buffer: Buffer;
  fieldName?: string;
}

export type AttachmentInput = Base64AttachmentInput | BinaryAttachmentInput;

export interface AttachmentEnvelope {
  id: string;
  filename: string;
  originalFilename?: string;
  mimeType?: string;
  size?: number;
  path: string;
  source: 'base64' | 'multipart';
  base64?: string;
}

export interface ItemEnvelope {
  id: string;
  type: string;
  source?: string;
  channel: string;
  payload: unknown;
  attachments: AttachmentEnvelope[];
  meta?: unknown;
  createdAt: string;
}

export interface ItemIndexRow {
  id: string;
  type: string;
  channel: string;
  createdAt: string;
  filePath: string;
  fileDir: string | null;
  attachmentsCount: number;
  hasAttachments: boolean;
  claimedBy?: string | null;
  claimedAt?: string | null;
  summary?: string | null;
}

export interface ItemView {
  id: string;
  type: string;
  channel: string;
  createdAt: string;
  hasAttachments: boolean;
  attachmentsCount: number;
}

export interface ItemFilters {
  type?: string;
  channel?: string;
  since?: string;
  until?: string;
}

export interface QueryItemsResult {
  items: ItemView[];
  nextCursor: string | null;
}

export interface RoutesConfig {
  profiles: Record<string, RouteProfile>;
}

export interface RouteProfile {
  kind?: 'http' | 'noop';
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  enabled?: boolean;
  timeoutMs?: number;
  description?: string;
}

export interface NewItemInput {
  type: string;
  payload: unknown;
  channel?: string;
  source?: string;
  meta?: unknown;
}

export interface AttachmentContext {
  id: string;
  type: string;
  channel: string;
  createdAt: string;
  date: string;
}
