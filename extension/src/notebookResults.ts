import type { D1QueryResult } from './types.js';

export const D1_RESULT_MIME = 'application/vnd.d1studio.result+json';
export const MAX_RENDERED_ROWS = 1000;

export type ResultCellValue = string | number | boolean | null | ResultCellValue[] | {
  [key: string]: ResultCellValue;
};

export interface NotebookResultSet {
  columns: string[];
  rows: ResultCellValue[][];
  metadata: string;
  omittedRowCount: number;
}

export interface NotebookResultOutput {
  error?: string;
  resultSets: NotebookResultSet[];
}

export function createNotebookResultOutput(
  results: D1QueryResult[],
  error?: string
): NotebookResultOutput {
  return {
    error,
    resultSets: results.map(result => {
      const sourceRows = result.results ?? [];
      const columns = collectColumns(sourceRows);
      const visibleRows = sourceRows.slice(0, MAX_RENDERED_ROWS);
      return {
        columns,
        rows: visibleRows.map(row => columns.map(column => normalizeValue(row[column]))),
        metadata: formatMetadata(result),
        omittedRowCount: sourceRows.length - visibleRows.length
      };
    })
  };
}

function collectColumns(rows: Array<Record<string, unknown>>): string[] {
  const columns = new Set<string>();
  for (const row of rows) {
    for (const column of Object.keys(row)) {
      columns.add(column);
    }
  }
  return [...columns];
}

function formatMetadata(result: D1QueryResult): string {
  const meta = result.meta;
  return [
    meta?.changes !== undefined ? `${meta.changes} change(s)` : undefined,
    meta?.rows_read !== undefined ? `${meta.rows_read} row(s) read` : undefined,
    meta?.rows_written !== undefined ? `${meta.rows_written} row(s) written` : undefined,
    meta?.duration !== undefined ? `${formatNumber(meta.duration)} ms` : undefined,
    meta?.last_row_id !== undefined ? `last row ID ${meta.last_row_id}` : undefined
  ].filter((value): value is string => value !== undefined).join(' · ');
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

function normalizeValue(value: unknown): ResultCellValue {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : String(value);
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return value.map(normalizeValue);
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, normalizeValue(item)])
    );
  }
  return String(value);
}
