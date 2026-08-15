import type { SchemaEntry } from './types.js';
import { format } from 'sql-formatter';

export const SCHEMA_SQL = `
SELECT type, name, tbl_name, sql
FROM sqlite_schema
WHERE type IN ('table', 'view', 'index', 'trigger')
  AND name NOT LIKE 'sqlite_%'
  AND name NOT LIKE '_cf_%'
ORDER BY type, name
`.trim();

export function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

export function tableContentSql(tableName: string): string {
  return `SELECT * FROM ${quoteIdentifier(tableName)} LIMIT 1000`;
}

export function executableDdl(sql: string): string {
  const trimmed = sql.trim();
  return trimmed.endsWith(';') ? trimmed : `${trimmed};`;
}

export function formattedDdl(sql: string): string {
  return format(executableDdl(sql), {
    language: 'sqlite',
    keywordCase: 'upper',
    tabWidth: 2,
    useTabs: false,
    linesBetweenQueries: 1
  }).trim();
}

export function parseSchemaRows(rows: Array<Record<string, unknown>>): SchemaEntry[] {
  return rows.flatMap(row => {
    if (
      (row.type !== 'table' && row.type !== 'view' && row.type !== 'index' && row.type !== 'trigger') ||
      typeof row.name !== 'string'
    ) {
      return [];
    }
    return [{
      type: row.type,
      name: row.name,
      tbl_name: typeof row.tbl_name === 'string' ? row.tbl_name : row.name,
      sql: typeof row.sql === 'string' ? row.sql : null
    } satisfies SchemaEntry];
  });
}
