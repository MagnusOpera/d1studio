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
  assert.ok(commands.includes('workbench.action.splitEditorDown'));
  assert.ok(commands.includes('workbench.action.closeOtherEditors'));
}
