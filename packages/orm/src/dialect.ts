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