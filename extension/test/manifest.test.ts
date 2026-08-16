import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const manifest = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as {
  contributes: {
    commands: Array<{ command: string }>;
    menus: {
      'editor/title': Array<{ command: string; when: string; group: string }>;
    };
    keybindings: Array<{ command: string; key: string; when: string }>;
    configuration: { properties: Record<string, unknown> };
    languages: Array<{ id: string }>;
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
  });

  it('contributes an editor play button and a selection-scoped F5 shortcut', () => {
    expect(manifest.contributes.menus['editor/title']).toContainEqual(expect.objectContaining({
      command: 'd1Studio.executeSelection',
      when: 'editorLangId == d1-sql',
      group: expect.stringContaining('navigation')
    }));
    expect(manifest.contributes.keybindings).toContainEqual({
      command: 'd1Studio.executeSelection',
      key: 'f5',
      when: 'editorLangId == d1-sql && editorHasSelection'
    });
  });

});
