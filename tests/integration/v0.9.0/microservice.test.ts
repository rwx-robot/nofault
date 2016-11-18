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