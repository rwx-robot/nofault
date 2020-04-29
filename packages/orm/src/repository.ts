/**
 * Repository + 查询构造器。
 *
 * 刻意**不做**的事：脏检查、自动 flush、关联懒加载。
 * 代价是每次要显式 `save()`；收益是"什么时候落库"在代码上一眼可见——
 * 在高并发服务里，隐式写库是最难排查的一类问题。
 */
import 'reflect-metadata';
import type { Type } from '@nofault/core';
import { getEntityMeta, type EntityMeta } from './decorators';
import type { DataSource, Row } from './data-source';
import type { CompareOperator, WhereClause } from './dialect';

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface OrderBy {
  column: string;
  direction?: 'ASC' | 'DESC';
}

export class QueryBuilder<T extends object> {
  private readonly where: WhereClause = { op: 'AND', conditions: [] };
  private orders: OrderBy[] = [];
  private take?: number;
  private skip?: number;

  constructor(
    private readonly meta: EntityMeta,
    private readonly source: DataSource,
  ) {}

  andWhere(column: keyof T & string, operator: CompareOperator, value: unknown): this {
    this.where.conditions.push({ column, operator, value });
    return this;
  }
