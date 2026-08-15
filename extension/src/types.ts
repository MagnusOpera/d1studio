export interface D1Database {
  uuid: string;
  name: string;
  created_at?: string;
  version?: string;
  jurisdiction?: 'eu' | 'fedramp' | 'us';
}

export interface D1QueryMeta {
  changed_db?: boolean;
  changes?: number;
  duration?: number;
  last_row_id?: number;
  rows_read?: number;
  rows_written?: number;
  served_by_colo?: string;
  served_by_primary?: boolean;
  served_by_region?: string;
  size_after?: number;
  timings?: { sql_duration_ms?: number };
}

export interface D1QueryResult {
  success?: boolean;
  results?: Array<Record<string, unknown>>;
  meta?: D1QueryMeta;
}

export interface SchemaEntry {
  type: 'table' | 'view' | 'index' | 'trigger';
  name: string;
  tbl_name: string;
  sql: string | null;
}

export interface QueryContext {
  databaseId: string;
  databaseName: string;
}

export type CloudflareErrorKind =
  | 'authentication'
  | 'account'
  | 'permission'
  | 'write-permission'
  | 'rate-limit'
  | 'sql'
  | 'network'
  | 'timeout'
  | 'api';

export interface CloudflareErrorDetail {
  code?: number;
  message: string;
}

export interface ExtensionLogger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string | Error, ...args: unknown[]): void;
}
