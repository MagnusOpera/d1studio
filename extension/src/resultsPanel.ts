import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import { escapeHtml } from './html.js';
import type { D1QueryResult, ExtensionLogger, QueryContext } from './types.js';

const MAX_RENDERED_ROWS = 1000;

interface SourceEditor {
  document: vscode.TextDocument;
  viewColumn: vscode.ViewColumn;
}

export class ResultsPanel implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;

  constructor(private readonly logger?: ExtensionLogger) {}

  showResults(context: QueryContext, sql: string, results: D1QueryResult[]): void {
    this.logger?.debug(`Rendering ${results.length} result set(s) in the D1 results grid.`);
    void this.show(`D1 Results: ${context.databaseName}`, renderPage(context, sql, results));
  }

  showError(context: QueryContext, sql: string, message: string): void {
    this.logger?.debug('Rendering a query error in the D1 results grid.');
    void this.show(`D1 Error: ${context.databaseName}`, renderPage(context, sql, [], message));
  }

  dispose(): void {
    this.panel?.dispose();
    this.panel = undefined;
  }

  private async show(title: string, html: string): Promise<void> {
    const sourceEditor = captureSourceEditor();
    try {
      if (!this.panel) {
        if (sourceEditor) {
          this.logger?.debug('Splitting the D1 query editor downward for the results grid.');
          await vscode.commands.executeCommand('workbench.action.splitEditorDown');
        }
        this.logger?.debug('Creating the D1 results grid in the lower editor group.');
        this.panel = vscode.window.createWebviewPanel(
          'd1Studio.results',
          title,
          { viewColumn: vscode.ViewColumn.Active, preserveFocus: false },
          { enableScripts: true, retainContextWhenHidden: true }
        );
        this.panel.onDidDispose(() => {
          this.logger?.debug('D1 results grid was closed.');
          this.panel = undefined;
        });
      }
      this.panel.title = title;
      this.panel.webview.html = html;
      this.panel.reveal(this.panel.viewColumn ?? vscode.ViewColumn.Active, !sourceEditor);
      if (sourceEditor) {
        try {
          await vscode.commands.executeCommand('workbench.action.closeOtherEditors');
        } catch (error) {
          this.logger?.warn(`Could not close the duplicate query tab in the results group: ${error instanceof Error ? error.message : String(error)}`);
        }
        await vscode.window.showTextDocument(sourceEditor.document, {
          viewColumn: sourceEditor.viewColumn,
          preserveFocus: false
        });
      }
      this.logger?.debug('D1 results grid revealed below the query editor.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger?.error(`Unable to reveal the D1 results grid: ${message}`);
      void vscode.window.showErrorMessage(
        'D1 Studio could not open the results grid. Run “D1 Studio: Show Logs” for diagnostics.'
      );
    }
  }
}

function captureSourceEditor(): SourceEditor | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'd1-sql' || editor.viewColumn === undefined) {
    return undefined;
  }
  return { document: editor.document, viewColumn: editor.viewColumn };
}

function renderPage(
  context: QueryContext,
  sql: string,
  results: D1QueryResult[],
  error?: string
): string {
  const nonce = randomBytes(16).toString('base64');
  const sections = error
    ? `<section class="error"><h2>Query failed</h2><p>${escapeHtml(error)}</p></section>`
    : results.length
      ? results.map((result, index) => renderResult(result, index)).join('')
      : '<section><p>No result was returned.</p></section>';

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
  ${sections}
  <script nonce="${nonce}">
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

function renderResult(result: D1QueryResult, index: number): string {
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

  return `<section><h2>Statement ${index + 1}</h2>${metadata ? `<p class="meta">${escapeHtml(metadata)}</p>` : ''}${body}</section>`;
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
