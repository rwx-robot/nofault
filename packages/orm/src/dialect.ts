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
      text: `INSERT INTO ${this.quote(meta.table)} (${columns}) VALUES (${values})`,
      params: entries.map(([, value]) => value),
    };
  }

  update(meta: EntityMeta, id: unknown, patch: Record<string, unknown>): Sql {
    const primary = requirePrimary(meta);
    const entries = Object.entries(patch);
    const set = entries.map(([name]) => `${this.quote(name)} = ${this.placeholder(0)}`).join(', ');
    return {
      text: `UPDATE ${this.quote(meta.table)} SET ${set} WHERE ${this.quote(primary.name)} = ${this.placeholder(0)}`,
      params: [...entries.map(([, v]) => v), id],
    };
  }

  deleteById(meta: EntityMeta, id: unknown): Sql {
    const primary = requirePrimary(meta);
    return {
      text: `DELETE FROM ${this.quote(meta.table)} WHERE ${this.quote(primary.name)} = ${this.placeholder(0)}`,
      params: [id],
    };
  }

  select(meta: EntityMeta, options: SelectOptions): Sql {
    const params: unknown[] = [];
    const projection = options.columns?.length
      ? options.columns.map((c) => this.quote(c)).join(', ')
      : [...meta.columns.values()].map((c) => this.quote(c.name)).join(', ');

    let text = `SELECT ${projection} FROM ${this.quote(meta.table)}`;
    if (options.where) {
      const push = (value: unknown): string => {
        params.push(value);
        return this.placeholder(params.length - 1);
      };
      const rendered = renderWhere(options.where, this, push);
      if (rendered) text += ` WHERE ${rendered}`;
    }
    if (options.orderBy?.length) {
      text += ` ORDER BY ${options.orderBy.map((o) => `${this.quote(o.column)} ${o.direction}`).join(', ')}`;
    }
    if (options.limit !== undefined) {
      text += ` LIMIT ${this.placeholder(0)}`;
      params.push(options.limit);
    }
    if (options.offset !== undefined) {
      text += ` OFFSET ${this.placeholder(0)}`;
      params.push(options.offset);
    }
    return { text, params };
  }
}

export function renderWhere(clause: WhereClause, dialect: Dialect, push: (value: unknown) => string): string {
  if (clause.conditions.length === 0) return '';
  const parts = clause.conditions.map((condition) => {
    if ('group' in condition) {
      const inner = renderWhere(condition.group, dialect, push);
      return inner ? `(${inner})` : '';
    }
    const column = dialect.quote(condition.column);
    if (condition.operator === 'IS NULL' || condition.operator === 'IS NOT NULL') {
      return `${column} ${condition.operator}`;