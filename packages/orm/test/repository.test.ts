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
    expect(user.id).toBe(id);
  });

  it('supports the query builder with where / order / limit', async () => {
    for (const [name, age] of [['a', 10], ['b', 30], ['c', 20]] as const) {
      const user = new User();
      user.name = name;
      user.email = `${name}@example.com`;
      user.age = age;
      await repo.save(user);
    }

    const older = await repo.createQueryBuilder().andWhere('age', '>=', 20).orderBy('age', 'DESC').getMany();
    expect(older.map((u) => u.name)).toEqual(['b', 'c']);

    const [items, total] = await repo
      .createQueryBuilder()
      .andWhere('active', '=', true)
      .limit(2)
      .getManyAndCount();
    expect(items).toHaveLength(2);
    expect(total).toBe(3);

    const page = await repo.paginate(2, 2);
    expect(page.items).toHaveLength(1);
    expect(page.total).toBe(3);
    expect(page.page).toBe(2);
  });

  it('supports grouped conditions', async () => {
    for (const [name, age] of [['a', 10], ['b', 30], ['c', 40]] as const) {
      const user = new User();
      user.name = name;
      user.email = `${name}@example.com`;
      user.age = age;
      await repo.save(user);
    }
    const found = await repo
      .createQueryBuilder()
      .whereGroup((qb) => {
        qb.andWhere('name', '=', 'a').orWhere('name', '=', 'c');
      })
      .getMany();
    expect(found.map((u) => u.name).sort()).toEqual(['a', 'c']);
  });
});

describe('transactions', () => {
  it('rolls back every write when the callback throws', async () => {
    const source = new MemoryDataSource();
    const repo = new Repository(User, source);
    await repo.sync();

    const user = new User();
    user.name = 'eve';
    user.email = 'e@example.com';
    await repo.save(user);

    await expect(
      source.transaction(async () => {
        const another = new User();
        another.name = 'frank';
        another.email = 'f@example.com';
        await repo.save(another);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    // 回滚必须干净：既不能留下 frank，也不能误删 eve
    expect(await repo.count()).toBe(1);
    expect(await repo.findOne({ name: 'frank' })).toBeUndefined();
  });

  it('reports whether it is inside a transaction', async () => {
    const source = new MemoryDataSource();
    expect(source.inTransaction()).toBe(false);
    await source.transaction(async () => {
      expect(source.inTransaction()).toBe(true);
    });
    expect(source.inTransaction()).toBe(false);
  });
});

describe('migrations', () => {
  const makeMigration = (version: string): Migration => ({
    version,
    up: async (ctx) => {
      await ctx.execute(`CREATE TABLE IF NOT EXISTS t_${version} (id INTEGER)`);
    },
    down: async (ctx) => {
      await ctx.execute(`DROP TABLE IF EXISTS t_${version}`);
    },
  });

  it('applies pending migrations once and records them', async () => {
    const source = new MemoryDataSource();
    const migrator = new Migrator(source, [makeMigration('001'), makeMigration('002')]);

    expect(await migrator.up()).toEqual(['001', '002']);
    // 幂等：第二次执行什么也不做
    expect(await migrator.up()).toEqual([]);
    expect(await migrator.applied()).toEqual(['001', '002']);
  });

  it('rolls back the last migration', async () => {
    const source = new MemoryDataSource();
    const migrator = new Migrator(source, [makeMigration('001'), makeMigration('002')]);
    await migrator.up();

    expect(await migrator.down()).toEqual(['002']);
    expect(await migrator.applied()).toEqual(['001']);
  });

  it('keeps already committed migrations and stops at the broken one', async () => {
    const source = new MemoryDataSource();
    const migrator = new Migrator(source, [
      makeMigration('001'),
      {
        version: '002',
        up: async () => {
          throw new Error('bad migration');
        },
        down: async () => {},
      },
    ]);

    // 每个迁移各自一个事务：001 已提交，002 失败回滚。
    // 这才是想要的行为——已成功的部分不回退，失败的也不留下版本号，
    // 于是修好 002 之后可以直接重跑，不会"以为已经跑过"。
    await expect(migrator.up()).rejects.toThrow('bad migration');
    expect(await migrator.applied()).toEqual(['001']);
  });
});
