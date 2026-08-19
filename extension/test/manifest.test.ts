import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const manifest = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as {
  contributes: {
    commands: Array<{ command: string }>;
    menus: {
      'notebook/cell/title': Array<{ command: string; when: string; group: string }>;
    };
    keybindings: Array<{ command: string; key: string; when: string }>;
    configuration: { properties: Record<string, unknown> };
    languages: Array<{ id: string }>;
    notebooks: Array<{ type: string; selector: Array<{ filenamePattern: string }> }>;
    notebookRenderer: Array<{ id: string; entrypoint: string; mimeTypes: string[] }>;
  };
};

describe('extension contributions', () => {
  it('exposes the documented commands and account setting', () => {
    const commandIds = manifest.contributes.commands.map(command => command.command);
    expect(commandIds).toEqual(expect.arrayContaining([
      'd1Studio.configureCredentials',
      'd1Studio.clearCredentials',
      'd1Studio.refresh',
      'd1Studio.refreshDatabase',
      'd1Studio.newQuery',
      'd1Studio.viewTableContent',
      'd1Studio.executeSelection',
      'd1Studio.showLogs',
      'd1Studio.viewDdl'
    ]));
    expect(manifest.contributes.configuration.properties).toHaveProperty('d1Studio.accountId');
    expect(manifest.contributes.languages).toContainEqual(expect.objectContaining({ id: 'd1-sql' }));
    expect(manifest.contributes.notebooks).toContainEqual(expect.objectContaining({
      type: 'd1Studio.query',
      selector: [{ filenamePattern: '*.d1nb' }]
    }));
    expect(manifest.contributes.notebookRenderer).toContainEqual(expect.objectContaining({
      id: 'd1Studio.resultsRenderer',
      entrypoint: './dist/notebookRenderer.js',
      mimeTypes: ['application/vnd.d1studio.result+json']
    }));
  });

  it('uses the native cell run control and exposes selected SQL with F5', () => {
    expect(manifest.contributes.menus['notebook/cell/title']).toContainEqual(expect.objectContaining({
      command: 'd1Studio.executeSelection',
      when: expect.stringContaining('notebookType == d1Studio.query'),
      group: expect.stringContaining('inline')
    }));
    expect(manifest.contributes.keybindings).toContainEqual({
      command: 'd1Studio.executeSelection',
      key: 'f5',
      when: 'notebookType == d1Studio.query && editorLangId == d1-sql && editorHasSelection'
    });
  });

});
