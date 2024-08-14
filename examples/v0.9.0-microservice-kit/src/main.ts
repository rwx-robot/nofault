/**
 * v0.9.0 示例入口：用 `Microservice` 把前面九个版本的能力一次装起来。
 *
 * **这个文件的全部内容就是顺序**——每一步写在这里、而不是别处，都有理由：
 *
 * ```
 * 1. 迁移              —— 表结构必须先就位
 * 2. 订阅事件          —— 在接流量之前，保证不会有事件没人处理
 * 3. 起 HTTP 并监听    —— 到这里才对外可见
 * 4. 起定时任务        —— 任务要在服务可用之后才跑
 * 5. 置就绪            —— 探针此刻才敢回答"能服务"
 * ```
 *
 * 停机是它的逆序（注册顺序反过来自动执行）：先停定时任务、
 * 再关 HTTP 监听（不再收新请求）、最后释放数据源。
 */
import 'reflect-metadata';
import { Microservice, Scheduler, MemoryLockBackend, DistributedLock } from '@nofault/micro';
import { Migrator } from '@nofault/orm';
import { InMemoryExporter, MetricRegistry, Tracer, observability } from '@nofault/telemetry';
import { rateLimit } from '@nofault/resilience';
import { RestApplication, bodyParser } from '@nofault/rest';

import {
  Order,
  OrderModule,
  cache,
  events,
  settleLock,
  snowflake,
  source,
  TOPIC_ORDER_CREATED,
} from './orders';

const PORT = Number(process.env.PORT ?? 3000);

const exporter = new InMemoryExporter();
const tracer = new Tracer(exporter, () => true, 32);
const registry = new MetricRegistry();
const scheduler = new Scheduler({ tickMs: 1000 });

/** 结算清扫任务的锁：多实例部署时同一时刻只跑一个 */
const sweepLock = new DistributedLock('order-sweep', new MemoryLockBackend(), { ttlMs: 10_000 });

// 订阅者：订单创建后打一笔审计。
// 用事件而不是在 OrderService 里直接调用，加第二个消费者（发券、通知）时
// 完全不用改 OrderService —— 这是事件总线存在的唯一理由
events.subscribe(TOPIC_ORDER_CREATED, (payload) => {
  console.log(`[audit] order created ${JSON.stringify(payload)}`);
});

const svc = new Microservice({
  name: 'order-service',
  bootstrap: [
    // 1. 迁移：结构没就位就接流量，等于让半初始化的实例开始处理请求
    async (ctx) => {
      const migrator = new Migrator(source, [
        {
          version: '001-create-orders',
          async up(h) {
            await h.createTable(Order);
          },
          async down(h) {
            await h.dropTable(Order);
          },
        },
      ]);
      const applied = await migrator.up();
      ctx.log(`migrations applied: ${applied.length > 0 ? applied.join(', ') : 'none'}`);
    },

    // 2. HTTP：依赖全 Greeter 之后再对外可见
    async (ctx) => {
      const app = await RestApplication.create(OrderModule, {
        quiet: true,
        // 顺序有讲究：先解析 body（后面每个中间件和 handler 都要用），
        // 再限流（挡在业务前面），最后可观测（要量到全链路时长）
        middleware: [
          bodyParser(),
          observability({ tracer, metrics: registry }).use,
          rateLimit({ capacity: 200, refillPerSecond: 50 }),
        ] as never[],
      });
      const { port } = await app.listen(PORT, '0.0.0.0');
      ctx.log(`http listening on ${port}`);
      ctx.onStop(async () => {
        await app.close();
      });
    },

    // 3. 定时任务
    (ctx) => {
      scheduler.every(