import { describe, expect, it, vi } from 'vitest';
import {
  ConsoleTransport,
  LogLevel,
  Logger,
  MemoryTransport,
  createJsonFormatter,
  createLogger,
  parseLevel,
} from '../src/index';
import type { LogRecord } from '../src/log-record';

const fakeStream = (): { stream: NodeJS.WriteStream; write: ReturnType<typeof vi.fn> } => {
  const write = vi.fn();
  return { stream: { write } as unknown as NodeJS.WriteStream, write };
};

const recordAt = (level: LogLevel): LogRecord =>
  ({ timestamp: '', level, levelName: LogLevel[level].toLowerCase(), message: 'x' }) as LogRecord;

describe('ConsoleTransport', () => {
  it('routes error and above to the error stream, the rest to the normal stream', () => {
    const out = fakeStream();
    const err = fakeStream();
    const t = new ConsoleTransport(out.stream, err.stream);
    t.write('info-line', recordAt(LogLevel.INFO));
    t.write('error-line', recordAt(LogLevel.ERROR));
    t.write('fatal-line', recordAt(LogLevel.FATAL));
    expect(out.write).toHaveBeenCalledTimes(1);
    expect(out.write.mock.calls[0]![0]).toBe('info-line\n');
    expect(err.write).toHaveBeenCalledTimes(2);
  });

  it('does not leak error lines into the real stderr when a custom stream is given', () => {
    const out = fakeStream();
    const err = fakeStream();
    const t = new ConsoleTransport(out.stream, err.stream);
    t.write('error-line', recordAt(LogLevel.ERROR));
    // 修复前：error/fatal 无视构造传入的流，永远写 process.stderr——
    // 测试里注入内存流时错误行会悄悄漏到真 stderr，测试进程输出被污染
    expect(err.write).toHaveBeenCalledWith('error-line\n');
  });
});

const memory = () => new MemoryTransport();

describe('LogLevel', () => {
  it('parses level names case-insensitively', () => {
    expect(parseLevel('debug')).toBe(LogLevel.DEBUG);
    expect(parseLevel('WARN')).toBe(LogLevel.WARN);