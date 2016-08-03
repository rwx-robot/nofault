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