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