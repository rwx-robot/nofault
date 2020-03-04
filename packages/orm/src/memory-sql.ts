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