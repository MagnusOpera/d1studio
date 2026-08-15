import type {
  CloudflareErrorDetail,
  CloudflareErrorKind,
  D1Database,
  D1QueryResult,
  ExtensionLogger
} from './types.js';

const API_BASE = 'https://api.cloudflare.com/client/v4';
export const DEFAULT_TIMEOUT_MS = 30_000;

interface CloudflareEnvelope<T> {
  success: boolean;
  result: T;
  errors?: CloudflareErrorDetail[];
  messages?: CloudflareErrorDetail[];
  result_info?: {
    page?: number;
    total_pages?: number;
  };
}

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export class CloudflareApiError extends Error {
  constructor(
    message: string,
    readonly kind: CloudflareErrorKind,
    readonly status?: number,
    readonly details: CloudflareErrorDetail[] = []
  ) {
    super(message);
    this.name = 'CloudflareApiError';
  }
}

export class CloudflareClient {
  constructor(
    private readonly accountId: string,
    private readonly token: string,
    private readonly fetchImpl: FetchLike = globalThis.fetch,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
    private readonly logger?: ExtensionLogger
  ) {}

  async listDatabases(signal?: AbortSignal): Promise<D1Database[]> {
    this.logger?.debug('Listing D1 databases.');
    const databases: D1Database[] = [];
    let page = 1;

    do {
      const envelope = await this.request<D1Database[]>(
        `/accounts/${encodeURIComponent(this.accountId)}/d1/database?page=${page}&per_page=100`,
        { method: 'GET' },
        signal
      );
      databases.push(...envelope.result);
      this.logger?.debug(`Loaded D1 database page ${page} (${envelope.result.length} item(s)).`);
      const totalPages = envelope.result_info?.total_pages ?? page;
      if (page >= totalPages) {
        break;
      }
      page += 1;
    } while (true);

    this.logger?.info(`Loaded ${databases.length} D1 database(s).`);
    return databases.sort((left, right) => left.name.localeCompare(right.name));
  }

  async query(databaseId: string, sql: string, signal?: AbortSignal): Promise<D1QueryResult[]> {
    this.logger?.info(`Executing ${describeSql(sql)} on database ${databaseId}.`);
    try {
      const envelope = await this.request<D1QueryResult[] | D1QueryResult>(
        `/accounts/${encodeURIComponent(this.accountId)}/d1/database/${encodeURIComponent(databaseId)}/query`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sql })
        },
        signal
      );
      const results = Array.isArray(envelope.result) ? envelope.result : [envelope.result];
      this.logger?.info(`D1 query completed with ${results.length} statement result(s).`);
      return results;
    } catch (error) {
      if (
        error instanceof CloudflareApiError &&
        error.kind === 'permission' &&
        containsMutatingStatement(sql)
      ) {
        this.logger?.warn('Cloudflare rejected a mutating query because the token lacks D1 Edit permission.');
        throw new CloudflareApiError(
          'This token has D1 Read access. D1 Edit is required for this statement.',
          'write-permission',
          error.status,
          error.details
        );
      }
      this.logger?.error(`D1 query failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  private async request<T>(
    path: string,
    init: RequestInit,
    externalSignal?: AbortSignal
  ): Promise<CloudflareEnvelope<T>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const abortListener = (): void => controller.abort();
    externalSignal?.addEventListener('abort', abortListener, { once: true });

    try {
      let response: Response;
      const startedAt = Date.now();
      this.logger?.debug(`${init.method ?? 'GET'} ${redactPath(path)}`);
      try {
        response = await this.fetchImpl(`${API_BASE}${path}`, {
          ...init,
          headers: {
            Authorization: `Bearer ${this.token}`,
            Accept: 'application/json',
            ...init.headers
          },
          signal: controller.signal
        });
      } catch (error) {
        if (controller.signal.aborted) {
          const kind: CloudflareErrorKind = externalSignal?.aborted ? 'network' : 'timeout';
          throw new CloudflareApiError(
            externalSignal?.aborted ? 'The Cloudflare request was cancelled.' : 'The Cloudflare request timed out.',
            kind
          );
        }
        throw new CloudflareApiError(
          `Unable to reach Cloudflare: ${error instanceof Error ? error.message : String(error)}`,
          'network'
        );
      }

      this.logger?.debug(`Cloudflare responded with HTTP ${response.status} in ${Date.now() - startedAt} ms.`);

      const envelope = await readEnvelope<T>(response);
      if (!response.ok || !envelope.success) {
        const details = envelope.errors ?? [];
        const message = details.map(detail => detail.message).filter(Boolean).join('; ') ||
          `Cloudflare returned HTTP ${response.status}.`;
        throw new CloudflareApiError(message, classifyError(response.status, details), response.status, details);
      }
      return envelope;
    } finally {
      clearTimeout(timeout);
      externalSignal?.removeEventListener('abort', abortListener);
    }
  }
}

function redactPath(path: string): string {
  return path.replace(/\/accounts\/[^/]+/, '/accounts/<account>');
}

function describeSql(sql: string): string {
  const withoutComments = sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--.*$/gm, ' ').trim();
  const statement = /^[A-Za-z]+/.exec(withoutComments)?.[0]?.toUpperCase() ?? 'SQL';
  return `${statement} selection (${sql.length} character(s))`;
}

async function readEnvelope<T>(response: Response): Promise<CloudflareEnvelope<T>> {
  try {
    return await response.json() as CloudflareEnvelope<T>;
  } catch {
    throw new CloudflareApiError(
      `Cloudflare returned an invalid response (HTTP ${response.status}).`,
      'api',
      response.status
    );
  }
}

function classifyError(status: number, details: CloudflareErrorDetail[]): CloudflareErrorKind {
  const message = details.map(detail => detail.message).join(' ').toLowerCase();
  if (status === 401 || message.includes('invalid api token')) {
    return 'authentication';
  }
  if (status === 429) {
    return 'rate-limit';
  }
  if (status === 403 || message.includes('permission') || message.includes('not authorized')) {
    return 'permission';
  }
  if (status === 404 && message.includes('account')) {
    return 'account';
  }
  if (message.includes('sql') || message.includes('query')) {
    return 'sql';
  }
  return 'api';
}

export function containsMutatingStatement(sql: string): boolean {
  const withoutComments = sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--.*$/gm, ' ');
  return /\b(?:INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP|VACUUM|REINDEX|ATTACH|DETACH)\b/i.test(withoutComments) ||
    /\bPRAGMA\s+[\w.]+\s*=/i.test(withoutComments);
}
