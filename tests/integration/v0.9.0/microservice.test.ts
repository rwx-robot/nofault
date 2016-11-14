/**
 * v0.9.0 端到端：把 ORM + 治理 + micro 原语装配成一个真服务，跑真实 HTTP。
 *
 * 验证的都是"只有分布式/并发环境才会暴露"的点：
 * 1. 启动顺序：探针在一切都就位之前必须回答"不能服务"
 * 2. 并发结算同一笔订单只能成功一次（分布式锁真的互斥）
 * 3. ID 超出 MAX_SAFE_INTEGER 且能反解出机器号（多实例可分）
 * 4. 事件订阅者与业务解耦（加消费者不用改业务逻辑）
 */
import { afterAll, describe, expect, it } from 'vitest';
import 'reflect-metadata';
import { Injectable, Module } from '@nofault/core';
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  RestApplication,
  HttpException,
  bodyParser,
} from '@nofault/rest';
import {
  Column,
  Entity,
  MemoryDataSource,
  Migrator,
  PrimaryGeneratedColumn,
  getEntityMeta,
} from '@nofault/orm';
import { EventBus, MemoryLockBackend, DistributedLock, Microservice, Snowflake } from '@nofault/micro';

@Entity({ table: 'orders9' })
class Order {
  @PrimaryGeneratedColumn()
  id!: number;
  @Column({ name: 'public_id' })
  publicId!: string;
  @Column({ name: 'status' })
  status!: string;
}

const meta = getEntityMeta(Order);
const source = new MemoryDataSource();
const events = new EventBus();
const settleLock = new DistributedLock('it-settle', new MemoryLockBackend(), {
  ttlMs: 2000,
  waitMs: 2000,
  retryMs: 2,
});
const snowflake = new Snowflake({ workerId: 7, datacenterId: 3 });

const seenEvents: Array<{ id: string }> = [];
events.subscribe('order.created', (payload) => {
  seenEvents.push(payload as { id: string });
});

@Injectable()
class OrderService {
  async create(amount: number): Promise<{ id: string; status: string }> {
    const order = new Order();
    order.publicId = snowflake.nextIdString();
    order.status = 'created';
    await source.insert(meta, { public_id: order.publicId, status: order.status });
    await events.publish('order.created', { id: order.publicId, amount });
    return { id: order.publicId, status: 'created' };
  }

  async settle(publicId: string): Promise<{ id: string; status: string }> {
    return settleLock.run(async () => {
      // select() 直接返回行数组（不是 { rows } 包一层）
      const rows = await source.select(meta, {
        where: { conditions: [{ column: 'public_id', operator: '=', value: publicId }] },
      });
      if (rows.length === 0) throw new HttpException(404, 'not found', 404);

      const current = rows[0] as { id: number; status: string };
      if (current.status !== 'created') throw new HttpException(409, 'already settled', 409);

      // 慢一点，让并发的第二个请求有机会进来 —— 不然测不出互斥
      await new Promise((resolve) => setTimeout(resolve, 30));
      await source.update(meta, current.id, { status: 'settled' });
      return { id: publicId, status: 'settled' };
    });
  }
}

@Controller('/orders')
class OrderController {
  constructor(private readonly service: OrderService) {}

  @Post('/')
  async create(@Body() body: { amount: number }): Promise<{ id: string; status: string }> {
    return this.service.create(body.amount);
  }

  @Get('/:id/settle')
  async settle(@Param('id') id: string): Promise<{ id: string; status: string }> {
    return this.service.settle(id);
  }
}

@Module({ controllers: [OrderController], providers: [OrderService] })
class AppModule {}

let app: RestApplication;
let base = '';

afterAll(async () => {
  await app?.close();
});

describe('microservice kit over http', () => {
  it('starts in the prescribed order and only then reports ready', async () => {
    const trace: string[] = [];
    const svc = new Microservice({
      name: 'it-service',
      shutdown: { captureSignals: false },
      bootstrap: [
        async () => {
          const applied = await new Migrator(source, [
            {
              version: '001-orders',
              async up(h) {
                await h.createTable(Order);
              },
              async down(h) {
                await h.dropTable(Order);
              },
            },
          ]).up();
          trace.push(`migrate:${applied.length}`);
        },
        async () => {
          app = await RestApplication.create(AppModule, { quiet: true, middleware: [bodyParser()] });
          const { port } = await app.listen(0, '127.0.0.1');
          base = `http://127.0.0.1:${port}`;
          trace.push('listen');
        },
      ],
      beforeReady: [
        (ctx) => {
          // 此刻探针必须还说不健康：否则就有流量打进半初始化的实例
          trace.push(`ready-during-boot:${ctx.ready()}`);
        },
      ],
    });

    await svc.start();
    expect(trace).toEqual(['migrate:1', 'listen', 'ready-during-boot:false']);
    expect(svc.ready()).toBe(true);
  });

  it('issues snowflake ids that carry the machine number', async () => {
    const res = await fetch(`${base}/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amount: 99 }),
    });
    expect(res.status).toBe(200);
    const { id } = ((await res.json()) as { data: { id: string } }).data;

    // 63 位 > MAX_SAFE_INTEGER，所以走字符串；反解能看出是哪台机器发的
    expect(BigInt(id)).toBeGreaterThan(BigInt(Number.MAX_SAFE_INTEGER));
    expect(snowflake.parse(id)).toMatchObject({ workerId: 7, datacenterId: 3 });

    // 事件订阅者与业务逻辑解耦：加消费者不用改 OrderService
    expect(seenEvents.some((e) => e.id === id)).toBe(true);
  });

  it('settles an order exactly once under concurrent requests', async () => {
    const created = await fetch(`${base}/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amount: 10 }),
    });
    const { id } = ((await created.json()) as { data: { id: string } }).data;

    const responses = await Promise.all(
      Array.from({ length: 3 }, () => fetch(`${base}/orders/${id}/settle`)),
    );
    const codes = responses.map((r) => r.status);

    expect(codes.filter((c) => c === 200).length).toBe(1);
    // 其余必须是 409（已被结算），不能是 200 —— 那就是重复扣款了
    expect(codes.filter((c) => c === 409).length).toBe(2);
  });

  it('runs stop hooks in reverse registration order', async () => {
    const trace: string[] = [];
    const svc = new Microservice({
      name: 'reverse',
      shutdown: { captureSignals: false },
      bootstrap: [
        (ctx) => {
          ctx.onStop(() => {
            trace.push('first-registered');
          });
          ctx.onStop(() => {
            trace.push('last-registered');
          });
        },
      ],
    });

    await svc.start();
    await svc.stop();

    // 后装的最先卸：否则先卸的东西可能还被依赖它的东西用着
    expect(trace).toEqual(['last-registered', 'first-registered']);
    expect(svc.phase()).toBe('stopped');
  });
});
