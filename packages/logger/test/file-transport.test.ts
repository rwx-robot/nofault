import { describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileTransport, LogLevel, Logger, MemoryTransport, createLogger } from '../src/index';

function tmpdir_(): string {
  return mkdtempSync(join(tmpdir(), 'nofault-log-'));
}

describe('FileTransport', () => {
  it('appends lines to the file', async () => {
    const dir = tmpdir_();
    const file = join(dir, 'app.log');
    const t = new FileTransport({ filePath: file });
    t.write('line one', { timestamp: '', level: LogLevel.INFO, levelName: 'info', message: 'line one' });
    t.write('line two', { timestamp: '', level: LogLevel.INFO, levelName: 'info', message: 'line two' });
    await t.flush();
    expect(readFileSync(file, 'utf8')).toBe('line one\nline two\n');
  });

  it('creates missing directories', () => {
    const dir = tmpdir_();
    const file = join(dir, 'nested', 'deep', 'app.log');
    new FileTransport({ filePath: file });
    expect(existsSync(file)).toBe(true);
  });

  it('names daily files after the local calendar date', async () => {
    vi.useFakeTimers();
    const dir = tmpdir_();
    try {
      // 本地 00:30：东八区此刻 UTC 仍属前一天，正是"UTC 还是本地"暴露差异的时刻
      vi.setSystemTime(new Date(2026, 8, 20, 0, 30, 0));
      const t = new FileTransport({ filePath: join(dir, 'app.log'), daily: true });
      t.write('x', { timestamp: '', level: LogLevel.INFO, levelName: 'info', message: 'x' });
      await t.flush();
      // 期望值按本地日历拼，而不是 toISOString() 的 UTC 日历
      expect(readdirSync(dir)).toEqual(['app.2026-09-20.log']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('switches daily files at local midnight', async () => {
    vi.useFakeTimers();
    const dir = tmpdir_();
    try {
      const record = { timestamp: '', level: LogLevel.INFO, levelName: 'info', message: 'x' };
      vi.setSystemTime(new Date(2026, 8, 20, 23, 59, 30));
      const t = new FileTransport({ filePath: join(dir, 'app.log'), daily: true });
      t.write('before', record);
      await t.flush();

      // 跨过本地午夜（不是 UTC 午夜，也不是本地早上 8 点）
      vi.setSystemTime(new Date(2026, 8, 21, 0, 0, 30));
      t.write('after', record);
      await t.flush();

      expect(readdirSync(dir).sort()).toEqual(['app.2026-09-20.log', 'app.2026-09-21.log']);
      expect(readFileSync(join(dir, 'app.2026-09-20.log'), 'utf8')).toBe('before\n');
      expect(readFileSync(join(dir, 'app.2026-09-21.log'), 'utf8')).toBe('after\n');
    } finally {
      vi.useRealTimers();
    }
  });

  it('rotates by size and keeps at most maxFiles', async () => {
    const dir = tmpdir_();
    const file = join(dir, 'rot.log');
    const t = new FileTransport({ filePath: file, maxSize: 50, maxFiles: 3 });
    const record = { timestamp: '', level: LogLevel.INFO, levelName: 'info', message: 'x' };
    for (let i = 0; i < 20; i++) {
      t.write('x'.repeat(20), record);
    }
    await t.flush();
    const files = readdirSync(dir).sort();
    expect(files.length).toBeLessThanOrEqual(4); // rot.log + 最多 3 份历史
    expect(files).toContain('rot.log');
  });

  it('buffers when flushEvery > 1 and flushes on demand', async () => {
    const dir = tmpdir_();
    const file = join(dir, 'buf.log');
    const t = new FileTransport({ filePath: file, flushEvery: 3 });
    const record = { timestamp: '', level: LogLevel.INFO, levelName: 'info', message: 'x' };
    t.write('a', record);
    t.write('b', record);
    expect(readFileSync(file, 'utf8')).toBe('');
    await t.flush();
    expect(readFileSync(file, 'utf8')).toBe('a\nb\n');
  });

  it('cleanup removes the log files', async () => {
    const dir = tmpdir_();
    const file = join(dir, 'clean.log');
    const t = new FileTransport({ filePath: file });
    t.write('x', { timestamp: '', level: LogLevel.INFO, levelName: 'info', message: 'x' });
    await t.flush().catch(() => undefined);
    t.cleanup();
    expect(readdirSync(dir)).toHaveLength(0);
  });
});

describe('Logger sampling', () => {
  it('drops debug/trace when rate is 0 but keeps info and above', () => {
    const t = new MemoryTransport();
    const log = new Logger({ level: LogLevel.TRACE, transports: [t], sampling: { rate: 0 } });
    log.trace('dropped');
    log.debug('dropped');
    log.info('kept');
    log.warn('kept');
    log.error('kept');
    expect(t.records.map((r) => r.levelName)).toEqual(['info', 'warn', 'error']);
  });

  it('keeps everything when rate is 1', () => {
    const t = new MemoryTransport();
    const log = new Logger({ level: LogLevel.TRACE, transports: [t], sampling: { rate: 1 } });
    log.debug('a');
    log.debug('b');
    expect(t.records).toHaveLength(2);
  });

  it('samples probabilistically around the given rate', () => {
    const t = new MemoryTransport();
    const log = new Logger({ level: LogLevel.TRACE, transports: [t], sampling: { rate: 0.5 } });
    const N = 4000;
    for (let i = 0; i < N; i++) log.debug('x');
    const ratio = t.records.length / N;
    // 0.5 ± 0.1 —— 用 Math.random 的正态近似，给足余量避免偶发失败
    expect(ratio).toBeGreaterThan(0.4);
    expect(ratio).toBeLessThan(0.6);
  });

  it('honours sampleBelow so info can be sampled too', () => {
    const t = new MemoryTransport();
    const log = new Logger({ level: LogLevel.TRACE, transports: [t], sampling: { rate: 0, sampleBelow: LogLevel.WARN } });
    log.debug('dropped');
    log.info('dropped');
    log.warn('kept');
    expect(t.records.map((r) => r.levelName)).toEqual(['warn']);
  });
});

describe('Logger contextProvider', () => {
  it('merges provider fields into every record', () => {
    const t = new MemoryTransport();
    const log = createLogger({
      transports: [t],
      contextProvider: () => ({ traceId: 'abc123', requestId: 'req_1' }),
    });
    log.info('hello', { userId: 1 });
    expect(t.records[0]!.fields).toEqual({ userId: 1, traceId: 'abc123', requestId: 'req_1' });
  });

  it('is inherited by child loggers', () => {
    const t = new MemoryTransport();
    const parent = createLogger({ transports: [t], contextProvider: () => ({ traceId: 'abc' }) });
    parent.child('db').info('x');
    expect(t.records[0]!.fields).toEqual({ traceId: 'abc' });
    expect(t.records[0]!.context).toBe('db');
  });

  it('tolerates a provider that returns nothing', () => {
    const t = new MemoryTransport();
    const log = createLogger({ transports: [t], contextProvider: () => undefined });
    log.info('x');
    expect(t.records[0]!.fields).toBeUndefined();
  });

  it('is called once per log call (not cached)', () => {
    const t = new MemoryTransport();
    let n = 0;
    const log = createLogger({ transports: [t], contextProvider: () => ({ n: ++n }) });
    log.info('a');
    log.info('b');
    expect(t.records.map((r) => r.fields?.n)).toEqual([1, 2]);
  });
});

describe('file logging end to end', () => {
  it('writes formatted json lines through a Logger', async () => {
    const dir = tmpdir_();
    const file = join(dir, 'e2e.log');
    writeFileSync(file, '');
    const transport = new FileTransport({ filePath: file });
    const log = createLogger({
      transports: [transport],
      contextProvider: () => ({ traceId: 'tid' }),
    });
    log.info('user created', { id: 7 });
    await transport.flush();
    const line = readFileSync(file, 'utf8').trim();
    expect(line).toContain('user created');
    expect(line).toContain('tid');
  });

  it('does not throw when the transport throws', () => {
    const bad = { write: vi.fn(() => { throw new Error('disk full'); }) };
    const log = createLogger({ transports: [bad] });
    expect(() => log.info('x')).not.toThrow();
  });
});
