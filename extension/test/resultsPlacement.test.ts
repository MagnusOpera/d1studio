import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('results placement', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/resultsPanel.ts'), 'utf8');

  it('splits the query downward and opens a grid in the lower editor group', () => {
    expect(source).toContain('vscode.window.createWebviewPanel');
    expect(source).toContain('workbench.action.splitEditorDown');
    expect(source).toContain('workbench.action.closeOtherEditors');
    expect(source).toContain('vscode.ViewColumn.Active');
    expect(source).not.toContain('vscode.ViewColumn.Beside');
    expect(source).not.toContain('d1Studio.results.focus');
    expect(source).not.toContain('workbench.view.extension');
  });
});
