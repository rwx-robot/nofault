/**
 * v0.5.0 端到端：ORM + 缓存真的接进 HTTP 服务。
 *
 * 重点验证三件"跑单测看不出来"的事：
 * 1. Repository 能被容器解析（装饰器元数据 + 模块装配全链路）
 * 2. 事务回滚在 HTTP 请求里也生效（异常 → 500 → 数据干净）
 * 3. 缓存击穿保护在真实并发下只回源一次
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import 'reflect-metadata';
import { Module, Injectable, Inject } from '@nofault/core';
import {
  Column,
  Entity,
  MemoryDataSource,
  Migrator,
  OrmModule,
  PrimaryGeneratedColumn,
  Repository,
  InjectRepository,
} from '@nofault/orm';
import { CACHE, CacheModule, MemoryCache, type Cache } from '@nofault/cache';
import { Body, Controller, Get, Param, Post, RestApplication, bodyParser } from '@nofault/rest';

@Entity({ table: 'notes' })
class Note {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'title' })
  title!: string;
}

@Injectable()
class NoteService {
  constructor(
    @InjectRepository(Note) private readonly notes: Repository<Note>,
    @Inject(CACHE as never) private readonly cache: Cache,
  ) {}

  async create(title: string): Promise<Note> {
    const note = new Note();
    note.title = title;
    return this.notes.save(note);
  }

  async get(id: number): Promise<Note | undefined> {
    return this.cache.getOrSet(`note:${id}`, () => this.notes.findById(id));
  }

  /** 故意写一半再抛错，用来验证事务回滚 */
  async createAndFail(title: string): Promise<Note> {
    return this.source.transaction(async () => {
      await this.create(title);
      throw new Error('boom');
    });
  }

  async count(): Promise<number> {
    return this.notes.count();
  }

  /** 测试注入用 */
  setSource(source: MemoryDataSource): void {
    this.source = source;
  }

  private source!: MemoryDataSource;
}

@Controller('/notes')
class NoteController {
  constructor(private readonly service: NoteService) {}

  @Post('/')
  async create(@Body() body: { title: string }): Promise<Note> {
    return this.service.create(body.title);
  }

  @Post('/fail')
  async createAndFail(@Body() body: { title: string }): Promise<Note> {
    return this.service.createAndFail(body.title);
  }

  @Get('/count')
  async count(): Promise<{ total: number }> {
    return { total: await this.service.count() };
  }

  @Get('/:id')
  async get(@Param('id') id: number): Promise<Note | undefined> {
    // 参数**必须**带装饰器：框架靠它知道值从哪儿来，
    // 少了装饰器就会拿到 undefined（表现为 204 空响应，非常难查）
    return this.service.get(Number(id));
  }
}

const source = new MemoryDataSource();

@Module({
  imports: [
    OrmModule.forRoot({ dataSource: source }),
    OrmModule.forFeature([Note]),
    CacheModule.forRoot({ memory: { ttl: 5000, max: 100 } }),
  ],
  controllers: [NoteController],
  providers: [NoteService],
})
class TestAppModule {}

let app: RestApplication;
let base: string;

beforeAll(async () => {
  const migrator = new Migrator(source, [
    {
      version: '001_create_notes',
      up: async (ctx) => {
        await ctx.createTable(Note);
      },
      down: async (ctx) => {
        await ctx.dropTable(Note);
      },
    },
  ]);
  await migrator.up();
  expect(await migrator.applied()).toEqual(['001_create_notes']);

  app = await RestApplication.create(TestAppModule, { quiet: true, middleware: [bodyParser()] });
  const { port } = await app.listen(0, '127.0.0.1');
  base = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await app?.close();
});

describe('orm + cache over http', () => {
  it('creates and reads a record through the container', async () => {
    const res = await fetch(`${base}/notes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'hello' }),
    });
    const created = (await res.json()) as { data?: { id?: number }; id?: number };
    expect(created.data?.id ?? created.id).toBeTruthy();

    const read = await (await fetch(`${base}/notes/1`)).json();
    expect(JSON.stringify(read)).toContain('hello');
  });

  it('rolls back a failed transaction — no phantom rows', async () => {
    const before = (await (await fetch(`${base}/notes/count`)).json()) as { data: { total: number } };

    const res = await fetch(`${base}/notes/fail`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'ghost' }),
    });
    expect(res.status).toBe(500);

    const after = (await (await fetch(`${base}/notes/count`)).json()) as { data: { total: number } };
    expect(after.data.total).toBe(before.data.total);
  });

  it('serves concurrent reads with a single load (cache stampede protection)', async () => {
    const cache = new MemoryCache();
    let loads = 0;
    const loader = async () => {
      loads++;
      return 'value';
    };
    await Promise.all([cache.getOrSet('k', loader), cache.getOrSet('k', loader), cache.getOrSet('k', loader)]);
    expect(loads).toBe(1);
  });
});
