import * as vscode from 'vscode';
import { CloudflareClient, DEFAULT_TIMEOUT_MS } from './cloudflareClient.js';
import { CredentialStore } from './credentials.js';
import { errorMessage } from './errors.js';
import { QueryDocumentRegistry } from './queryDocuments.js';
import { ResultsPanel } from './resultsPanel.js';
import { formattedDdl, tableContentSql } from './schema.js';
import {
  D1TreeProvider,
  DatabaseNode,
  SchemaNode
} from './treeProvider.js';
import type { D1Database, ExtensionLogger, QueryContext } from './types.js';

export function activate(context: vscode.ExtensionContext): void {
  const log = vscode.window.createOutputChannel('D1 Studio', { log: true });
  log.info(`Activating Cloudflare D1 Studio ${String(context.extension.packageJSON.version)} on VS Code ${vscode.version}.`);
  const credentials = new CredentialStore(context, log);
  const queryDocuments = new QueryDocumentRegistry();
  const resultsPanel = new ResultsPanel(log);

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

  context.subscriptions.push(
    tree,
    log,
    queryDocuments,
    resultsPanel,
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
      await queryDocuments.open(database);
    }),
    vscode.commands.registerCommand('d1Studio.viewTableContent', async (node?: SchemaNode) => {
      if (!(node instanceof SchemaNode) || (node.entry.type !== 'table' && node.entry.type !== 'view')) {
        return;
      }
      const sql = tableContentSql(node.entry.name);
      await executeSql(
        getClient,
        resultsPanel,
        treeProvider,
        log,
        { databaseId: node.database.uuid, databaseName: node.database.name },
        sql,
        `Loading ${node.entry.name}…`
      );
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
      await queryDocuments.open(
        node.database,
        `-- DDL for ${node.entry.type}: ${node.entry.name}\n${formattedDdl(node.entry.sql)}`
      );
    }),
    vscode.commands.registerCommand('d1Studio.executeSelection', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }
      const queryContext = queryDocuments.get(editor.document);
      if (!queryContext) {
        void vscode.window.showWarningMessage(
          'This SQL editor is not associated with a D1 database. Open a new query from the D1 database context menu.'
        );
        return;
      }
      const sql = editor.document.getText(editor.selection);
      if (!sql.trim()) {
        return;
      }
      await executeSql(getClient, resultsPanel, treeProvider, log, queryContext, sql, 'Executing D1 query…');
    })
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

async function executeSql(
  getClient: () => Promise<CloudflareClient | undefined>,
  resultsPanel: ResultsPanel,
  treeProvider: D1TreeProvider,
  logger: ExtensionLogger,
  queryContext: QueryContext,
  sql: string,
  title: string
): Promise<void> {
  const client = await requireClient(getClient);
  if (!client) {
    return;
  }

  try {
    logger.debug(`Starting query execution for database ${queryContext.databaseId}.`);
    const queryResults = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title, cancellable: true },
      async (_progress, cancellationToken) => {
        const controller = new AbortController();
        const subscription = cancellationToken.onCancellationRequested(() => controller.abort());
        try {
          return await client.query(queryContext.databaseId, sql, controller.signal);
        } finally {
          subscription.dispose();
        }
      }
    );
    resultsPanel.showResults(queryContext, sql, queryResults);
    logger.debug(`Query result rendering requested (${queryResults.length} result set(s)).`);
    if (queryResults.some(result => result.meta?.changed_db)) {
      logger.debug(`Query changed database ${queryContext.databaseId}; refreshing its schema cache.`);
      treeProvider.refreshDatabase(queryContext.databaseId);
    }
  } catch (error) {
    const message = errorMessage(error);
    logger.error(`Query execution failed: ${message}`);
    resultsPanel.showError(queryContext, sql, message);
    void vscode.window.showErrorMessage(`D1 Studio: ${message}`);
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
