import { describe, expect, it, beforeEach } from 'vitest';
import 'reflect-metadata';
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  getEntityMeta,
  MemoryDataSource,
  Repository,
  Migrator,
  type Migration,
} from '../src/index';

@Entity({ table: 'users' })
class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'name', type: 'string' })
  name!: string;

  @Column({ name: 'age', type: 'int', nullable: true })
  age?: number;
