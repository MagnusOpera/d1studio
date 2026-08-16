import { describe, expect, it, vi } from 'vitest';
import {
  CloudflareApiError,
  CloudflareClient,
  containsMutatingStatement,
  type FetchLike
} from '../src/cloudflareClient.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

describe('CloudflareClient', () => {
  it('lists and sorts every database page with bearer authentication', async () => {
    const fetch = vi.fn<FetchLike>()
      .mockResolvedValueOnce(jsonResponse({
        success: true,
        result: [{ uuid: '2', name: 'Zulu' }],
        result_info: { page: 1, total_pages: 2 }
      }))
      .mockResolvedValueOnce(jsonResponse({
        success: true,
        result: [{ uuid: '1', name: 'Alpha' }],
        result_info: { page: 2, total_pages: 2 }
      }));

    const client = new CloudflareClient('account/id', 'secret-token', fetch);
    await expect(client.listDatabases()).resolves.toEqual([
      { uuid: '1', name: 'Alpha' },
      { uuid: '2', name: 'Zulu' }
    ]);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(String(fetch.mock.calls[0]?.[0])).toContain('/accounts/account%2Fid/d1/database?page=1');
    expect(fetch.mock.calls[0]?.[1]?.headers).toMatchObject({ Authorization: 'Bearer secret-token' });
  });

  it('submits SQL unchanged and accepts a single result object', async () => {
    const fetch = vi.fn<FetchLike>().mockResolvedValue(jsonResponse({
      success: true,
      result: { success: true, results: [{ value: 1 }], meta: { rows_read: 1 } }
    }));
    const client = new CloudflareClient('account', 'token', fetch);

    await expect(client.query('database/id', ' SELECT 1; ')).resolves.toEqual([
      { success: true, results: [{ value: 1 }], meta: { rows_read: 1 } }
    ]);
    expect(fetch.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ sql: ' SELECT 1; ' }));
  });

  it('submits a multi-statement selection once and preserves ordered results', async () => {
    const fetch = vi.fn<FetchLike>().mockResolvedValue(jsonResponse({
      success: true,
      result: [
        { success: true, results: [{ source: 'artifacts' }], meta: { rows_read: 1 } },
        { success: true, results: [{ source: 'builds' }], meta: { rows_read: 1 } }
      ]
    }));
    const client = new CloudflareClient('account', 'token', fetch);
    const sql = 'SELECT * FROM artifacts\nSELECT * FROM builds';

    await expect(client.query('database', sql)).resolves.toEqual([
      { success: true, results: [{ source: 'artifacts' }], meta: { rows_read: 1 } },
      { success: true, results: [{ source: 'builds' }], meta: { rows_read: 1 } }
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({
      sql: 'SELECT * FROM artifacts\n;SELECT * FROM builds'
    }));
  });

  it('classifies a denied mutation without invalidating the client', async () => {
    const fetch = vi.fn<FetchLike>()
      .mockResolvedValueOnce(jsonResponse({
        success: false,
        result: null,
        errors: [{ code: 10000, message: 'Authentication error: permission denied' }]
      }, 403))
      .mockResolvedValueOnce(jsonResponse({
        success: true,
        result: [{ success: true, results: [{ count: 3 }] }]
      }));
    const client = new CloudflareClient('account', 'readonly', fetch);

    await expect(client.query('db', 'UPDATE users SET active = 1')).rejects.toMatchObject({
      kind: 'write-permission',
      message: 'This token has D1 Read access. D1 Edit is required for this statement.'
    });
    await expect(client.query('db', 'SELECT count(*) AS count FROM users')).resolves.toHaveLength(1);
  });

  it('classifies invalid tokens and malformed responses', async () => {
    const invalid = new CloudflareClient('account', 'bad', vi.fn<FetchLike>().mockResolvedValue(
      jsonResponse({ success: false, result: null, errors: [{ message: 'Invalid API token' }] }, 401)
    ));
    await expect(invalid.listDatabases()).rejects.toMatchObject({ kind: 'authentication' });

    const malformed = new CloudflareClient('account', 'token', vi.fn<FetchLike>().mockResolvedValue(
      new Response('not json', { status: 502 })
    ));
    await expect(malformed.listDatabases()).rejects.toBeInstanceOf(CloudflareApiError);
  });

  it('times out stalled requests', async () => {
    const fetch: FetchLike = (_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    });
    const client = new CloudflareClient('account', 'token', fetch, 5);
    await expect(client.listDatabases()).rejects.toMatchObject({ kind: 'timeout' });
  });
});

describe('containsMutatingStatement', () => {
  it.each([
    'INSERT INTO t VALUES (1)',
    'WITH next AS (SELECT 1) UPDATE t SET value = 2',
    '/* migration */ CREATE TABLE t (id INTEGER)',
    'PRAGMA foreign_keys = ON'
  ])('recognizes mutation: %s', sql => expect(containsMutatingStatement(sql)).toBe(true));

  it('does not treat mutation words in comments as writes', () => {
    expect(containsMutatingStatement('-- DELETE everything\nSELECT 1')).toBe(false);
  });
});
