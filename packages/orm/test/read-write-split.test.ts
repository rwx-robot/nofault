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
