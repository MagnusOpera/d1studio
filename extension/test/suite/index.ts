import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';

export async function run(): Promise<void> {
  const extension = vscode.extensions.getExtension('magnusopera.cloudflare-d1-studio');
  assert.ok(extension, 'The extension should be installed in the extension host.');
  await extension.activate();

  const commands = await vscode.commands.getCommands(true);
  for (const command of [
    'd1Studio.configureCredentials',
    'd1Studio.clearCredentials',
    'd1Studio.refresh',
    'd1Studio.refreshDatabase',
    'd1Studio.newQuery',
    'd1Studio.viewTableContent',
    'd1Studio.executeSelection',
    'd1Studio.showLogs',
    'd1Studio.viewDdl'
  ]) {
    assert.ok(commands.includes(command), `${command} should be registered.`);
  }

  assert.equal(vscode.workspace.getConfiguration('d1Studio').get('accountId'), '');

  const cell = new vscode.NotebookCellData(vscode.NotebookCellKind.Code, 'select 1;', 'd1-sql');
  const notebook = await vscode.workspace.openNotebookDocument(
    'd1Studio.query',
    new vscode.NotebookData([cell])
  );
  assert.equal(notebook.notebookType, 'd1Studio.query');
  assert.equal(notebook.cellAt(0).document.languageId, 'd1-sql');

  const serialized = new TextEncoder().encode(JSON.stringify({
    version: 1,
    metadata: { d1Studio: { databaseId: 'database-id', databaseName: 'Integration test' } },
    cells: [{ kind: vscode.NotebookCellKind.Code, languageId: 'd1-sql', value: 'select 2;' }]
  }));
  const restored = await vscode.commands.executeCommand<vscode.NotebookData>(
    'vscode.executeDataToNotebook',
    'd1Studio.query',
    serialized
  );
  assert.equal(restored.cells[0]?.value, 'select 2;');
  assert.deepEqual(restored.metadata?.['d1Studio'], {
    databaseId: 'database-id',
    databaseName: 'Integration test'
  });
}
