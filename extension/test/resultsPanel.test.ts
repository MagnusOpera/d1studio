import { describe, expect, it } from 'vitest';
import { escapeHtml } from '../src/html.js';
import { renderResultsPage } from '../src/resultsPage.js';

describe('results webview safety', () => {
  it('escapes all HTML-significant output', () => {
    expect(escapeHtml(`<script data-x="1">'&`)).toBe(
      '&lt;script data-x=&quot;1&quot;&gt;&#39;&amp;'
    );
  });

  it('escapes database, metadata, columns, and cell values without embedding SQL', () => {
    const html = renderResultsPage(
      { databaseId: 'db', databaseName: '<Database>' },
      [{ results: [{ '<column>': '<script>' }], meta: { changes: 0 } }]
    );

    expect(html).toContain('&lt;Database&gt;');
    expect(html).toContain('&lt;column&gt;');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<pre>');
    expect(html).not.toContain('SELECT');
    expect(html).not.toContain('<script>');
    expect(html).toMatch(/script-src 'nonce-[^']+'/);
  });
});

describe('results tabs', () => {
  it('renders ordered accessible tabs and panels for multiple statement results', () => {
    const html = renderResultsPage(
      { databaseId: 'db', databaseName: 'Example' },
      [
        { results: [{ value: 1 }], meta: { rows_read: 1 } },
        { results: [{ value: 2 }], meta: { rows_read: 1 } }
      ]
    );

    expect(html).toContain('role="tablist"');
    expect(html).toContain('id="result-tab-0" role="tab" aria-selected="true"');
    expect(html).toContain('id="result-tab-1" role="tab" aria-selected="false"');
    expect(html).toContain('id="result-panel-0" role="tabpanel" aria-labelledby="result-tab-0"');
    expect(html).toContain('id="result-panel-1" role="tabpanel" aria-labelledby="result-tab-1" hidden');
    expect(html).toContain('Result 1');
    expect(html).toContain('Result 2');
    expect(html).toContain('activateTab');
  });

  it('keeps no-row statement metadata in its own result tab', () => {
    const html = renderResultsPage(
      { databaseId: 'db', databaseName: 'Example' },
      [
        { results: [], meta: { changes: 2, rows_written: 2, changed_db: true } },
        { results: [{ id: 1 }], meta: { rows_read: 1 } }
      ]
    );

    expect(html).toContain('2 change(s) · 2 row(s) written');
    expect(html).toContain('No rows returned.');
    expect(html).toContain('D1 query result 2');
  });

  it('shows a fallback when Cloudflare returns no result entries', () => {
    const html = renderResultsPage(
      { databaseId: 'db', databaseName: 'Example' },
      []
    );

    expect(html).toContain('No result was returned.');
    expect(html).not.toContain('role="tablist"');
  });

  it('caps each rendered result at 1000 rows', () => {
    const rows = Array.from({ length: 1001 }, (_value, index) => ({ index }));
    const html = renderResultsPage(
      { databaseId: 'db', databaseName: 'Example' },
      [{ results: rows }]
    );

    expect(html).toContain('Showing the first 1000 of 1001 returned rows.');
    expect(html).not.toContain('<td role="gridcell" tabindex="0">1000</td>');
  });
});
