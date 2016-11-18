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
