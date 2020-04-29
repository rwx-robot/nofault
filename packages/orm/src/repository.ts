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

  orWhere(column: keyof T & string, operator: CompareOperator, value: unknown): this {
    this.where.op = 'OR';
    this.where.conditions.push({ column, operator, value });
    return this;
  }

  whereIn(column: keyof T & string, values: unknown[]): this {
    this.where.conditions.push({ column, operator: 'IN', value: values });
    return this;
  }

  whereGroup(clause: (qb: QueryBuilder<T>) => void): this {
    const nested = new QueryBuilder<T>(this.meta, this.source);
    clause(nested);
    this.where.conditions.push({ group: nested.buildWhere() });
    return this;
  }

  orderBy(column: keyof T & string, direction: 'ASC' | 'DESC' = 'ASC'): this {
    this.orders.push({ column, direction });
    return this;
  }

  limit(n: number): this {
    this.take = n;
    return this;
  }

  offset(n: number): this {
    this.skip = n;
    return this;
  }

  buildWhere(): WhereClause {
    return this.where;
  }

  async getMany(): Promise<T[]> {
    const rows = await this.source.select(this.meta, {
      where: this.where,
      orderBy: this.orders.map((o) => ({ column: columnName(this.meta, o.column), direction: o.direction ?? 'ASC' })),
      limit: this.take,
      offset: this.skip,
    });
    return rows.map((row) => toEntity<T>(this.meta, row));
  }

  async getOne(): Promise<T | undefined> {
    const many = await this.limit(1).getMany();
    return many[0];
  }

  async getCount(): Promise<number> {
    return this.source.count(this.meta, this.where);
  }

  async getManyAndCount(): Promise<[T[], number]> {
    const [items, total] = await Promise.all([this.getMany(), this.getCount()]);
    return [items, total];
  }
}

export class Repository<T extends object> {
  readonly meta: EntityMeta;

  constructor(
    private readonly target: Type<T>,
    private readonly source: DataSource,
  ) {
    this.meta = getEntityMeta(target);
  }

  get tableName(): string {
    return this.meta.table;
  }

  /** 建表（幂等）。生产环境请交给 migration，这里是为了让示例和测试能直接跑 */
  async sync(): Promise<void> {
    await this.source.createTable(this.meta);
  }

  createQueryBuilder(): QueryBuilder<T> {
    return new QueryBuilder<T>(this.meta, this.source);
  }

  async save(entity: T): Promise<T> {
    // 自增主键上的 0 一定是"占位"而不是真实值：
    // TS 里 `const u = new User(); u.id` 恒为 0，若照原样写入，
    // 第二条记录就会撞主键、或者拿到一个永远不存在的 id=0。
    const generated = this.meta.primaryColumn ? this.meta.columns.get(this.meta.primaryColumn) : undefined;
    if (generated?.generated) {
      const value = (entity as Row)[generated.property];
      if (value === 0 || value === undefined || value === null) {
        delete (entity as Row)[generated.property];
      }
    }

    const row = toRow(this.meta, entity, 'insert');
    const result = await this.source.insert(this.meta, row);

    // 回写数据库侧产生的值：自增 id、onCreate 填充的时间戳。
    // 不回写的话，调用方拿到的是一个"库里有、对象上没有"的半截实体。
    for (const column of this.meta.columns.values()) {
      if (column.generated && row[column.name] !== undefined) {
        (entity as Row)[column.property] = row[column.name];
      } else if ((entity as Row)[column.property] === undefined && row[column.name] !== undefined) {
        (entity as Row)[column.property] = row[column.name];
      }
    }
    const primary = this.meta.primaryColumn ? this.meta.columns.get(this.meta.primaryColumn) : undefined;
    if (primary && result.insertId !== undefined) {
      (entity as Row)[primary.property] = result.insertId;
    }
    return entity;
  }

  async update(entity: T, patch: Partial<T> = entity): Promise<T> {
    const primary = this.primaryColumnOrThrow();
    const id = (entity as Row)[primary.property];
    const row = toRow(this.meta, patch as T, 'update');
    await this.source.update(this.meta, id, row);
    Object.assign(entity, patch);
    return entity;
  }

  /** upsert：有主键就更新，没有就插入 */
  async persist(entity: T): Promise<T> {
    const primary = this.meta.primaryColumn ? this.meta.columns.get(this.meta.primaryColumn) : undefined;
    const id = primary ? (entity as Row)[primary.property] : undefined;
    return id === undefined || id === null ? this.save(entity) : this.update(entity);
  }

  async delete(entity: T | T[keyof T]): Promise<boolean> {
    const primary = this.primaryColumnOrThrow();
    const id = typeof entity === 'object' && entity !== null ? (entity as Row)[primary.property] : entity;
    const result = await this.source.delete(this.meta, id);
    return result.affectedRows > 0;
  }

  async findAll(): Promise<T[]> {
    const rows = await this.source.select(this.meta, {});
    return rows.map((row) => toEntity<T>(this.meta, row));
  }

  async findById(id: unknown): Promise<T | undefined> {
    const primary = this.primaryColumnOrThrow();
    const rows = await this.source.select(this.meta, {
      where: { conditions: [{ column: primary.name, operator: '=', value: id }] },
      limit: 1,
    });
    return rows[0] ? toEntity<T>(this.meta, rows[0]) : undefined;
  }

  async findOne(where: Partial<T>): Promise<T | undefined> {
    const qb = this.createQueryBuilder();
    for (const [key, value] of Object.entries(where)) {
      qb.andWhere(key as keyof T & string, '=', value);
    }
    return qb.getOne();
  }

  async find(where: Partial<T>): Promise<T[]> {
    const qb = this.createQueryBuilder();
    for (const [key, value] of Object.entries(where)) {