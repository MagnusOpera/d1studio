import { randomBytes } from 'node:crypto';
import { escapeHtml } from './html.js';
import type { D1QueryResult, QueryContext } from './types.js';

const MAX_RENDERED_ROWS = 1000;

export function renderResultsPage(
  context: QueryContext,
  sql: string,
  results: D1QueryResult[],
  error?: string
): string {
  const nonce = randomBytes(16).toString('base64');
  const content = error
    ? `<section class="error"><h2>Query failed</h2><p>${escapeHtml(error)}</p></section>`
    : renderResultTabs(results);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>D1 Results</title>
  <style nonce="${nonce}">
    body { color: var(--vscode-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); padding: 10px 12px; }
    h1 { font-size: 16px; margin: 0 0 2px; } h2 { font-size: 14px; margin-bottom: 6px; }
    .subtitle, .meta, .notice { color: var(--vscode-descriptionForeground); }
    pre { white-space: pre-wrap; background: var(--vscode-textCodeBlock-background); padding: 6px 8px; border-radius: 3px; margin: 6px 0; }
    section { margin-top: 10px; } .table-wrap { overflow: auto; max-height: 55vh; border: 1px solid var(--vscode-panel-border); }
    .result-tabs { display: flex; gap: 2px; margin-top: 12px; overflow-x: auto; border-bottom: 1px solid var(--vscode-panel-border); }
    .result-tab { border: 0; border-bottom: 2px solid transparent; color: var(--vscode-foreground); background: transparent; padding: 6px 10px; font: inherit; cursor: pointer; }
    .result-tab:hover { background: var(--vscode-list-hoverBackground); }
    .result-tab[aria-selected="true"] { border-bottom-color: var(--vscode-focusBorder); background: var(--vscode-editorGroupHeader-tabsBackground); }
    .result-tab:focus-visible { outline: 2px solid var(--vscode-focusBorder); outline-offset: -2px; }
    .result-panel[hidden] { display: none; }
    table { border-collapse: collapse; min-width: 100%; font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size); }
    th { position: sticky; top: 0; background: var(--vscode-editorGroupHeader-tabsBackground); text-align: left; }
    th, td { border: 1px solid var(--vscode-panel-border); padding: 4px 7px; white-space: pre; vertical-align: top; outline: none; }
    th:focus, td:focus { outline: 2px solid var(--vscode-focusBorder); outline-offset: -2px; background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
    tr:nth-child(even) { background: var(--vscode-list-hoverBackground); } .null { color: var(--vscode-descriptionForeground); font-style: italic; }
    .error { border-left: 3px solid var(--vscode-errorForeground); padding-left: 12px; }
  </style>
</head>
<body>
  <h1>${escapeHtml(context.databaseName)}</h1>
  <div class="subtitle">Cloudflare D1 query results</div>
  <pre>${escapeHtml(sql)}</pre>
  ${content}
  <script nonce="${nonce}">
    const tabs = Array.from(document.querySelectorAll('[role="tab"]'));

    function activateTab(tab, focus) {
      for (const candidate of tabs) {
        const selected = candidate === tab;
        candidate.setAttribute('aria-selected', String(selected));
        candidate.tabIndex = selected ? 0 : -1;
        const panel = document.getElementById(candidate.getAttribute('aria-controls'));
        if (panel) panel.hidden = !selected;
      }
      if (focus) tab.focus();
    }

    for (const tab of tabs) {
      tab.addEventListener('click', () => activateTab(tab, false));
      tab.addEventListener('keydown', event => {
        const index = tabs.indexOf(tab);
        let nextIndex;
        if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
        else if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
        else if (event.key === 'Home') nextIndex = 0;
        else if (event.key === 'End') nextIndex = tabs.length - 1;
        else if (event.key === 'Enter' || event.key === ' ') nextIndex = index;
        else return;
        event.preventDefault();
        activateTab(tabs[nextIndex], true);
      });
    }

    document.addEventListener('keydown', event => {
      const cell = event.target.closest('[role="columnheader"], [role="gridcell"]');
      if (!cell) return;
      const table = cell.closest('table');
      const row = cell.parentElement;
      let rowIndex = row.rowIndex;
      let columnIndex = cell.cellIndex;
      if (event.key === 'ArrowUp') rowIndex--;
      else if (event.key === 'ArrowDown') rowIndex++;
      else if (event.key === 'ArrowLeft') columnIndex--;
      else if (event.key === 'ArrowRight') columnIndex++;
      else if (event.key === 'Home') columnIndex = 0;
      else if (event.key === 'End') columnIndex = row.cells.length - 1;
      else return;
      const targetRow = table.rows[rowIndex];
      const target = targetRow && targetRow.cells[Math.min(columnIndex, targetRow.cells.length - 1)];
      if (target) { event.preventDefault(); target.focus(); }
    });
  </script>
</body>
</html>`;
}

function renderResultTabs(results: D1QueryResult[]): string {
  if (!results.length) {
    return '<section><p>No result was returned.</p></section>';
  }

  const tabs = results.map((_result, index) => {
    const selected = index === 0;
    return `<button class="result-tab" id="result-tab-${index}" role="tab" aria-selected="${selected}" aria-controls="result-panel-${index}" tabindex="${selected ? 0 : -1}">Result ${index + 1}</button>`;
  }).join('');
  const panels = results.map((result, index) => renderResultPanel(result, index)).join('');
  return `<div class="result-tabs" role="tablist" aria-label="Query results">${tabs}</div>${panels}`;
}

function renderResultPanel(result: D1QueryResult, index: number): string {
  const rows = result.results ?? [];
  const columns = collectColumns(rows);
  const visibleRows = rows.slice(0, MAX_RENDERED_ROWS);
  const meta = result.meta;
  const metadata = [
    meta?.changes !== undefined ? `${meta.changes} change(s)` : undefined,
    meta?.rows_read !== undefined ? `${meta.rows_read} row(s) read` : undefined,
    meta?.rows_written !== undefined ? `${meta.rows_written} row(s) written` : undefined,
    meta?.duration !== undefined ? `${formatNumber(meta.duration)} ms` : undefined,
    meta?.last_row_id !== undefined ? `last row ID ${meta.last_row_id}` : undefined
  ].filter((value): value is string => Boolean(value)).join(' · ');

  let body: string;
  if (!rows.length) {
    body = '<p>No rows returned.</p>';
  } else {
    const header = columns.map(column => `<th role="columnheader" tabindex="0">${escapeHtml(column)}</th>`).join('');
    const tableRows = visibleRows.map(row => `<tr>${columns.map(column => renderCell(row[column])).join('')}</tr>`).join('');
    body = `<div class="table-wrap"><table role="grid" aria-label="D1 query result ${index + 1}"><thead><tr>${header}</tr></thead><tbody>${tableRows}</tbody></table></div>`;
    if (rows.length > visibleRows.length) {
      body += `<p class="notice">Showing the first ${MAX_RENDERED_ROWS} of ${rows.length} returned rows.</p>`;
    }
  }

  return `<section class="result-panel" id="result-panel-${index}" role="tabpanel" aria-labelledby="result-tab-${index}"${index === 0 ? '' : ' hidden'}>${metadata ? `<p class="meta">${escapeHtml(metadata)}</p>` : ''}${body}</section>`;
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

function renderCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '<td role="gridcell" tabindex="0" class="null">NULL</td>';
  }
  return `<td role="gridcell" tabindex="0">${escapeHtml(formatValue(value))}</td>`;
}

function formatValue(value: unknown): string {
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: 3 }) : String(value);
}
