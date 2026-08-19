import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createNotebookResultOutput,
  D1_RESULT_MIME,
  MAX_RENDERED_ROWS
} from '../src/notebookResults.js';

describe('notebook result output', () => {
  it('uses a dedicated rich-output mime type and preserves values as data', () => {
    const output = createNotebookResultOutput([{
      results: [{ unsafe: '<script>alert(1)</script>', missing: null, nested: { enabled: true } }],
      meta: { changes: 0, rows_read: 1, duration: 0.241 }
    }]);

    expect(D1_RESULT_MIME).toBe('application/vnd.d1studio.result+json');
    expect(output.resultSets[0]).toMatchObject({
      columns: ['unsafe', 'missing', 'nested'],
      rows: [['<script>alert(1)</script>', null, { enabled: true }]],
      metadata: '0 change(s) · 1 row(s) read · 0.241 ms',
      omittedRowCount: 0
    });
  });

  it('caps rendered rows without losing the omitted count', () => {
    const rows = Array.from({ length: MAX_RENDERED_ROWS + 3 }, (_, id) => ({ id }));
    const output = createNotebookResultOutput([{ results: rows }]);

    expect(output.resultSets[0]?.rows).toHaveLength(MAX_RENDERED_ROWS);
    expect(output.resultSets[0]?.omittedRowCount).toBe(3);
  });

  it('represents errors without a result set', () => {
    expect(createNotebookResultOutput([], 'permission denied')).toEqual({
      error: 'permission denied',
      resultSets: []
    });
  });

  it('renders returned values as text instead of executable markup', () => {
    const renderer = readFileSync(resolve(process.cwd(), 'src/notebookRenderer.ts'), 'utf8');
    expect(renderer).toContain("const root = append(element, 'div')");
    expect(renderer).not.toContain("element.className = 'd1studio-result'");
    expect(renderer).not.toContain('output.databaseName');
    expect(renderer).not.toContain('Cloudflare D1 query results');
    expect(renderer).toContain('.d1studio-result section + section { margin-top: 20px; }');
    expect(renderer).toContain('child.textContent = text');
    expect(renderer).not.toContain('.innerHTML');
    expect(renderer).not.toContain('insertAdjacentHTML');
  });
});
