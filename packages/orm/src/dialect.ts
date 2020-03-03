/**
 * SQL 方言。
 *
 * 只做一件事：把结构化的意图翻译成 SQL 字符串 + 参数。
 * **不碰连接、不做 IO** —— 这样方言可以单测，也能被任何驱动复用。
 */
import type { ColumnMeta, ColumnType, EntityMeta } from './decorators';

export interface Sql {
  text: string;
  params: unknown[];
}

export interface SelectOptions {
  where?: WhereClause;
  orderBy?: Array<{ column: string; direction: 'ASC' | 'DESC' }>;
  limit?: number;
  offset?: number;
  columns?: string[];
}

export interface WhereClause {
  /** 组合方式，默认 AND */
  op?: 'AND' | 'OR';
  conditions: Condition[];
}

export type Condition =
  | { column: string; operator: CompareOperator; value: unknown }
  | { group: WhereClause };

export type CompareOperator =
  | '='
  | '!='
  | '>'
  | '>='
  | '<'
  | '<='
  | 'LIKE'
  | 'IN'
  | 'IS NULL'
  | 'IS NOT NULL';

export interface Dialect {
  placeholder(index: number): string;
  quote(name: string): string;
  columnType(column: ColumnMeta): string;
  createTable(meta: EntityMeta): Sql;
  insert(meta: EntityMeta, row: Record<string, unknown>): Sql;
  update(meta: EntityMeta, id: unknown, patch: Record<string, unknown>): Sql;
  deleteById(meta: EntityMeta, id: unknown): Sql;
  select(meta: EntityMeta, options: SelectOptions): Sql;
}

/** 通用 ANSI 风格方言（MySQL / SQLite 直接可用） */
export class AnsiDialect implements Dialect {
  placeholder(_index?: number): string {
    return '?';
  }

  quote(name: string): string {
    return ['`', name.replace(/`/g, '``'), '`'].join('');
  }

  columnType(column: ColumnMeta): string {
    const map: Record<ColumnType, string> = {
      int: 'INTEGER',
      bigint: 'BIGINT',
      float: 'REAL',
      string: 'VARCHAR(255)',
      text: 'TEXT',
      boolean: 'TINYINT(1)',
      date: 'DATETIME',
      json: 'TEXT',
    };
    return map[column.type];
  }

  createTable(meta: EntityMeta): Sql {
    const parts: string[] = [];
    for (const column of meta.columns.values()) {
      let def = `${this.quote(column.name)} ${this.columnType(column)}`;
      if (column.primary) def += ' PRIMARY KEY';
      if (column.generated && column.type === 'int') def += ' AUTOINCREMENT';
      else if (!column.nullable) def += ' NOT NULL';
      if (column.unique && !column.primary) def += ' UNIQUE';
      parts.push(def);
    }
    const body = parts.join(',\n  ');
    return { text: `CREATE TABLE IF NOT EXISTS ${this.quote(meta.table)} (\n  ${body}\n)`, params: [] };
  }

  insert(meta: EntityMeta, row: Record<string, unknown>): Sql {
    const entries = Object.entries(row);
    const columns = entries.map(([name]) => this.quote(name)).join(', ');
    const values = entries.map(() => this.placeholder(0)).join(', ');
    return {