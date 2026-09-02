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