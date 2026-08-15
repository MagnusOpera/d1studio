import * as vscode from 'vscode';
import type { CloudflareClient } from './cloudflareClient.js';
import { errorMessage } from './errors.js';
import { parseSchemaRows, SCHEMA_SQL } from './schema.js';
import type { D1Database, ExtensionLogger, SchemaEntry } from './types.js';

export type D1TreeNode = DatabaseNode | CategoryNode | SchemaNode;

export class DatabaseNode extends vscode.TreeItem {
  readonly kind = 'database';

  constructor(readonly database: D1Database) {
    super(database.name, vscode.TreeItemCollapsibleState.Collapsed);
    this.id = `database:${database.uuid}`;
    this.description = database.jurisdiction;
    this.tooltip = new vscode.MarkdownString(
      `**${database.name}**\n\nID: \`${database.uuid}\`${database.jurisdiction ? `\n\nJurisdiction: ${database.jurisdiction}` : ''}`
    );
    this.contextValue = 'd1Studio.database';
    this.iconPath = new vscode.ThemeIcon('database');
  }
}

export class CategoryNode extends vscode.TreeItem {
  readonly kind = 'category';

  constructor(
    readonly database: D1Database,
    readonly category: SchemaEntry['type']
  ) {
    super(categoryLabel(category), vscode.TreeItemCollapsibleState.Collapsed);
    this.id = `${category}s:${database.uuid}`;
    this.contextValue = `d1Studio.${category}s`;
    this.iconPath = new vscode.ThemeIcon(schemaIcon(category));
  }
}

export class SchemaNode extends vscode.TreeItem {
  readonly kind = 'schema';

  constructor(
    readonly database: D1Database,
    readonly entry: SchemaEntry
  ) {
    super(entry.name, vscode.TreeItemCollapsibleState.None);
    this.id = `${entry.type}:${database.uuid}:${entry.name}`;
    this.contextValue = `d1Studio.${entry.type}`;
    this.description = entry.type === 'trigger' || entry.type === 'index' ? entry.tbl_name : undefined;
    this.tooltip = entry.sql ? new vscode.MarkdownString(`\`\`\`sql\n${entry.sql}\n\`\`\``) : entry.name;
    this.iconPath = new vscode.ThemeIcon(schemaIcon(entry.type));
  }
}

export class D1TreeProvider implements vscode.TreeDataProvider<D1TreeNode> {
  private readonly emitter = new vscode.EventEmitter<D1TreeNode | undefined | null | void>();
  readonly onDidChangeTreeData = this.emitter.event;
  private readonly schemaCache = new Map<string, Promise<SchemaEntry[]>>();

  constructor(
    private readonly getClient: () => Promise<CloudflareClient | undefined>,
    private readonly logger?: ExtensionLogger
  ) {}

  getTreeItem(element: D1TreeNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: D1TreeNode): Promise<D1TreeNode[]> {
    const client = await this.getClient();
    if (!client) {
      return [];
    }

    try {
      if (!element) {
        return (await client.listDatabases()).map(database => new DatabaseNode(database));
      }
      if (element instanceof DatabaseNode) {
        return [
          new CategoryNode(element.database, 'table'),
          new CategoryNode(element.database, 'view'),
          new CategoryNode(element.database, 'index'),
          new CategoryNode(element.database, 'trigger')
        ];
      }
      if (element instanceof CategoryNode) {
        const schema = await this.getSchema(client, element.database.uuid);
        return schema
          .filter(entry => entry.type === element.category)
          .map(entry => new SchemaNode(element.database, entry));
      }
      return [];
    } catch (error) {
      this.logger?.error(`D1 explorer loading failed: ${errorMessage(error)}`);
      void vscode.window.showErrorMessage(`D1 Studio: ${errorMessage(error)}`);
      return [];
    }
  }

  refresh(): void {
    this.logger?.debug('Clearing all D1 schema caches.');
    this.schemaCache.clear();
    this.emitter.fire();
  }

  refreshDatabase(databaseId: string): void {
    this.logger?.debug(`Clearing schema cache for database ${databaseId}.`);
    this.schemaCache.delete(databaseId);
    this.emitter.fire();
  }

  private getSchema(client: CloudflareClient, databaseId: string): Promise<SchemaEntry[]> {
    let pending = this.schemaCache.get(databaseId);
    if (!pending) {
      this.logger?.debug(`Loading tables, views, indexes, and triggers for database ${databaseId}.`);
      pending = client.query(databaseId, SCHEMA_SQL).then(results =>
        parseSchemaRows(results.flatMap(result => result.results ?? []))
      );
      this.schemaCache.set(databaseId, pending);
      void pending.catch(() => this.schemaCache.delete(databaseId));
    }
    return pending;
  }
}

function categoryLabel(type: SchemaEntry['type']): string {
  switch (type) {
    case 'table': return 'Tables';
    case 'view': return 'Views';
    case 'index': return 'Indexes';
    case 'trigger': return 'Triggers';
  }
}

function schemaIcon(type: SchemaEntry['type']): string {
  switch (type) {
    case 'table': return 'table';
    case 'view': return 'eye';
    case 'index': return 'symbol-key';
    case 'trigger': return 'symbol-event';
  }
}
