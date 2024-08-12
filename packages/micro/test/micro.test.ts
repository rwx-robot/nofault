/**
 * @nofault/micro 单元测试。
 *
 * 这里测的全是"实现错了也不报错、只会悄悄出错"的语义：
 * ID 是否唯一且单调、能否释放别人的锁、漏 warn 的 cron 是否能触发、
 * 一个订阅者抛错是否影响其他人、启动顺序是否先把探针置 false。
 */
import { describe, expect, it, vi } from 'vitest';
import {
  ClockMovedBackError,
  DistributedLock,
  EventBus,
  LockAcquisitionError,
  MemoryLockBackend,
  Microservice,
  Scheduler,
  Snowflake,
  matchesCron,
  parseCron,
} from '../src/index';

describe('snowflake ids', () => {
  it('produces unique, monotonically increasing ids', () => {
    const gen = new Snowflake({ workerId: 1, datacenterId: 1 });
    const ids: bigint[] = [];
    for (let i = 0; i < 5000; i++) ids.push(gen.nextId());

    expect(new Set(ids).size).toBe(5000);
    for (let i = 1; i < ids.length; i++) {
      expect(ids[i]! > ids[i - 1]!).toBe(true);
    }
  });

  it('keeps worker and datacenter in the id so sources can be told apart', () => {
    const a = new Snowflake({ workerId: 3, datacenterId: 5 });
    const b = new Snowflake({ workerId: 9, datacenterId: 11 });
    expect(a.parse(a.nextId())).toMatchObject({ workerId: 3, datacenterId: 5 });
    expect(b.parse(b.nextId())).toMatchObject({ workerId: 9, datacenterId: 11 });
  });

  it('round trips through the string form without losing precision', () => {
    // 63 位 ID 超过 Number.MAX_SAFE_INTEGER：放进 JSON 必须走字符串，
    // 否则末尾几位会被静默抹掉，两个不同的 ID 变成同一个
    const gen = new Snowflake({ workerId: 1 });
    const id = gen.nextId();
    expect(id).toBeGreaterThan(BigInt(Number.MAX_SAFE_INTEGER));
    expect(BigInt(gen.nextIdString())).toBeGreaterThan(0n);
    expect(gen.parse(id.toString()).workerId).toBe(1);
    expect(BigInt(id.toString())).toBe(id);
  });

  it('never repeats an id once the sequence runs out mid-millisecond', () => {
    const gen = new Snowflake();
    const seen = new Set<string>();

    let frozen = 1_700_000_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => frozen);

    // 同一毫秒只能有 4096 个（12 位序列号），这是硬上限
    for (let i = 0; i < 4096; i++) seen.add(gen.nextIdString());
    expect(seen.size).toBe(4096);

    // 第 4097 个必须**等到下一毫秒**，而不是回绕复用已经发过的序列号。
    // 这里用 fake timers 之外的手段推进时钟：真去自旋会卡死事件循环
    frozen += 1;
    const next = gen.nextIdString();
    expect(seen.has(next)).toBe(false);
    seen.add(next);
    expect(seen.size).toBe(4097);
    vi.restoreAllMocks();
  });

  it('refuses to generate ids when the clock jumps backwards too far', () => {
    const gen = new Snowflake({ clockRollbackToleranceMs: 10 });
    let now = 1_700_000_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    gen.nextId();
    now -= 5000;
    expect(() => gen.nextId()).toThrow(ClockMovedBackError);
    vi.restoreAllMocks();
  });

  it('rejects out of range worker ids', () => {
    expect(() => new Snowflake({ workerId: 32 })).toThrow(RangeError);
    expect(() => new Snowflake({ datacenterId: 99 })).toThrow(RangeError);
  });
});

