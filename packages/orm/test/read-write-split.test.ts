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

    await seed(replica, 'replica-row');
    // 读从副本出：读到的是副本里那行，不是主库那行
    const rows = await split.select(meta, {});
    expect(rows.map((r) => r.name)).toEqual(['replica-row']);
  });

  it('reads from the primary inside a transaction (read-your-writes)', async () => {
    const primary = new MemoryDataSource();
    const replica = new MemoryDataSource();
    const split = new ReadWriteSplitDataSource({ primary, replicas: [replica] });
    await seed(primary, 'primary-row');
    await seed(replica, 'replica-row');

    // 事务外：读副本
    expect((await split.select(meta, {})).map((r) => r.name)).toEqual(['replica-row']);

    // 事务内：必须回主库，否则复制延迟下读己之写必然踩空
    await split.transaction(async () => {
      expect(split.inTransaction()).toBe(true);
      expect((await split.select(meta, {})).map((r) => r.name)).toEqual(['primary-row']);
      expect((await split.count(meta))).toBe(1);
    });
    expect(split.inTransaction()).toBe(false);
  });

  it('keeps reads on the primary for the sticky window after a write', async () => {
    const primary = new MemoryDataSource();
    const replica = new MemoryDataSource();
    const split = new ReadWriteSplitDataSource({ primary, replicas: [replica], stickyMs: 80 });
    await seed(replica, 'replica-row');

    await split.insert(meta, { name: 'primary-row' });
    // 粘连窗口内：写后立刻读，回主库才看得到自己刚写的数据
    expect((await split.select(meta, {})).map((r) => r.name)).toEqual(['primary-row']);

    // 窗口过后恢复读副本
    await sleep(120);
    expect((await split.select(meta, {})).map((r) => r.name)).toEqual(['replica-row']);
  });

  it('fails over to the primary and cools the replica down', async () => {
    const primary = new MemoryDataSource();
    const flaky = new FlakyReplica();
    const onReplicaError = vi.fn();
    const split = new ReadWriteSplitDataSource({
      primary,
      replicas: [flaky],
      cooldownMs: 50,
      onReplicaError,
    });
    await seed(primary, 'primary-row');

    // 副本挂了：读降级到主库，读请求不能成片失败
    flaky.failing = true;
    expect((await split.select(meta, {})).map((r) => r.name)).toEqual(['primary-row']);
    expect(onReplicaError).toHaveBeenCalledTimes(1);

    // 副本恢复但仍在冷却期内：继续走主库（不拿用户请求试错）
    flaky.failing = false;
    expect((await split.select(meta, {})).map((r) => r.name)).toEqual(['primary-row']);

    // 冷却到期：自动回到副本，无需人工干预
    await sleep(80);
    expect((await split.select(meta, {})).map((r) => r.name)).toEqual(['replica-row']);
  });

  it('rotates reads across healthy replicas', async () => {
    const primary = new MemoryDataSource();
    const replicaA = new MemoryDataSource();
    const replicaB = new MemoryDataSource();
    await seed(replicaA, 'from-a');
    await seed(replicaB, 'from-b');
    const split = new ReadWriteSplitDataSource({ primary, replicas: [replicaA, replicaB] });

    const first = await split.select(meta, {});
    const second = await split.select(meta, {});
    const third = await split.select(meta, {});
    // 轮询：依次落在 a、b、a——读压力均匀分布
    expect(first.map((r) => r.name)).toEqual(['from-a']);
    expect(second.map((r) => r.name)).toEqual(['from-b']);
    expect(third.map((r) => r.name)).toEqual(['from-a']);
  });

  it('propagates createTable to every backend', async () => {
    const primary = new MemoryDataSource();
    const replicaA = new MemoryDataSource();
    const replicaB = new MemoryDataSource();
    const spyA = vi.spyOn(replicaA, 'createTable');
    const spyB = vi.spyOn(replicaB, 'createTable');
    const split = new ReadWriteSplitDataSource({ primary, replicas: [replicaA, replicaB] });

    // 只建主库的话，读请求打过去就是"表不存在"
    await split.createTable(meta);