import * as vscode from 'vscode';
import { CloudflareClient, DEFAULT_TIMEOUT_MS } from './cloudflareClient.js';
import { CredentialStore } from './credentials.js';
import { errorMessage } from './errors.js';
import { D1NotebookController } from './queryController.js';
import { QueryNotebookRegistry } from './queryNotebooks.js';
import { formattedDdl, tableContentSql } from './schema.js';
import {
  D1TreeProvider,
  DatabaseNode,
  SchemaNode
} from './treeProvider.js';
import type { D1Database } from './types.js';

export function activate(context: vscode.ExtensionContext): void {
  const log = vscode.window.createOutputChannel('D1 Studio', { log: true });
  log.info(`Activating Cloudflare D1 Studio ${String(context.extension.packageJSON.version)} on VS Code ${vscode.version}.`);
  const credentials = new CredentialStore(context, log);
  const queryNotebooks = new QueryNotebookRegistry();

  const getClient = async (): Promise<CloudflareClient | undefined> => {
    const stored = await credentials.get();
    return stored ? new CloudflareClient(
      stored.accountId,
      stored.token,
      globalThis.fetch,
      DEFAULT_TIMEOUT_MS,
      log
    ) : undefined;
  };

  const treeProvider = new D1TreeProvider(getClient, log);
  const tree = vscode.window.createTreeView('d1Studio.databases', { treeDataProvider: treeProvider });
  const queryController = new D1NotebookController(
    queryNotebooks,
    () => requireClient(getClient),
    treeProvider,
    log
  );

  context.subscriptions.push(
    tree,
    log,
    queryNotebooks,
    queryController,
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('d1Studio.accountId')) {
        treeProvider.refresh();
      }
    }),
    vscode.commands.registerCommand('d1Studio.configureCredentials', async () => {
      try {
        if (await credentials.configure()) {
          treeProvider.refresh();
          void vscode.window.showInformationMessage(
            'D1 Studio connected. D1 Read supports browsing and queries; D1 Edit is needed only for mutations.'
          );
        }
      } catch (error) {
        log.error(`Credential validation failed: ${errorMessage(error)}`);
        void vscode.window.showErrorMessage(`D1 Studio could not validate the credentials: ${errorMessage(error)}`);
      }
    }),
    vscode.commands.registerCommand('d1Studio.clearCredentials', async () => {
      await credentials.clear();
      treeProvider.refresh();
      void vscode.window.showInformationMessage('D1 Studio credentials cleared.');
    }),
    vscode.commands.registerCommand('d1Studio.showLogs', () => log.show(true)),
    vscode.commands.registerCommand('d1Studio.refresh', () => {
      log.debug('Refreshing the D1 database explorer.');
      treeProvider.refresh();
    }),
    vscode.commands.registerCommand('d1Studio.refreshDatabase', (node?: DatabaseNode) => {
      if (node instanceof DatabaseNode) {
        log.debug(`Refreshing database ${node.database.uuid}.`);
        treeProvider.refreshDatabase(node.database.uuid);
      } else {
        treeProvider.refresh();
      }
    }),
    vscode.commands.registerCommand('d1Studio.newQuery', async (node?: DatabaseNode) => {
      const database = node instanceof DatabaseNode ? node.database : await selectDatabase(getClient);
      if (!database) {
        return;
      }
      await queryNotebooks.open(database);
    }),
    vscode.commands.registerCommand('d1Studio.viewTableContent', async (node?: SchemaNode) => {
      if (!(node instanceof SchemaNode) || (node.entry.type !== 'table' && node.entry.type !== 'view')) {
        return;
      }
      const sql = tableContentSql(node.entry.name);
      const document = await queryNotebooks.open(node.database, sql);
      await queryController.executeFirstCell(document);
    }),
    vscode.commands.registerCommand('d1Studio.viewDdl', async (node?: SchemaNode) => {
      if (!(node instanceof SchemaNode)) {
        return;
      }
      if (!node.entry.sql) {
        log.warn(`No stored DDL is available for ${node.entry.type} ${node.entry.name}.`);
        void vscode.window.showWarningMessage(
          `D1 Studio: No stored DDL is available for ${node.entry.type} “${node.entry.name}”.`
        );
        return;
      }
      log.debug(`Opening stored DDL for ${node.entry.type} ${node.entry.name}.`);
      await queryNotebooks.open(
        node.database,
        `-- DDL for ${node.entry.type}: ${node.entry.name}\n${formattedDdl(node.entry.sql)}`
      );
    }),
    vscode.commands.registerCommand('d1Studio.executeSelection', () => queryController.executeSelection())
  );

}

export function deactivate(): void {}

async function selectDatabase(
  getClient: () => Promise<CloudflareClient | undefined>
): Promise<D1Database | undefined> {
  const client = await requireClient(getClient);
  if (!client) {
    return undefined;
  }
  try {
    const databases = await client.listDatabases();
    const selected = await vscode.window.showQuickPick(
      databases.map(database => ({ label: database.name, description: database.uuid, database })),
      { title: 'Select a Cloudflare D1 database', placeHolder: 'Database' }
    );
    return selected?.database;
  } catch (error) {
    void vscode.window.showErrorMessage(`D1 Studio: ${errorMessage(error)}`);
    return undefined;
  }
}

async function requireClient(
  getClient: () => Promise<CloudflareClient | undefined>
): Promise<CloudflareClient | undefined> {
  const client = await getClient();
  if (!client) {
    void vscode.window.showWarningMessage(
      'Configure a Cloudflare account ID and D1 API token before using D1 Studio.',
      'Configure Credentials'
    ).then(choice => {
      if (choice) {
        void vscode.commands.executeCommand('d1Studio.configureCredentials');
      }
    });
  }
  return client;
}
