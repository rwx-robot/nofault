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

  @Column({ name: 'email', unique: true })
  email!: string;

  @Column({ name: 'active', type: 'boolean' })
  active = true;

  @CreateDateColumn({ name: 'created_at' })
  createdAt?: Date;
}

describe('entity mapping', () => {
  it('derives the table name and column names', () => {
    const meta = getEntityMeta(User);
    expect(meta.table).toBe('users');
    expect(meta.primaryColumn).toBe('id');
    expect([...meta.columns.values()].map((c) => c.name)).toEqual([
      'id',
      'name',
      'age',
      'email',
      'active',
      'created_at',
    ]);
  });

  it('infers column types from the TS design:type', () => {
    const meta = getEntityMeta(User);
    expect(meta.columns.get('name')!.type).toBe('string');
    expect(meta.columns.get('active')!.type).toBe('boolean');
    expect(meta.columns.get('createdAt')!.type).toBe('date');
  });

  it('refuses to work with a class that has no @Entity()', () => {
    class Plain {}
    expect(() => getEntityMeta(Plain)).toThrow(/not an entity/);
  });
});