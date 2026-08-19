import * as vscode from 'vscode';
import { errorMessage } from './errors.js';
import { createNotebookResultOutput, D1_RESULT_MIME } from './notebookResults.js';
import { D1_NOTEBOOK_TYPE, QueryNotebookRegistry } from './queryNotebooks.js';
import type { CloudflareClient } from './cloudflareClient.js';
import type { D1TreeProvider } from './treeProvider.js';
import type { ExtensionLogger, QueryContext } from './types.js';

export class D1NotebookController implements vscode.Disposable {
  private readonly controller: vscode.NotebookController;
  private executionOrder = 0;

  constructor(
    private readonly notebooks: QueryNotebookRegistry,
    private readonly getClient: () => Promise<CloudflareClient | undefined>,
    private readonly treeProvider: D1TreeProvider,
    private readonly logger: ExtensionLogger
  ) {
    this.controller = vscode.notebooks.createNotebookController(
      'd1Studio.queryController',
      D1_NOTEBOOK_TYPE,
      'Cloudflare D1'
    );
    this.controller.supportedLanguages = ['d1-sql'];
    this.controller.supportsExecutionOrder = true;
    this.controller.executeHandler = async cells => {
      for (const cell of cells) {
        const context = this.notebooks.get(cell.notebook);
        if (context) {
          await this.execute(cell, context, cell.document.getText());
        }
      }
    };
  }

  async executeFirstCell(document: vscode.NotebookDocument): Promise<void> {
    const context = this.notebooks.get(document);
    const cell = document.cellCount ? document.cellAt(0) : undefined;
    if (context && cell) {
      await this.execute(cell, context, cell.document.getText());
    }
  }

  async executeSelection(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }
    const queryCell = this.notebooks.findCell(editor.document);
    if (!queryCell) {
      void vscode.window.showWarningMessage(
        'This SQL cell is not associated with a D1 database. Open a new query from the D1 database context menu.'
      );
      return;
    }
    const sql = editor.document.getText(editor.selection);
    if (sql.trim()) {
      await this.execute(queryCell.cell, queryCell.context, sql);
    }
  }

  dispose(): void {
    this.controller.dispose();
  }

  private async execute(cell: vscode.NotebookCell, context: QueryContext, sql: string): Promise<void> {
    if (!sql.trim()) {
      return;
    }
    const execution = this.controller.createNotebookCellExecution(cell);
    execution.executionOrder = ++this.executionOrder;
    execution.start(Date.now());
    let cancellation: vscode.Disposable | undefined;
    let success: boolean | undefined = false;
    try {
      await execution.clearOutput();
      const client = await this.getClient();
      if (!client) {
        return;
      }
      const abortController = new AbortController();
      cancellation = execution.token.onCancellationRequested(() => abortController.abort());
      this.logger.debug(`Starting notebook query execution for database ${context.databaseId}.`);
      const results = await client.query(context.databaseId, sql, abortController.signal);
      const output = createNotebookResultOutput(results);
      await execution.replaceOutput(new vscode.NotebookCellOutput([
        vscode.NotebookCellOutputItem.json(output, D1_RESULT_MIME)
      ]));
      this.logger.debug(`Rendered ${results.length} result set(s) below the D1 notebook cell.`);
      if (results.some(result => result.meta?.changed_db)) {
        this.logger.debug(`Query changed database ${context.databaseId}; refreshing its schema cache.`);
        this.treeProvider.refreshDatabase(context.databaseId);
      }
      success = true;
    } catch (error) {
      if (execution.token.isCancellationRequested) {
        this.logger.debug(`Notebook query execution cancelled for database ${context.databaseId}.`);
        success = undefined;
        return;
      }
      const message = errorMessage(error);
      this.logger.error(`Query execution failed: ${message}`);
      await execution.replaceOutput(new vscode.NotebookCellOutput([
        vscode.NotebookCellOutputItem.json(createNotebookResultOutput([], message), D1_RESULT_MIME)
      ]));
      void vscode.window.showErrorMessage(`D1 Studio: ${message}`);
    } finally {
      cancellation?.dispose();
      execution.end(success, Date.now());
    }
  }
}
