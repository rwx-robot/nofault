/**
 * 读写分离的单元测试。
 *
 * 路由是否正确必须是**可观察的事实**，不是实现的内部状态——
 * 所以主库与副本各用独立的 MemoryDataSource，插进不同的行，
 * 读到哪一行，就是路由到了哪个库。
 */
import { describe, expect, it, vi } from 'vitest';
import 'reflect-metadata';
import {
  Column,
  Entity,
  MemoryDataSource,
  PrimaryGeneratedColumn,
  ReadWriteSplitDataSource,
  getEntityMeta,
  type DataSource,
  type EntityMeta,
  type QueryResult,
  type Row,
} from '../src/index';

@Entity({ table: 'users' })
class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'name', type: 'string' })
  name!: string;
}

const meta: EntityMeta = getEntityMeta(User);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function seed(source: DataSource, name: string): Promise<void> {
  await source.insert(meta, { name });
}

/** 副本故障桩：select 可控地抛错，其余操作委托给真实内存库 */
class FlakyReplica implements DataSource {
  readonly name = 'flaky-replica';
  failing = false;
  private readonly inner = new MemoryDataSource();

  constructor() {
    void seed(this.inner, 'replica-row');
  }

  async select(): Promise<Row[]> {
    if (this.failing) throw new Error('replica is down');
    return this.inner.select(meta, {});
  }

  createTable(m: EntityMeta) {
    return this.inner.createTable(m);
  }
  insert(m: EntityMeta, row: Record<string, unknown>) {
    return this.inner.insert(m, row);
  }
  update(m: EntityMeta, id: unknown, patch: Record<string, unknown>) {
    return this.inner.update(m, id, patch);
  }
  delete(m: EntityMeta, id: unknown) {
    return this.inner.delete(m, id);
  }
  count(m: EntityMeta) {
    return this.inner.count(m);
  }
  transaction<T>(fn: () => Promise<T>) {
    return this.inner.transaction(fn);
  }
  inTransaction() {
    return this.inner.inTransaction();
  }
  raw(sql: string, params: unknown[] = []): Promise<QueryResult> {
    return this.inner.raw(sql, params);
  }
  close() {
    return this.inner.close();
  }
}

describe('read-write split', () => {
  it('sends writes to the primary and reads to the replicas', async () => {
    const primary = new MemoryDataSource();
    const replica = new MemoryDataSource();
    const split = new ReadWriteSplitDataSource({ primary, replicas: [replica] });

    await split.insert(meta, { name: 'primary-row' });
    // 写只进主库：副本上不该出现
    expect((await primary.select(meta, {})).map((r) => r.name)).toEqual(['primary-row']);
    expect(await replica.select(meta, {})).toEqual([]);
