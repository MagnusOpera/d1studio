import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('notebook placement', () => {
  const controller = readFileSync(resolve(process.cwd(), 'src/queryController.ts'), 'utf8');
  const notebooks = readFileSync(resolve(process.cwd(), 'src/queryNotebooks.ts'), 'utf8');
  const extension = readFileSync(resolve(process.cwd(), 'src/extension.ts'), 'utf8');

  it('opens a D1 notebook and renders results through cell execution', () => {
    expect(notebooks).toContain('vscode.workspace.openNotebookDocument');
    expect(notebooks).toContain('vscode.window.showNotebookDocument');
    expect(controller).toContain('vscode.notebooks.createNotebookController');
    expect(controller).toContain('execution.replaceOutput');
  });

  it('does not rearrange or close editor groups', () => {
    const source = `${controller}\n${notebooks}\n${extension}`;
    expect(source).not.toContain('createWebviewPanel');
    expect(source).not.toContain('splitEditorDown');
    expect(source).not.toContain('closeOtherEditors');
  });
});
