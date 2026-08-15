import { describe, expect, it } from 'vitest';
import { executableDdl, formattedDdl, parseSchemaRows, quoteIdentifier, SCHEMA_SQL, tableContentSql } from '../src/schema.js';

describe('schema helpers', () => {
  it('quotes identifiers and builds an unordered 1000-row query', () => {
    expect(quoteIdentifier('odd"table')).toBe('"odd""table"');
    expect(tableContentSql('odd"table')).toBe('SELECT * FROM "odd""table" LIMIT 1000');
    expect(tableContentSql('users')).not.toMatch(/ORDER\s+BY/i);
  });

  it('makes stored DDL directly executable without duplicating semicolons', () => {
    expect(executableDdl(' CREATE VIEW active_users AS SELECT 1 ')).toBe(
      'CREATE VIEW active_users AS SELECT 1;'
    );
    expect(executableDdl('CREATE INDEX idx ON users(email);')).toBe(
      'CREATE INDEX idx ON users(email);'
    );
  });

  it('formats SQLite DDL with readable two-space indentation', () => {
    expect(formattedDdl(
      'create table users(id integer primary key,email text not null,created_at integer default 0)'
    )).toBe([
      'CREATE TABLE users (',
      '  id integer PRIMARY KEY,',
      '  email text NOT NULL,',
      '  created_at integer DEFAULT 0',
      ');'
    ].join('\n'));
  });

  it('filters internal schema objects in SQL', () => {
    expect(SCHEMA_SQL).toContain("type IN ('table', 'view', 'index', 'trigger')");
    expect(SCHEMA_SQL).toContain("name NOT LIKE 'sqlite_%'");
    expect(SCHEMA_SQL).toContain("name NOT LIKE '_cf_%'");
  });

  it('normalizes valid schema rows and drops malformed rows', () => {
    expect(parseSchemaRows([
      { type: 'table', name: 'users', tbl_name: 'users', sql: 'CREATE TABLE users' },
      { type: 'view', name: 'active_users', tbl_name: 'active_users', sql: 'CREATE VIEW active_users' },
      { type: 'index', name: 'idx_users_email', tbl_name: 'users', sql: 'CREATE INDEX idx_users_email' },
      { type: 'trigger', name: 'audit', tbl_name: 'users', sql: null },
      { type: 'procedure', name: 'ignored' },
      { type: 'table', name: 42 }
    ])).toEqual([
      { type: 'table', name: 'users', tbl_name: 'users', sql: 'CREATE TABLE users' },
      { type: 'view', name: 'active_users', tbl_name: 'active_users', sql: 'CREATE VIEW active_users' },
      { type: 'index', name: 'idx_users_email', tbl_name: 'users', sql: 'CREATE INDEX idx_users_email' },
      { type: 'trigger', name: 'audit', tbl_name: 'users', sql: null }
    ]);
  });
});
