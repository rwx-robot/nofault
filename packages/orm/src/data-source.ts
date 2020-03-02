/**
 * 数据源：ORM 与"真正的存储"之间唯一的边界。
 *
 * 提供两种实现：
 * - `MemoryDataSource`：纯内存表，语义完整（增删查改 + 事务快照回滚），开箱可用、可测
 * - `SqlDataSource`：把方言生成的 SQL 交给调用方传入的 executor，
 *   **不绑定任何具体驱动**——mysql2 / pg / better-sqlite3 都能接
 *
 * 之所以不直接依赖某个驱动：框架不该替业务选数据库，
 * 而"能在没有数据库的情况下跑起来"对示例和测试是刚需。
 */
import type { EntityMeta, ColumnMeta } from './decorators';
import { getEntityMeta } from './decorators';
import { AnsiDialect, type Dialect, type SelectOptions, type WhereClause } from './dialect';
import type { Condition } from './dialect';
import { createSchema, executeRaw, type MemorySchema } from './memory-sql';

export type Row = Record<string, unknown>;

export interface QueryResult {
  rows: Row[];
  /** INSERT 时回填的自增 id（如果存储支持） */
  insertId?: number;
  affectedRows: number;
}

export interface Executor {
  (sql: string, params: unknown[]): Promise<QueryResult>;
}

export interface DataSource {
  readonly name: string;
  createTable(meta: EntityMeta): Promise<void>;
  insert(meta: EntityMeta, row: Row): Promise<QueryResult>;
  update(meta: EntityMeta, id: unknown, patch: Row): Promise<QueryResult>;
  delete(meta: EntityMeta, id: unknown): Promise<QueryResult>;
  select(meta: EntityMeta, options: SelectOptions): Promise<Row[]>;
  count(meta: EntityMeta, where?: WhereClause): Promise<number>;
  /** 开启事务：回调内所有写操作进入事务，抛错自动回滚 */
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  inTransaction(): boolean;
  raw(sql: string, params?: unknown[]): Promise<QueryResult>;
  close(): Promise<void>;
}

// ------------------------------------------------------------------ 内存实现

interface Table {
  rows: Row[];
  sequence: number;
}

export class MemoryDataSource implements DataSource {
  readonly name = 'memory';
  private readonly tables = new Map<string, Table>();
  private readonly schema: MemorySchema = createSchema();
  private depth = 0;
  private snapshot = new Map<string, Row[]>();
  private schemaSnapshot = new Map<string, Row[]>();

  async createTable(meta: EntityMeta): Promise<void> {
    if (!this.tables.has(meta.table)) this.tables.set(meta.table, { rows: [], sequence: 0 });
    this.raw(
      `CREATE TABLE IF NOT EXISTS ${meta.table} (${[...meta.columns.values()].map((c) => c.name).join(', ')})`,
    );
  }

  async insert(meta: EntityMeta, row: Row): Promise<QueryResult> {
    const table = this.table(meta);
    const stored = { ...row };
    const primary = meta.primaryColumn ? meta.columns.get(meta.primaryColumn) : undefined;
    if (primary?.generated && (stored[primary.name] === undefined || stored[primary.name] === null)) {
      table.sequence += 1;
      stored[primary.name] = table.sequence;
    }
    table.rows.push(stored);
    return { rows: [stored], insertId: primary ? (stored[primary.name] as number) : undefined, affectedRows: 1 };
  }

  async update(meta: EntityMeta, id: unknown, patch: Row): Promise<QueryResult> {
    const table = this.table(meta);
    const primary = requirePrimary(meta);
    let affected = 0;
    for (const row of table.rows) {
      if (row[primary.name] === id) {
        Object.assign(row, patch);
        affected++;
      }
    }
    return { rows: [], affectedRows: affected };
  }

  async delete(meta: EntityMeta, id: unknown): Promise<QueryResult> {
    const table = this.table(meta);
    const primary = requirePrimary(meta);
    const before = table.rows.length;
    table.rows = table.rows.filter((row) => row[primary.name] !== id);
    return { rows: [], affectedRows: before - table.rows.length };
  }

  async select(meta: EntityMeta, options: SelectOptions): Promise<Row[]> {
    const table = this.table(meta);
    let rows = table.rows.filter((row) => matches(row, options.where, meta));
    if (options.orderBy?.length) {
      const [first] = options.orderBy;
      rows = [...rows].sort((a, b) => compare(a[first!.column], b[first!.column], first!.direction));
    }
    const offset = options.offset ?? 0;
    const limit = options.limit ?? rows.length;
    return rows.slice(offset, offset + limit).map((row) => ({ ...row }));
  }

  async count(meta: EntityMeta, where?: WhereClause): Promise<number> {
    return this.table(meta).rows.filter((row) => matches(row, where, meta)).length;
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    if (this.depth === 0) {
      // 只在最外层打快照：嵌套事务（Savepoint 语义）共享同一份回滚点。
      // 快照**必须包含 raw 写入的表**（如 schema_migrations），
      // 否则迁移失败时版本号已落库、结构却回滚了，下次永远不会重试。
      this.snapshot = new Map([...this.tables].map(([name, t]) => [name, t.rows.map((r) => ({ ...r }))]));
      this.schemaSnapshot = new Map([...this.schema.rows].map(([name, rows]) => [name, rows.map((r) => ({ ...r }))]));
    }
    this.depth++;
    try {
      const result = await fn();
      this.depth--;
      if (this.depth === 0) {
        this.snapshot = new Map();
        this.schemaSnapshot = new Map();
      }
      return result;
    } catch (err) {
      this.depth = 0;
      for (const [name, rows] of this.snapshot) {
        const table = this.tables.get(name);
        if (table) table.rows = rows;
      }
      for (const [name, rows] of this.schemaSnapshot) {
        this.schema.rows.set(name, rows);
      }
      this.snapshot = new Map();
      this.schemaSnapshot = new Map();
      throw err;
    }
  }

  inTransaction(): boolean {
    return this.depth > 0;
  }

  /** 走迷你 SQL 引擎，让 migration 在没有真实数据库时也能跑通 */
  async raw(sql: string, params: unknown[] = []): Promise<QueryResult> {
    const result = executeRaw(this.schema, sql, params);
    return { rows: result.rows, affectedRows: result.affectedRows };
  }

  async close(): Promise<void> {
    this.tables.clear();
  }

  private table(meta: EntityMeta): Table {
    let table = this.tables.get(meta.table);
    if (!table) {
      table = { rows: [], sequence: 0 };
      this.tables.set(meta.table, table);
    }
    return table;
  }
}

function compare(a: unknown, b: unknown, direction: 'ASC' | 'DESC'): number {
  const order = sameValue(a, b) ? 0 : (a as number) > (b as number) ? 1 : -1;
  return direction === 'ASC' ? order : -order;
}

/**
 * 存储层的值比较。
 *
 * 布尔在落库时被写成 1/0（SQL 没有 boolean），而实体上的字段是 true/false。
 * 若直接用 `===` 比，`active = true` 永远查不到东西——
 * 这类"能存进去却查不出来"的 bug 极难察觉，所以统一在这里归一化。
 */
function sameValue(a: unknown, b: unknown): boolean {
  return normalizeValue(a) === normalizeValue(b);
}

function normalizeValue(value: unknown): unknown {