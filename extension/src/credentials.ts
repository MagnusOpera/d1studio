import * as vscode from 'vscode';
import { CloudflareClient, DEFAULT_TIMEOUT_MS } from './cloudflareClient.js';
import type { ExtensionLogger } from './types.js';

const TOKEN_SECRET_KEY = 'd1Studio.apiToken';

export interface StoredCredentials {
  accountId: string;
  token: string;
}

export class CredentialStore {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly logger?: ExtensionLogger
  ) {}

  async get(): Promise<StoredCredentials | undefined> {
    const accountId = vscode.workspace.getConfiguration('d1Studio').get<string>('accountId', '').trim();
    const token = await this.context.secrets.get(TOKEN_SECRET_KEY);
    return accountId && token ? { accountId, token } : undefined;
  }

  async configure(): Promise<boolean> {
    this.logger?.info('Credential configuration started.');
    const currentAccountId = vscode.workspace.getConfiguration('d1Studio').get<string>('accountId', '');
    const accountId = await vscode.window.showInputBox({
      title: 'Configure Cloudflare D1 Studio',
      prompt: 'Enter the Cloudflare account ID containing your D1 databases.',
      value: currentAccountId,
      ignoreFocusOut: true,
      validateInput: value => value.trim() ? undefined : 'An account ID is required.'
    });
    if (accountId === undefined) {
      this.logger?.debug('Credential configuration cancelled before account ID entry.');
      return false;
    }

    const token = await vscode.window.showInputBox({
      title: 'Configure Cloudflare D1 Studio',
      prompt: 'Enter a Cloudflare API token with D1 Read or D1 Edit permission.',
      password: true,
      ignoreFocusOut: true,
      validateInput: value => value.trim() ? undefined : 'An API token is required.'
    });
    if (token === undefined) {
      this.logger?.debug('Credential configuration cancelled before token entry.');
      return false;
    }

    const normalizedAccountId = accountId.trim();
    const normalizedToken = token.trim();
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Validating Cloudflare D1 credentials…'
      },
      async () => new CloudflareClient(
        normalizedAccountId,
        normalizedToken,
        globalThis.fetch,
        DEFAULT_TIMEOUT_MS,
        this.logger
      ).listDatabases()
    );
    this.logger?.info('Cloudflare credentials validated with D1 database listing access.');

    await vscode.workspace.getConfiguration('d1Studio').update(
      'accountId',
      normalizedAccountId,
      vscode.ConfigurationTarget.Global
    );
    await this.context.secrets.store(TOKEN_SECRET_KEY, normalizedToken);
    this.logger?.info('Cloudflare account ID and token stored successfully.');
    return true;
  }

  async clear(): Promise<void> {
    await this.context.secrets.delete(TOKEN_SECRET_KEY);
    await vscode.workspace.getConfiguration('d1Studio').update(
      'accountId',
      undefined,
      vscode.ConfigurationTarget.Global
    );
    this.logger?.info('D1 Studio credentials cleared.');
  }
}