describe('distributed lock', () => {
  it('is mutually exclusive', async () => {
    const backend = new MemoryLockBackend();
    // waitMs 要给足：20 个协程抢一把锁，不等待的话后 19 个会直接失败
    const lock = new DistributedLock('job', backend, {
      waitMs: 2000,
      retryMs: 2,
      autoRenew: false,
    });
    let concurrent = 0;
    let maxConcurrent = 0;

    await Promise.all(
      Array.from({ length: 20 }, () =>
        lock.run(async () => {
          concurrent += 1;
          maxConcurrent = Math.max(maxConcurrent, concurrent);
          await new Promise((r) => setTimeout(r, 2));
          concurrent -= 1;
        }),
      ),
    );
    expect(maxConcurrent).toBe(1);
  });

  it('refuses to release a lock it no longer owns', async () => {
    // 持锁超时 -> 被别人抢走 -> 原持有者恢复后释放。
    // 若不校验 token，这一步会把别人的锁删掉，两个实例同时进入临界区
    const backend = new MemoryLockBackend();
    const owner = new DistributedLock('job', backend, { ttlMs: 1, autoRenew: false });
    const other = new DistributedLock('job', backend, { ttlMs: 1000, autoRenew: false });

    const stolen = await owner.tryAcquire();
    expect(stolen).not.toBeNull();
    await new Promise((r) => setTimeout(r, 10));

    const second = await other.tryAcquire();
    expect(second).not.toBeNull();
    await stolen!.release();

    // other 的锁必须还在：third 应该拿不到
    const third = await other.tryAcquire();
    expect(third).toBeNull();
    await second!.release();
  });

  it('fails fast when waitMs elapses', async () => {
    const backend = new MemoryLockBackend();
    const holder = new DistributedLock('job', backend, { autoRenew: false });
    await holder.tryAcquire();

    const other = new DistributedLock('job', backend, { waitMs: 30, retryMs: 10, autoRenew: false });
    await expect(other.acquire()).rejects.toThrow(LockAcquisitionError);
  });

  it('releases even when the body throws', async () => {
    const backend = new MemoryLockBackend();
    const lock = new DistributedLock('job', backend, { autoRenew: false });
    await expect(
      lock.run(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    // 忘了释放的话，锁会一直挂到 TTL 到期，整个功能在这段时间里都是停的
    expect(await lock.tryAcquire()).not.toBeNull();
  });

  it('keeps the lock alive while auto renewing', async () => {
    const backend = new MemoryLockBackend();
    const lock = new DistributedLock('job', backend, { ttlMs: 40, renewEveryMs: 10 });
    const handle = await lock.tryAcquire();
    await new Promise((r) => setTimeout(r, 100));
    // TTL 只有 40ms，靠 watchdog 续期才没被别人抢走
    expect(await backend.extend('job', handle!.token, 40)).toBe(true);
    await handle!.release();
  });
});

describe('cron parsing', () => {
  it('parses every minute', () => {
    const cron = parseCron('* * * * *');
    expect(cron.minutes.size).toBe(60);
    expect(matchesCron(cron, new Date(2024, 0, 1, 12, 34))).toBe(true);
  });

  it('parses steps, ranges and lists', () => {
    const cron = parseCron('*/15 9-17 1,15 * *');
    expect([...cron.minutes].sort((a, b) => a - b)).toEqual([0, 15, 30, 45]);
    expect([...cron.hours].sort((a, b) => a - b)).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17]);
    expect([...cron.daysOfMonth].sort((a, b) => a - b)).toEqual([1, 15]);
  });

  it('treats day-of-month and day-of-week as OR, like unix cron', () => {
    // `0 0 1 * 0` = 每月 1 号 **或** 每周日。做成 AND 就永远不会触发
    const cron = parseCron('0 0 1 * 0');
    const firstOfMonth = new Date(2024, 0, 1, 0, 0);
    const someSunday = new Date(2024, 0, 7, 0, 0);
    expect(matchesCron(cron, firstOfMonth)).toBe(true);
    expect(someSunday.getDay()).toBe(0);
    expect(matchesCron(cron, someSunday)).toBe(true);
    expect(matchesCron(cron, new Date(2024, 0, 2, 0, 0))).toBe(false);
  });

  it('normalises day-of-week 7 to Sunday', () => {
    expect([...parseCron('0 0 * * 7').daysOfWeek]).toEqual([0]);
  });

  it('rejects malformed expressions', () => {
    expect(() => parseCron('* * * *')).toThrow(/5 fields/);
    expect(() => parseCron('99 * * * *')).toThrow(/expected 0-59/);
    expect(() => parseCron('*/* * * * *')).toThrow(/invalid step/);
  });
});

describe('scheduler', () => {
  it('skips a tick instead of stacking up when the previous run is still going', async () => {
    const scheduler = new Scheduler({ tickMs: 5 });
    let runs = 0;
    let running = 0;
    let max = 0;

    scheduler.every(
      5,
      async () => {
        runs += 1;
        running += 1;
        max = Math.max(max, running);
        await new Promise((r) => setTimeout(r, 30));
        running -= 1;
      },
      { name: 'slow' },
    );

    scheduler.start();
    await new Promise((r) => setTimeout(r, 60));
    scheduler.stop();

    expect(runs).toBeGreaterThan(0);
    // 默认不允许重叠：慢任务不会越积越多变成自我 DoS
    expect(max).toBe(1);
  });

  it('lets one failing job take nobody else down with it', async () => {
    const errors: Array<[unknown, string]> = [];
    const scheduler = new Scheduler({ tickMs: 5, onError: (e, n) => errors.push([e, n]) });
    let healthyRuns = 0;

    scheduler.every(
      5,
      () => {
        throw new Error('always fails');
      },
      { name: 'bad' },
    );
    scheduler.every(5, () => {
      healthyRuns += 1;
    }, { name: 'good' });

    scheduler.start();
    await new Promise((r) => setTimeout(r, 40));
    scheduler.stop();

    expect(errors.length).toBeGreaterThan(0);
    expect(healthyRuns).toBeGreaterThan(0);
  });

  it('schedules fixed-delay runs after the previous one finishes', async () => {
    const scheduler = new Scheduler({ tickMs: 5 });
    const stamps: number[] = [];
    scheduler.fixedDelay(
      20,
      async () => {
        stamps.push(Date.now());
        await new Promise((r) => setTimeout(r, 15));
      },
      { name: 'delay' },
    );

    scheduler.start();
    await new Promise((r) => setTimeout(r, 90));
    scheduler.stop();

    expect(stamps.length).toBeGreaterThanOrEqual(2);
    const gap = stamps[1]! - stamps[0]!;
    // 15ms 的任务 + 20ms 间隔 ≈ 35ms 以上；按"开始时刻"算就会撞在一起
    expect(gap).toBeGreaterThan(30);
  });
});

