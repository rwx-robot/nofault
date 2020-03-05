/**
 * 内存数据源的"迷你 SQL 引擎"。
 *
 * 只支持迁移与统计真正会用到的几条语句：
 * CREATE TABLE / DROP TABLE / INSERT / SELECT（含 COUNT(*)）/ DELETE / UPDATE。
 *
 * 为什么要写它：迁移必须能在**没有数据库**的情况下跑通（示例、测试、CI），
 * 而没有 raw SQL，`schema_migrations` 这张表就无处安放。
 * 范围严格限定在迁移用到的语法，超出即抛错——宁可明确失败，也不要假装支持。
 */
import type { Row } from './data-source';

export interface MemorySchema {
  /** 表名（列名集合用于列裁剪，值恒为 true） */
  tables: Map<string, Set<string>>;
  rows: Map<string, Row[]>;
}

export function createSchema(): MemorySchema {
  return { tables: new Map(), rows: new Map() };
}

export interface RawResult {
  rows: Row[];
  affectedRows: number;
}

export function executeRaw(schema: MemorySchema, sql: string, params: unknown[] = []): RawResult {
  const text = sql.trim().replace(/;$/, '');
  const head = text.split(/\s+/)[0]?.toUpperCase();

  switch (head) {
    case 'BEGIN':
    case 'COMMIT':
    case 'ROLLBACK':
      return { rows: [], affectedRows: 0 };
    case 'CREATE':
      return createTable(schema, text);
    case 'DROP':
      return dropTable(schema, text);
    case 'INSERT':
      return insert(schema, text, params);
    case 'SELECT':
      return select(schema, text, params);
    case 'UPDATE':
      return update(schema, text, params);
    case 'DELETE':
      return remove(schema, text, params);
    default:
      throw new Error(`MemoryDataSource does not support SQL: ${sql}`);
  }
}

function unquote(name: string): string {
  return name.replace(/^`|`$/g, '').replace(/^"|"$/g, '');
}

function createTable(schema: MemorySchema, sql: string): RawResult {
  const match = /^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\S+)\s*\(([\s\S]*)\)$/i.exec(sql);
  if (!match) throw new Error(`cannot parse CREATE TABLE: ${sql}`);
  const table = unquote(match[1]!);
  const columns = new Set(
    match[2]!
      .split(',')
      .map((part) => part.trim().split(/\s+/)[0])
      .filter((name) => name && !/^(PRIMARY|UNIQUE|KEY|CONSTRAINT|FOREIGN|INDEX)$/i.test(name))
      .map(unquote),
  );
  if (!schema.tables.has(table)) {
    schema.tables.set(table, columns);
    schema.rows.set(table, []);
  }
  return { rows: [], affectedRows: 0 };
}

function dropTable(schema: MemorySchema, sql: string): RawResult {
  const match = /^DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(\S+)$/i.exec(sql);
  if (!match) throw new Error(`cannot parse DROP TABLE: ${sql}`);
  const table = unquote(match[1]!);
  schema.tables.delete(table);
  schema.rows.delete(table);
  return { rows: [], affectedRows: 0 };
}

function insert(schema: MemorySchema, sql: string, params: unknown[]): RawResult {
  const match = /^INSERT\s+INTO\s+(\S+)\s*\(([^)]*)\)\s*VALUES\s*\(([^)]*)\)$/i.exec(sql);
  if (!match) throw new Error(`cannot parse INSERT: ${sql}`);
  const table = unquote(match[1]!);
  const columns = match[2]!.split(',').map((c) => unquote(c.trim()));
  const row: Row = {};
  columns.forEach((column, i) => {
    row[column] = params[i];
  });
  tableOf(schema, table).push(row);
  return { rows: [{ ...row }], affectedRows: 1 };
}

