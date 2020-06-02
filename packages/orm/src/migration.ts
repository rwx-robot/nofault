/**
 * 迁移：把"表结构变更"变成可版本化、可回滚、可重复执行的代码。
 *
 * 三条纪律：
 * 1. 每个 migration 只做一件事，且**必须写 down**——没有回滚的迁移等于埋雷
 * 2. 已执行的版本记在 `schema_migrations` 表里，重复执行不会重跑
 * 3. up 失败即中止，后面的版本不执行（顺序是有依赖的）
 */
import type { DataSource } from './data-source';
import { getEntityMeta } from './decorators';

export interface Migration {
  /** 版本号，建议用时间戳如 `20200101_add_users` */
  version: string;
  up(ctx: MigrationContext): Promise<void>;
  down(ctx: MigrationContext): Promise<void>;
}

export interface MigrationContext {
  /** 执行原始 SQL */
  execute(sql: string, params?: unknown[]): Promise<unknown>;
  /** 建表（复用实体的映射定义，避免手写一遍列名） */
  createTable(entity: Function): Promise<void>;
  dropTable(entity: Function): Promise<void>;
  logger?: { info(message: string): void };
}

export interface MigrationRecord {
  version: string;
  appliedAt: Date;
}

const TABLE = 'schema_migrations';

export class Migrator {
  constructor(
    private readonly source: DataSource,
    private readonly migrations: Migration[] = [],
  ) {}

  add(migration: Migration): this {
    this.migrations.push(migration);
    return this;
  }

  /** 执行所有未应用的迁移，返回本次执行的版本号 */
  async up(): Promise<string[]> {
    await this.ensureTable();
    const applied = await this.applied();
    const pending = this.sorted().filter((m) => !applied.includes(m.version));
    const done: string[] = [];

    for (const migration of pending) {
      await this.source.transaction(async () => {
        await migration.up(this.context());
        await this.record(migration.version);
      });