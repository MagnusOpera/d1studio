import * as vscode from 'vscode';
import { renderResultsPage } from './resultsPage.js';
import type { D1QueryResult, ExtensionLogger, QueryContext } from './types.js';

interface SourceEditor {
  document: vscode.TextDocument;
  viewColumn: vscode.ViewColumn;
}

export class ResultsPanel implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;

  constructor(private readonly logger?: ExtensionLogger) {}

  showResults(context: QueryContext, results: D1QueryResult[]): void {
    this.logger?.debug(`Rendering ${results.length} result set(s) in the D1 results grid.`);
    void this.show(`D1 Results: ${context.databaseName}`, renderResultsPage(context, results));
  }

  showError(context: QueryContext, message: string): void {
    this.logger?.debug('Rendering a query error in the D1 results grid.');
    void this.show(`D1 Error: ${context.databaseName}`, renderResultsPage(context, [], message));
  }

  dispose(): void {
    this.panel?.dispose();
    this.panel = undefined;
  }

  private async show(title: string, html: string): Promise<void> {
    const sourceEditor = captureSourceEditor();
    try {
      if (!this.panel) {
        if (sourceEditor) {
          this.logger?.debug('Splitting the D1 query editor downward for the results grid.');
          await vscode.commands.executeCommand('workbench.action.splitEditorDown');
        }
        this.logger?.debug('Creating the D1 results grid in the lower editor group.');
        this.panel = vscode.window.createWebviewPanel(
          'd1Studio.results',
          title,
          { viewColumn: vscode.ViewColumn.Active, preserveFocus: false },
          { enableScripts: true, retainContextWhenHidden: true }
        );
        this.panel.onDidDispose(() => {
          this.logger?.debug('D1 results grid was closed.');
          this.panel = undefined;
        });
      }
      this.panel.title = title;
      this.panel.webview.html = html;
      this.panel.reveal(this.panel.viewColumn ?? vscode.ViewColumn.Active, !sourceEditor);
      if (sourceEditor) {
        try {
          await vscode.commands.executeCommand('workbench.action.closeOtherEditors');
        } catch (error) {
          this.logger?.warn(`Could not close the duplicate query tab in the results group: ${error instanceof Error ? error.message : String(error)}`);
        }
        await vscode.window.showTextDocument(sourceEditor.document, {
          viewColumn: sourceEditor.viewColumn,
          preserveFocus: false
        });
      }
      this.logger?.debug('D1 results grid revealed below the query editor.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger?.error(`Unable to reveal the D1 results grid: ${message}`);
      void vscode.window.showErrorMessage(
        'D1 Studio could not open the results grid. Run “D1 Studio: Show Logs” for diagnostics.'
      );
    }
  }
}

function captureSourceEditor(): SourceEditor | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'd1-sql' || editor.viewColumn === undefined) {
    return undefined;
  }
  return { document: editor.document, viewColumn: editor.viewColumn };
}