function select(schema: MemorySchema, sql: string, params: unknown[]): RawResult {
  const match = /^SELECT\s+([\s\S]+?)\s+FROM\s+(\S+)(?:\s+WHERE\s+([\s\S]+?))?(?:\s+ORDER\s+BY\s+(\S+))?$/i.exec(sql);
  if (!match) throw new Error(`cannot parse SELECT: ${sql}`);
  const projection = match[1]!.trim();
  const table = unquote(match[2]!);
  const whereSql = match[3];
  const rows = tableOf(schema, table).filter((row) => matches(row, whereSql, params));

  if (/COUNT\(\*\)/i.test(projection)) {
    const alias = /AS\s+(\w+)/i.exec(projection)?.[1] ?? 'total';
    return { rows: [{ [alias]: rows.length }], affectedRows: 0 };
  }
  const columns = projection === '*' ? null : projection.split(',').map((c) => unquote(c.trim()));
  const projected = rows.map((row) => (columns ? pick(row, columns) : { ...row }));
  return { rows: projected, affectedRows: projected.length };
}

function update(schema: MemorySchema, sql: string, params: unknown[]): RawResult {
  const match = /^UPDATE\s+(\S+)\s+SET\s+([\s\S]+?)(?:\s+WHERE\s+([\s\S]+))?$/i.exec(sql);
  if (!match) throw new Error(`cannot parse UPDATE: ${sql}`);
  const rows = tableOf(schema, unquote(match[1]!));
  const sets = match[2]!.split(',').map((part) => part.split('=').map((s) => s.trim()));
  const whereParams = countPlaceholders(match[3] ?? '');
  const setParams = params.slice(0, sets.length);
  const rest = params.slice(sets.length);

  let affected = 0;
  for (const row of rows) {
    if (!matches(row, match[3], rest)) continue;
    sets.forEach(([column], i) => {
      row[unquote(column!)] = setParams[i];
    });
    affected++;
  }
  void whereParams;
  return { rows: [], affectedRows: affected };
}

function remove(schema: MemorySchema, sql: string, params: unknown[]): RawResult {
  const match = /^DELETE\s+FROM\s+(\S+)(?:\s+WHERE\s+([\s\S]+))?$/i.exec(sql);
  if (!match) throw new Error(`cannot parse DELETE: ${sql}`);
  const table = unquote(match[1]!);
  const rows = tableOf(schema, table);
  const before = rows.length;
  const kept = rows.filter((row) => !matches(row, match[2], params));
  schema.rows.set(table, kept);
  return { rows: [], affectedRows: before - kept.length };
}

/** 只支持 `col = ?`（AND 连接）的简易 WHERE，够迁移用 */
function matches(row: Row, whereSql: string | undefined, params: unknown[]): boolean {
  if (!whereSql) return true;
  const clauses = whereSql.split(/\s+AND\s+/i);
  let index = 0;
  for (const clause of clauses) {
    const m = /^(\S+)\s*(=|!=|>|<|>=|<=)\s*(\?|\S+)$/.exec(clause.trim());
    if (!m) continue;
    const [, column, operator, raw] = m;
    let value: unknown;
    if (raw === '?') {
      value = params[index];
      index++;
    } else {
      value = unquote(raw!);
    }
    const actual = row[unquote(column!)];
    switch (operator) {
      case '=':
        if (actual !== value) return false;
        break;
      case '!=':
        if (actual === value) return false;
        break;
      case '>':
        if (!((actual as number) > (value as number))) return false;
        break;
      case '<':
        if (!((actual as number) < (value as number))) return false;
        break;
      case '>=':
        if (!((actual as number) >= (value as number))) return false;
        break;
      case '<=':
        if (!((actual as number) <= (value as number))) return false;
        break;
      default:
        break;
    }
  }
  return true;
}

function countPlaceholders(sql: string): number {
  return (sql.match(/\?/g) ?? []).length;
}

function pick(row: Row, columns: string[]): Row {
  const out: Row = {};
  for (const column of columns) out[column] = row[column];
  return out;
}

function tableOf(schema: MemorySchema, table: string): Row[] {
  let rows = schema.rows.get(table);