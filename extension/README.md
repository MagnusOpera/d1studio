# Cloudflare D1 Studio

Cloudflare D1 Studio lets you browse and query remote D1 databases without leaving VS Code.

[Project website](https://magnusopera.github.io/d1studio/) · [Source and releases](https://github.com/MagnusOpera/d1studio)

## Features

- Dedicated D1 activity-bar explorer for databases, tables, views, indexes, and triggers.
- Table context action to display the first 1000 unordered rows.
- D1 SQL scratch editors with SQLite-aware syntax highlighting.
- Select SQL and use the editor play button or the **Execute Selected SQL** context action. The extension does not install a keyboard shortcut.
- A vertically split query workspace: SQL remains visible above and the results grid opens directly below. It includes query timing and rows read or written; navigate focused cells with the arrow, Home, and End keys.
- First-class support for read-only and editable API tokens.

## Configure Cloudflare access

1. Copy the **Account ID** from the Cloudflare dashboard. It is shown on the account overview and in Workers & Pages.
2. Create a scoped Cloudflare API token:
   - Choose account permission **D1 Read** for browsing, table content, and `SELECT` queries.
   - Choose **D1 Edit** only if the extension must execute statements that alter data or schema.
   - Restrict the token to the intended Cloudflare account.
3. Open the Command Palette and run **D1 Studio: Configure Credentials**.
4. Enter the account ID and token. The extension validates them by listing D1 databases; it never issues a test write.

The account ID is stored as the `d1Studio.accountId` VS Code user setting. The token is stored only in VS Code Secret Storage and is never written to settings or logs.

When a D1 Read token submits a mutating statement, Cloudflare rejects that statement and D1 Studio explains that D1 Edit is required. The explorer, credentials, open SQL, and subsequent read queries remain available.

## Browse and query

- Expand a database to load its **Tables**, **Views**, **Indexes**, and **Triggers** groups. Index entries show their owning table; internal SQLite/D1 objects remain hidden.
- Right-click a table or view and choose **View Content (First 1000 Rows)**. The generated query is an unordered `SELECT * ... LIMIT 1000`; “latest” is not inferred because D1 tables do not share a universal timestamp column.
- Right-click any table, view, index, or trigger and choose **View DDL** to open its stored `CREATE` statement in a new database-associated query editor, formatted as readable SQLite SQL with two-space indentation.
- Right-click a database and choose **New Query**.
- Select one or more complete SQL statements and click the editor play button, or right-click and choose **Execute Selected SQL**. No selection means no execution.
- Use the explorer refresh button after making changes outside the extension. Successful mutations executed in D1 Studio refresh the affected database automatically.

Query scratch documents are intentionally ephemeral in this release. Save a copy as a regular file if you want to retain SQL, but saved files are not associated automatically with a D1 database.

## Install a local VSIX

```sh
cd extension
npm ci
npm run package
code --install-extension cloudflare-d1-studio-0.2.1.vsix
```

## Development

```sh
cd extension
npm run typecheck
npm test
npm run test:integration
npm run package
```

Integration tests download and launch a VS Code test instance. On headless Linux, run them through `xvfb-run -a`.

## Troubleshooting

Run **D1 Studio: Show Logs** from the Command Palette, or click the Output icon in the D1 explorer title. The **D1 Studio** channel records extension activation, credential validation, Cloudflare request status and timing, query lifecycle, schema refreshes, and each step used to reveal the results panel. Tokens, authorization headers, SQL values, and returned row contents are never logged.

## Security and operational notes

- Cloudflare remains the authority for every operation; the extension does not try to bypass token scope.
- API traffic uses HTTPS and the official Cloudflare REST API.
- Results are HTML-escaped and displayed in a script-free webview with a strict content-security policy.
- Cloudflare describes the D1 REST API as an administrative interface subject to the global Cloudflare API rate limit. This extension is intended for interactive desktop administration, not application traffic.
