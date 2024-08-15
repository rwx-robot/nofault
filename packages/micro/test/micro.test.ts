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