describe('event bus', () => {
  it('delivers to every subscriber', async () => {
    const bus = new EventBus();
    const seen: string[] = [];
    bus.subscribe('user.created', () => {
      seen.push('a');
    });
    bus.subscribe('user.created', () => {
      seen.push('b');
    });
    await bus.publish('user.created', { id: 1 });
    expect(seen.sort()).toEqual(['a', 'b']);
  });

  it('isolates a throwing subscriber from the others', async () => {
    const errors: unknown[] = [];
    const bus = new EventBus({ onError: (e) => errors.push(e) });
    let ok = 0;
    bus.subscribe('x', () => {
      throw new Error('nope');
    });
    bus.subscribe('x', () => {
      ok += 1;
    });

    await bus.publish('x', 1);
    expect(ok).toBe(1);
    // 错误不能被吞掉：事件"发出去了却什么都没发生"是最难查的一类 bug
    expect(errors.length).toBe(1);
  });

  it('honours once subscriptions', async () => {
    const bus = new EventBus();
    let count = 0;
    bus.once('x', () => {
      count += 1;
    });
    await bus.publish('x', 1);
    await bus.publish('x', 2);
    expect(count).toBe(1);
    expect(bus.subscriberCount('x')).toBe(0);
  });

  it('returns an unsubscribe function to avoid leaks', async () => {
    const bus = new EventBus();
    let count = 0;
    const off = bus.subscribe('x', () => {
      count += 1;
    });
    off();
    await bus.publish('x', 1);
    expect(count).toBe(0);
    expect(bus.subscriberCount('x')).toBe(0);
  });

  it('delivers in registration order when sequential', async () => {
    const bus = new EventBus({ sequential: true });
    const order: string[] = [];
    bus.subscribe('x', async () => {
      await new Promise((r) => setTimeout(r, 10));
      order.push('slow');
    });
    bus.subscribe('x', () => {
      order.push('fast');
    });
    await bus.publish('x', 1);
    expect(order).toEqual(['slow', 'fast']);
  });
});

describe('microservice lifecycle', () => {
  it('runs hooks in order and only flips ready at the very end', async () => {
    const trace: string[] = [];
    const svc = new Microservice({
      name: 'svc',
      shutdown: { captureSignals: false },
      bootstrap: [
        async () => {
          trace.push('connect');
        },
        async () => {
          trace.push('migrate');
        },
      ],
      beforeReady: [
        async (ctx) => {
          // 到这里为止探针必须还是未就绪：否则会有流量打进半初始化的实例
          trace.push(`before-ready:${ctx.ready()}`);
        },
      ],
    });

    await svc.start();
    expect(trace).toEqual(['connect', 'migrate', 'before-ready:false']);
    expect(svc.ready()).toBe(true);
    expect(svc.phase()).toBe('running');
  });

  it('runs stop hooks in reverse and unreadies first', async () => {
    const trace: string[] = [];
    const svc = new Microservice({
      name: 'svc',
      shutdown: { captureSignals: false },
      bootstrap: [
        (ctx) => {
          ctx.onStop(() => {
            trace.push('close-pool');
          });
          ctx.onStop(() => {
            trace.push('deregister');
          });
          ctx.onStop(() => {
            trace.push(`ready-during-stop:${svc.ready()}`);
          });
        },
      ],
    });

    await svc.start();
    await svc.stop();
    // 逆序：最后注册的最先跑；且第一件事就是让探针说不健康
    expect(trace).toEqual(['ready-during-stop:false', 'deregister', 'close-pool']);
    expect(svc.phase()).toBe('stopped');
  });

  it('tears down what it set up when startup fails', async () => {
    let released = false;
    const svc = new Microservice({
      name: 'svc',
      shutdown: { captureSignals: false },
      bootstrap: [
        (ctx) => {
          ctx.onStop(() => {
            released = true;
          });
        },
        async () => {
          throw new Error('migration failed');
        },
      ],
    });

    await expect(svc.start()).rejects.toThrow('migration failed');
    // 启动失败却留着连接池/监听器 = 泄漏。这里必须已经清理干净
    expect(released).toBe(true);
    expect(svc.phase()).toBe('stopped');
  });

  it('is idempotent when started twice', async () => {
    let bootstraps = 0;
    const svc = new Microservice({
      name: 'svc',
      shutdown: { captureSignals: false },
      bootstrap: [
        () => {
          bootstraps += 1;
        },
      ],
    });
    await svc.start();
    await svc.start();
    expect(bootstraps).toBe(1);
    expect(svc.ready()).toBe(true);
  });
});
