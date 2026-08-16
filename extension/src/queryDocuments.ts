import * as vscode from 'vscode';
import type { D1Database, QueryContext } from './types.js';

export class QueryDocumentRegistry implements vscode.Disposable {
  private readonly contexts = new Map<string, QueryContext>();
  private readonly closeSubscription: vscode.Disposable;

  constructor() {
    this.closeSubscription = vscode.workspace.onDidCloseTextDocument(document => {
      this.contexts.delete(document.uri.toString());
    });
  }

  async open(database: D1Database, initialSql?: string): Promise<void> {
    const sql = initialSql ? `\n${initialSql.trim()}\n` : '\n';
    const document = await vscode.workspace.openTextDocument({
      language: 'd1-sql',
      content: `-- Cloudflare D1: ${database.name}\n-- D1 Studio Database ID: ${database.uuid}\n-- Select SQL and press F5 or use the editor play button to execute it.\n${sql}`
    });
    this.contexts.set(document.uri.toString(), {
      databaseId: database.uuid,
      databaseName: database.name
    });
    await vscode.window.showTextDocument(document, { preview: false });
  }

  get(document: vscode.TextDocument): QueryContext | undefined {
    const registered = this.contexts.get(document.uri.toString());
    if (registered) {
      return registered;
    }

    const header = document.getText(new vscode.Range(0, 0, Math.min(document.lineCount, 4), 0));
    const name = /^-- Cloudflare D1:\s*(.+)$/m.exec(header)?.[1]?.trim();
    const databaseId = /^-- D1 Studio Database ID:\s*([0-9a-f-]{32,36})\s*$/im.exec(header)?.[1];
    if (!name || !databaseId) {
      return undefined;
    }

    const restored = { databaseId, databaseName: name };
    this.contexts.set(document.uri.toString(), restored);
    return restored;
  }

  dispose(): void {
    this.closeSubscription.dispose();
    this.contexts.clear();
  }
}
