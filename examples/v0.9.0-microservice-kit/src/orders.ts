/**
 * 用 @nofault/micro 提供的原语写业务：Snowflake ID、分布式锁、事件总线。
 *
 * 这些能力在前面的版本里都没有，以前要么自己写、要么直接省掉
 * （省掉的后果通常是"上线三个月后才在某个偶发场景炸掉"）。
 */
import { Injectable, Module } from '@nofault/core';
import {
  Column,
  Entity,
  InjectRepository,
  MemoryDataSource,
  OrmModule,
  PrimaryGeneratedColumn,
  Repository,
} from '@nofault/orm';
import { MemoryCache } from '@nofault/cache';
import { EventBus, Snowflake, DistributedLock, MemoryLockBackend } from '@nofault/micro';
import { Body, Controller, Get, Param, Post, HttpException, Ctx, RestContext } from '@nofault/rest';

export const TOPIC_ORDER_CREATED = 'order.created';

@Entity({ table: 'orders' })
export class Order {
  @PrimaryGeneratedColumn()
  id!: number;

  /** 业务主键走 Snowflake：对外暴露的 ID 不能是自增数字 */
  @Column({ name: 'public_id' })
  publicId!: string;

  @Column({ name: 'amount', type: 'int' })
  amount!: number;

  @Column({ name: 'status' })
  status!: string;
}

export interface OrderView {
  id: string;
  amount: number;
  status: string;
}

@Injectable()
export class OrderService {
  constructor(
    @InjectRepository(Order) private readonly repo: Repository<Order>,
    private readonly cache: MemoryCache,
    private readonly events: EventBus,
    private readonly snowflake: Snowflake,
    private readonly lock: DistributedLock,
  ) {}

  async create(amount: number): Promise<OrderView> {
    if (!Number.isFinite(amount) || amount <= 0) {
      // 参数错误要在最外层就挡住：它不是依赖故障，不该触发熔断
      throw new HttpException(400, 'amount must be a positive number', 400);
    }

    const order = new Order();
    order.publicId = this.snowflake.nextIdString();
    order.amount = amount;
    order.status = 'created';

    await this.repo.save(order);
    await this.events.publish(TOPIC_ORDER_CREATED, { id: order.publicId, amount });

    const view = { id: order.publicId, amount, status: 'created' };
    await this.cache.set(`order:${order.publicId}`, view, { ttl: 60_000 });
    return view;
  }

  async find(publicId: string): Promise<OrderView> {
    const cached = await this.cache.get<OrderView>(`order:${publicId}`);
    if (cached !== undefined) return cached;

    // findOne 按**实体属性**过滤，不是按列名
    const found = await this.repo.findOne({ publicId });
    if (!found) throw new HttpException(404, `order ${publicId} not found`, 404);

    const view = { id: found.publicId, amount: found.amount, status: found.status };
    await this.cache.set(`order:${publicId}`, view, { ttl: 60_000 });
    return view;
  }