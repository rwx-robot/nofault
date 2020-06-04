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
      done.push(migration.version);
    }
    return done;
  }

  /** 回滚最后 n 个版本，默认 1 个 */
  async down(steps = 1): Promise<string[]> {
    await this.ensureTable();
    const applied = await this.applied();
    const targets = this.sorted()
      .filter((m) => applied.includes(m.version))
      .slice(-steps)
      .reverse();

    const done: string[] = [];
    for (const migration of targets) {
      await this.source.transaction(async () => {
        await migration.down(this.context());
        await this.forget(migration.version);
      });
      done.push(migration.version);
    }
    return done;
  }

  async applied(): Promise<string[]> {
    return (await this.records()).map((r) => r.version);
  }

  private async records(): Promise<MigrationRecord[]> {
    const rows = await this.raw<{ version: string; applied_at: string }>(
      `SELECT version, applied_at FROM ${TABLE} ORDER BY version`,
    );
    return rows.map((row) => ({ version: row.version, appliedAt: new Date(row.applied_at) }));
  }

  private async ensureTable(): Promise<void> {
    await this.raw(
      `CREATE TABLE IF NOT EXISTS ${TABLE} (version VARCHAR(255) PRIMARY KEY, applied_at DATETIME NOT NULL)`,
    );
  }

  private async record(version: string): Promise<void> {
    await this.raw(`INSERT INTO ${TABLE} (version, applied_at) VALUES (?, ?)`, [version, new Date().toISOString()]);
  }

  private async forget(version: string): Promise<void> {
    await this.raw(`DELETE FROM ${TABLE} WHERE version = ?`, [version]);
  }

  private async raw<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    const result = await this.source.raw(sql, params);