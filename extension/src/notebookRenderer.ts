import type { NotebookResultOutput, ResultCellValue } from './notebookResults.js';

interface OutputItem {
  json(): unknown;
}

interface Renderer {
  renderOutputItem(outputItem: OutputItem, element: HTMLElement): void;
}

export function activate(): Renderer {
  return {
    renderOutputItem(outputItem, element) {
      const output = outputItem.json() as NotebookResultOutput;
      element.replaceChildren();
      installStyles(element);
      const root = append(element, 'div');
      root.className = 'd1studio-result';

      if (output.error) {
        const error = append(root, 'section');
        error.className = 'error';
        append(error, 'h4', 'Query failed');
        append(error, 'p', output.error);
        return;
      }

      if (!output.resultSets.length) {
        append(root, 'p', 'No result was returned.');
        return;
      }

      output.resultSets.forEach((result, index) => {
        const section = append(root, 'section');
        append(section, 'h4', `Result ${index + 1}`);
        if (result.metadata) {
          append(section, 'p', result.metadata).className = 'meta';
        }
        if (!result.rows.length) {
          append(section, 'p', 'No rows returned.');
          return;
        }

        const wrapper = append(section, 'div');
        wrapper.className = 'table-wrap';
        const table = append(wrapper, 'table');
        table.setAttribute('role', 'grid');
        table.setAttribute('aria-label', `D1 query result ${index + 1}`);
        const headerRow = append(append(table, 'thead'), 'tr');
        result.columns.forEach(column => appendCell(headerRow, 'th', column, 'columnheader'));
        const body = append(table, 'tbody');
        result.rows.forEach(row => {
          const tableRow = append(body, 'tr');
          row.forEach(value => appendCell(tableRow, 'td', formatValue(value), 'gridcell', value === null));
        });
        if (result.omittedRowCount > 0) {
          append(
            section,
            'p',
            `Showing the first ${result.rows.length} rows; ${result.omittedRowCount} additional row(s) were omitted.`
          ).className = 'notice';
        }
      });

      root.onkeydown = event => moveGridFocus(event);
    }
  };
}

function append<K extends keyof HTMLElementTagNameMap>(
  parent: Element,
  tag: K,
  text?: string
): HTMLElementTagNameMap[K] {
  const child = document.createElement(tag);
  if (text !== undefined) {
    child.textContent = text;
  }
  parent.append(child);
  return child;
}

function appendCell(
  row: HTMLTableRowElement,
  tag: 'th' | 'td',
  text: string,
  role: 'columnheader' | 'gridcell',
  isNull = false
): void {
  const cell = append(row, tag, text);
  cell.tabIndex = 0;
  cell.setAttribute('role', role);
  if (isNull) {
    cell.className = 'null';
  }
}

function formatValue(value: ResultCellValue): string {
  if (value === null) {
    return 'NULL';
  }
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function moveGridFocus(event: KeyboardEvent): void {
  const target = event.target;
  if (!(target instanceof HTMLTableCellElement)) {
    return;
  }
  const row = target.parentElement as HTMLTableRowElement | null;
  const table = target.closest('table');
  if (!row || !table) {
    return;
  }

  let rowIndex = row.rowIndex;
  let columnIndex = target.cellIndex;
  if (event.key === 'ArrowUp') rowIndex--;
  else if (event.key === 'ArrowDown') rowIndex++;
  else if (event.key === 'ArrowLeft') columnIndex--;
  else if (event.key === 'ArrowRight') columnIndex++;
  else if (event.key === 'Home') columnIndex = 0;
  else if (event.key === 'End') columnIndex = row.cells.length - 1;
  else return;

  const targetRow = table.rows.item(rowIndex);
  const next = targetRow?.cells.item(Math.min(columnIndex, targetRow.cells.length - 1));
  if (next) {
    event.preventDefault();
    next.focus();
  }
}

function installStyles(element: HTMLElement): void {
  const style = document.createElement('style');
  style.textContent = `
    .d1studio-result { box-sizing: border-box; width: 100%; min-width: 0; color: var(--vscode-foreground); font-family: var(--vscode-font-family); padding: 4px 0 10px; }
    .d1studio-result section + section { margin-top: 20px; }
    .d1studio-result h4 { font-size: 14px; margin: 0 0 6px; }
    .d1studio-result .meta, .d1studio-result .notice { color: var(--vscode-descriptionForeground); }
    .d1studio-result .meta { margin: 0 0 8px; }
    .d1studio-result .table-wrap { overflow: auto; max-height: 55vh; border: 1px solid var(--vscode-panel-border); }
    .d1studio-result table { border-collapse: collapse; min-width: 100%; font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size); }
    .d1studio-result th { position: sticky; top: 0; background: var(--vscode-editorGroupHeader-tabsBackground); text-align: left; }
    .d1studio-result th, .d1studio-result td { border: 1px solid var(--vscode-panel-border); padding: 4px 7px; white-space: pre; vertical-align: top; outline: none; }
    .d1studio-result th:focus, .d1studio-result td:focus { outline: 2px solid var(--vscode-focusBorder); outline-offset: -2px; background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
    .d1studio-result tr:nth-child(even) { background: var(--vscode-list-hoverBackground); }
    .d1studio-result .null { color: var(--vscode-descriptionForeground); font-style: italic; }
    .d1studio-result .error { border-left: 3px solid var(--vscode-errorForeground); padding-left: 12px; }
  `;
  element.append(style);
}
