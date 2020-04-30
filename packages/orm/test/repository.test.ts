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

describe('repository', () => {
  let repo: Repository<User>;
  let source: MemoryDataSource;

  beforeEach(async () => {
    source = new MemoryDataSource();
    repo = new Repository(User, source);
    await repo.sync();
  });

  it('saves and backfills the generated id', async () => {
    const user = new User();
    user.name = 'alice';
    user.email = 'a@example.com';
    await repo.save(user);
    expect(user.id).toBe(1);
    expect(user.createdAt).toBeInstanceOf(Date);
  });

  it('finds by id and by column', async () => {
    const a = new User();
    a.name = 'alice';
    a.email = 'a@example.com';
    const b = new User();
    b.name = 'bob';
    b.email = 'b@example.com';
    await repo.save(a);
    await repo.save(b);

    expect((await repo.findById(1))?.name).toBe('alice');
    expect((await repo.findOne({ name: 'bob' }))?.email).toBe('b@example.com');
    expect(await repo.findAll()).toHaveLength(2);
    expect(await repo.count()).toBe(2);
  });

  it('updates then deletes', async () => {
    const user = new User();
    user.name = 'carol';
    user.email = 'c@example.com';
    await repo.save(user);

    await repo.update(user, { name: 'carol2' } as Partial<User>);
    expect((await repo.findById(user.id))?.name).toBe('carol2');

    expect(await repo.delete(user)).toBe(true);
    expect(await repo.findById(user.id)).toBeUndefined();
    // 重复删除要安静地返回 false，而不是抛错
    expect(await repo.delete(user.id)).toBe(false);
  });

  it('persist() inserts or updates depending on the primary key', async () => {
    const user = new User();
    user.name = 'dave';
    user.email = 'd@example.com';
    await repo.persist(user);
    const id = user.id;

    user.name = 'dave2';
    await repo.persist(user);
    expect(await repo.count()).toBe(1);