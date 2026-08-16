import { describe, expect, it } from 'vitest';
import { delimitSqlStatements } from '../src/sqlBatch.js';

describe('delimitSqlStatements', () => {
  it('separates newline-delimited selects', () => {
    expect(delimitSqlStatements(
      'select * from account\nselect * from api_tokens'
    )).toBe(
      'select * from account\n;select * from api_tokens'
    );
  });

  it('leaves semicolon-delimited and multiline statements unchanged', () => {
    expect(delimitSqlStatements(
      'SELECT *\nFROM account;\nSELECT *\nFROM api_tokens;'
    )).toBe(
      'SELECT *\nFROM account;\nSELECT *\nFROM api_tokens;'
    );
  });

  it('ignores statement keywords inside comments, strings, and parentheses', () => {
    const sql = [
      "SELECT 'first line",
      "select still in string' AS value, (",
      '  SELECT 1',
      ') AS nested',
      '-- select in a comment',
      'SELECT 2'
    ].join('\n');

    expect(delimitSqlStatements(sql)).toBe(sql.replace('\nSELECT 2', '\n;SELECT 2'));
  });

  it('keeps the body of a CTE with its WITH clause', () => {
    const sql = [
      'WITH values_to_read AS (',
      '  SELECT 1 AS value',
      ')',
      'SELECT * FROM values_to_read',
      'SELECT 2'
    ].join('\n');

    expect(delimitSqlStatements(sql)).toBe(sql.replace('\nSELECT 2', '\n;SELECT 2'));
  });

  it('recognizes a completed single-line CTE before the next command', () => {
    const sql = 'WITH one AS (SELECT 1) SELECT * FROM one\nSELECT 2';
    expect(delimitSqlStatements(sql)).toBe(
      'WITH one AS (SELECT 1) SELECT * FROM one\n;SELECT 2'
    );
  });

  it('keeps compound SELECT branches in one statement', () => {
    const sql = [
      'SELECT id FROM current_items',
      'UNION ALL',
      'SELECT id FROM archived_items',
      'SELECT count(*) FROM current_items'
    ].join('\n');

    expect(delimitSqlStatements(sql)).toBe([
      'SELECT id FROM current_items',
      'UNION ALL',
      'SELECT id FROM archived_items',
      ';SELECT count(*) FROM current_items'
    ].join('\n'));
  });

  it('separates mixed write and read commands', () => {
    expect(delimitSqlStatements(
      'UPDATE items SET active = 1\nSELECT * FROM items'
    )).toBe(
      'UPDATE items SET active = 1\n;SELECT * FROM items'
    );
  });

  it('keeps INSERT SELECT and CREATE VIEW SELECT bodies together', () => {
    const sql = [
      'INSERT INTO target (id)',
      'SELECT id FROM source',
      'SELECT count(*) FROM target',
      'CREATE VIEW active_items AS',
      'SELECT * FROM items WHERE active = 1',
      'SELECT * FROM active_items'
    ].join('\n');

    expect(delimitSqlStatements(sql)).toBe([
      'INSERT INTO target (id)',
      'SELECT id FROM source',
      ';SELECT count(*) FROM target',
      ';CREATE VIEW active_items AS',
      'SELECT * FROM items WHERE active = 1',
      ';SELECT * FROM active_items'
    ].join('\n'));
  });

  it('does not split commands inside a CREATE TRIGGER body', () => {
    const sql = [
      'CREATE TRIGGER audit_items AFTER UPDATE ON items BEGIN',
      'INSERT INTO audit_log (item_id) VALUES (NEW.id);',
      'SELECT NEW.id;',
      'END',
      'SELECT * FROM audit_log'
    ].join('\n');

    expect(delimitSqlStatements(sql)).toBe(sql.replace(
      '\nSELECT * FROM audit_log',
      '\n;SELECT * FROM audit_log'
    ));
  });
});
