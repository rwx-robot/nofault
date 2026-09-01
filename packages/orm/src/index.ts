/**
 * @nofault/orm —— 数据访问（v0.5.0）。
 *
 * 分层：`装饰器/元数据 → 方言（纯字符串）→ 数据源（IO 边界）→ Repository`
 * 方言不碰 IO、Repository 不碰 SQL，两边的单测因此可以完全独立。
 */
export {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  getEntityMeta,
  isEntity,
  toSnakeCase,
} from './decorators';
export type { ColumnOptions, ColumnType, ColumnMeta, EntityMeta, EntityOptions } from './decorators';

export { ORM_METADATA } from './metadata';

export { AnsiDialect, renderWhere } from './dialect';
export type { Dialect, Sql, SelectOptions, WhereClause, Condition, CompareOperator } from './dialect';

export { MemoryDataSource, SqlDataSource } from './data-source';
export type { DataSource, Executor, QueryResult, Row, SqlDataSourceOptions } from './data-source';

export { ReadWriteSplitDataSource } from './read-write-split';
export type { ReadWriteSplitOptions } from './read-write-split';

export { Repository, QueryBuilder } from './repository';
export type { Page, OrderBy } from './repository';

export { Migrator } from './migration';
export type { Migration, MigrationContext, MigrationRecord } from './migration';

export { OrmModule, getRepositoryToken, InjectRepository, DATA_SOURCE } from './orm.module';
export type { OrmModuleOptions } from './orm.module';
