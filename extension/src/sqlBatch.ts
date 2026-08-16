const STATEMENT_STARTERS = new Set([
  'ALTER',
  'ANALYZE',
  'ATTACH',
  'BEGIN',
  'COMMIT',
  'CREATE',
  'DELETE',
  'DETACH',
  'DROP',
  'EXPLAIN',
  'INSERT',
  'PRAGMA',
  'REINDEX',
  'RELEASE',
  'REPLACE',
  'ROLLBACK',
  'SAVEPOINT',
  'SELECT',
  'UPDATE',
  'VACUUM',
  'VALUES',
  'WITH'
]);

interface StatementStart {
  offset: number;
  keyword: string;
  previousTopLevelCharacter?: string;
}

/**
 * Adds separators between top-level SQL commands that begin on new lines.
 * SQLite requires semicolons between statements, while query editors commonly
 * treat a new top-level command keyword as an implicit boundary.
 */
export function delimitSqlStatements(sql: string): string {
  const starts = findStatementStarts(sql);
  if (starts.length < 2) {
    return sql;
  }

  const insertions: number[] = [];
  let statementStart = starts[0];
  if (!statementStart) {
    return sql;
  }

  for (const candidate of starts.slice(1)) {
    if (candidate.previousTopLevelCharacter === ';') {
      statementStart = candidate;
      continue;
    }

    const currentSql = sql.slice(statementStart.offset, candidate.offset);
    if (continuesCurrentStatement(statementStart.keyword, candidate.keyword, currentSql)) {
      if (
        statementStart.keyword === 'WITH' ||
        statementStart.keyword === 'EXPLAIN' ||
        ((statementStart.keyword === 'INSERT' || statementStart.keyword === 'REPLACE' || statementStart.keyword === 'CREATE') &&
          candidate.keyword === 'SELECT')
      ) {
        statementStart = { ...statementStart, keyword: candidate.keyword };
      }
      continue;
    }

    insertions.push(candidate.offset);
    statementStart = candidate;
  }

  if (!insertions.length) {
    return sql;
  }

  let normalized = sql;
  for (const offset of insertions.reverse()) {
    normalized = `${normalized.slice(0, offset)};${normalized.slice(offset)}`;
  }
  return normalized;
}

function continuesCurrentStatement(leadingKeyword: string, candidateKeyword: string, currentSql: string): boolean {
  if (leadingKeyword === 'WITH') {
    return !/\)\s*(?:SELECT|INSERT|UPDATE|DELETE|REPLACE)\b/i.test(currentSql);
  }

  if (leadingKeyword === 'EXPLAIN') {
    return !/\bEXPLAIN(?:\s+QUERY\s+PLAN)?\s+(?:SELECT|INSERT|UPDATE|DELETE|REPLACE)\b/i.test(currentSql);
  }

  if (
    leadingKeyword === 'SELECT' &&
    candidateKeyword === 'SELECT' &&
    /\b(?:UNION(?:\s+(?:ALL|DISTINCT))?|INTERSECT|EXCEPT)\s*$/i.test(currentSql.trimEnd())
  ) {
    return true;
  }

  if ((leadingKeyword === 'INSERT' || leadingKeyword === 'REPLACE') && candidateKeyword === 'SELECT') {
    return !/\bVALUES\b/i.test(currentSql);
  }

  if (/^\s*CREATE\s+(?:TEMP(?:ORARY)?\s+)?TRIGGER\b/i.test(currentSql)) {
    return !/\bEND\s*$/i.test(currentSql.trimEnd());
  }

  if (leadingKeyword === 'CREATE' && candidateKeyword === 'SELECT') {
    return /\bAS\s*$/i.test(currentSql.trimEnd());
  }

  return false;
}

function findStatementStarts(sql: string): StatementStart[] {
  const starts: StatementStart[] = [];
  let state: 'normal' | 'single' | 'double' | 'backtick' | 'bracket' | 'line-comment' | 'block-comment' = 'normal';
  let depth = 0;
  let atLineStart = true;
  let previousTopLevelCharacter: string | undefined;

  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index];
    if (character === undefined) {
      break;
    }
    const next = sql[index + 1];

    if (character === '\n') {
      if (state === 'line-comment') {
        state = 'normal';
      }
      atLineStart = true;
      continue;
    }

    if (state === 'line-comment') {
      continue;
    }
    if (state === 'block-comment') {
      if (character === '*' && next === '/') {
        state = 'normal';
        index += 1;
      }
      continue;
    }
    if (state !== 'normal') {
      if (
        (state === 'single' && character === "'") ||
        (state === 'double' && character === '"') ||
        (state === 'backtick' && character === '`') ||
        (state === 'bracket' && character === ']')
      ) {
        const escapedByDoubling = state !== 'bracket' && next === character;
        if (escapedByDoubling) {
          index += 1;
        } else {
          state = 'normal';
        }
      }
      continue;
    }

    if (character === '-' && next === '-') {
      state = 'line-comment';
      index += 1;
      continue;
    }
    if (character === '/' && next === '*') {
      state = 'block-comment';
      index += 1;
      continue;
    }
    if (character === "'") {
      state = 'single';
      atLineStart = false;
      continue;
    }
    if (character === '"') {
      state = 'double';
      atLineStart = false;
      continue;
    }
    if (character === '`') {
      state = 'backtick';
      atLineStart = false;
      continue;
    }
    if (character === '[') {
      state = 'bracket';
      atLineStart = false;
      continue;
    }
    if (character === '(') {
      depth += 1;
      atLineStart = false;
      continue;
    }
    if (character === ')') {
      depth = Math.max(0, depth - 1);
      atLineStart = false;
      if (depth === 0) {
        previousTopLevelCharacter = character;
      }
      continue;
    }
    if (/\s/.test(character)) {
      continue;
    }

    if (atLineStart && depth === 0 && /[A-Za-z]/.test(character)) {
      const word = /^[A-Za-z]+/.exec(sql.slice(index))?.[0];
      const keyword = word?.toUpperCase();
      if (word && keyword && STATEMENT_STARTERS.has(keyword)) {
        starts.push({ offset: index, keyword, previousTopLevelCharacter });
      }
      if (word) {
        index += word.length - 1;
      }
      atLineStart = false;
      previousTopLevelCharacter = word?.at(-1);
      continue;
    }

    atLineStart = false;
    if (depth === 0) {
      previousTopLevelCharacter = character;
    }
  }

  return starts;
}
