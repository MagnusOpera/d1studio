import * as vscode from 'vscode';
import type { D1Database, QueryContext } from './types.js';

export const D1_NOTEBOOK_TYPE = 'd1Studio.query';

interface SerializedNotebook {
  version: 1;
  metadata?: Record<string, unknown>;
  cells: Array<{
    kind: vscode.NotebookCellKind;
    languageId: string;
    value: string;
  }>;
}

export interface QueryCell {
  cell: vscode.NotebookCell;
  context: QueryContext;
}

export class QueryNotebookRegistry implements vscode.Disposable, vscode.NotebookSerializer {
  private readonly serializer: vscode.Disposable;

  constructor() {
    this.serializer = vscode.workspace.registerNotebookSerializer(D1_NOTEBOOK_TYPE, this, {
      transientOutputs: true
    });
  }

  async open(database: D1Database, initialSql?: string): Promise<vscode.NotebookDocument> {
    const header = [
      `-- Cloudflare D1: ${database.name}`,
      `-- D1 Studio Database ID: ${database.uuid}`,
      '-- Run this cell to execute it against the database.'
    ].join('\n');
    const value = initialSql?.trim() ? `${header}\n\n${initialSql.trim()}\n` : `${header}\n\n`;
    const cell = new vscode.NotebookCellData(vscode.NotebookCellKind.Code, value, 'd1-sql');
    const data = new vscode.NotebookData([cell]);
    data.metadata = { d1Studio: contextFor(database) };
    const document = await vscode.workspace.openNotebookDocument(D1_NOTEBOOK_TYPE, data);
    await vscode.window.showNotebookDocument(document, { preview: false });
    return document;
  }

  get(document: vscode.NotebookDocument): QueryContext | undefined {
    return parseContext(document.metadata['d1Studio']);
  }

  findCell(document: vscode.TextDocument): QueryCell | undefined {
    for (const notebook of vscode.workspace.notebookDocuments) {
      const context = this.get(notebook);
      if (!context) {
        continue;
      }
      for (const cell of notebook.getCells()) {
        if (cell.document.uri.toString() === document.uri.toString()) {
          return { cell, context };
        }
      }
    }
    return undefined;
  }

  deserializeNotebook(content: Uint8Array): vscode.NotebookData {
    if (!content.length) {
      return new vscode.NotebookData([
        new vscode.NotebookCellData(vscode.NotebookCellKind.Code, '', 'd1-sql')
      ]);
    }
    const parsed = JSON.parse(new TextDecoder().decode(content)) as Partial<SerializedNotebook>;
    if (parsed.version !== 1 || !Array.isArray(parsed.cells)) {
      throw new Error('Unsupported D1 notebook format.');
    }
    const data = new vscode.NotebookData(parsed.cells.map(cell => new vscode.NotebookCellData(
      cell.kind,
      cell.value,
      cell.languageId
    )));
    data.metadata = parsed.metadata;
    return data;
  }

  serializeNotebook(data: vscode.NotebookData): Uint8Array {
    const serialized: SerializedNotebook = {
      version: 1,
      metadata: data.metadata,
      cells: data.cells.map(cell => ({
        kind: cell.kind,
        languageId: cell.languageId,
        value: cell.value
      }))
    };
    return new TextEncoder().encode(JSON.stringify(serialized, undefined, 2));
  }

  dispose(): void {
    this.serializer.dispose();
  }
}

function contextFor(database: D1Database): QueryContext {
  return { databaseId: database.uuid, databaseName: database.name };
}

function parseContext(value: unknown): QueryContext | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const candidate = value as Partial<QueryContext>;
  if (typeof candidate.databaseId !== 'string' || typeof candidate.databaseName !== 'string') {
    return undefined;
  }
  return { databaseId: candidate.databaseId, databaseName: candidate.databaseName };
}
