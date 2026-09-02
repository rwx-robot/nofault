/**
 * 读写分离 —— 单主多副本的读路由层。
 *
 * `DataSource` 是"ORM 与真正的存储之间唯一的边界"（data-source.ts），
 * 这一层不碰 SQL、不碰驱动，只做**路由**：把 1 主 + N 副本
 * 组装成一个仍然符合 `DataSource` 接口的数据源，上层（Repository/Module）无感。
 *
 * 四条纪律：
 * 1. **写一律主库，无例外**。`raw()` 也走主库——裸 SQL 无法静态判断读写，
 *    按本项目的惯例默认选"拒绝"那一侧（宁可主库多扛，不可写丢）
 * 2. **事务内的读必须回主库**（read-your-writes）：连接还在主库事务里时，
 *    读副本等于放弃一致性，读到的必然是旧数据
 * 3. **副本失败不把读拖死**：标记冷却 + 降级主库。读是可用性优先——
 *    副本短暂不一致可以忍，读请求成片失败不能忍
 * 4. **`createTable` 落到所有库**：只建主库，读请求打过去就是"表不存在"
 */
import type { EntityMeta } from './decorators';
import type { SelectOptions, WhereClause } from './dialect';
import type { DataSource, QueryResult, Row } from './data-source';

export interface ReadWriteSplitOptions {
  primary: DataSource;
  replicas: DataSource[];
  /** 数据源名，默认 'read-write-split' */
  name?: string;
  /** 写之后的读回主库窗口（毫秒），默认 0（不粘连）。应对复制延迟下的"读己之写" */
  stickyMs?: number;
  /** 副本失败后的冷却时间（毫秒），默认 5000；冷却期内不再选中它 */
  cooldownMs?: number;
  /** 副本降级时的观测钩子（打点/告警），默认无 */
  onReplicaError?: (replica: DataSource, error: unknown) => void;
}

export class ReadWriteSplitDataSource implements DataSource {
  readonly name: string;
  private readonly primary: DataSource;
  private readonly replicas: DataSource[];
  private readonly stickyMs: number;
  private readonly cooldownMs: number;
  private readonly onReplicaError?: (replica: DataSource, error: unknown) => void;

  /** 轮询游标：读请求在健康副本间均匀分布 */
  private roundRobin = 0;
  /** 副本 → 冷却截止时间。时间戳而非布尔值，冷却到点自动恢复，无需定时器 */
  private readonly unhealthyUntil = new Map<DataSource, number>();
  /** 本层的事务深度：>0 即"在主库事务里"，读必须回主库 */
  private transactionDepth = 0;
  /** 最近一次写的时间戳 + 粘连窗口 = 粘连截止时间 */
  private stickyUntil = 0;

  constructor(options: ReadWriteSplitOptions) {
    if (options.replicas.length === 0) {
      throw new Error('read-write split requires at least one replica');
    }
    this.primary = options.primary;
    this.replicas = [...options.replicas];
    this.name = options.name ?? 'read-write-split';
    this.stickyMs = options.stickyMs ?? 0;
    this.cooldownMs = options.cooldownMs ?? 5000;
    this.onReplicaError = options.onReplicaError;
  }

  // ---------------------------------------------------------------- 写路径

  /** 建表是 schema 变更，必须落到**所有**库，而不是只建主库 */
  async createTable(meta: EntityMeta): Promise<void> {
    await this.primary.createTable(meta);
    for (const replica of this.replicas) {
      await replica.createTable(meta);
    }
  }

  insert(meta: EntityMeta, row: Row): Promise<QueryResult> {
    return this.write(() => this.primary.insert(meta, row));
  }

  update(meta: EntityMeta, id: unknown, patch: Row): Promise<QueryResult> {
    return this.write(() => this.primary.update(meta, id, patch));
  }

  delete(meta: EntityMeta, id: unknown): Promise<QueryResult> {
    return this.write(() => this.primary.delete(meta, id));
  }

  /** 裸 SQL 无法静态判断读写，一律主库（默认选拒绝侧） */
  raw(sql: string, params: unknown[] = []): Promise<QueryResult> {
    return this.write(() => this.primary.raw(sql, params));
  }

  /**