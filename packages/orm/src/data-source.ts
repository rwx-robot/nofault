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