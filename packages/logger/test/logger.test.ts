import { describe, expect, it } from 'vitest';
import {
  ConsoleTransport,
  LogLevel,
  Logger,
  MemoryTransport,
  createJsonFormatter,
  createLogger,
  parseLevel,
} from '../src/index';

const memory = () => new MemoryTransport();

describe('LogLevel', () => {
  it('parses level names case-insensitively', () => {
    expect(parseLevel('debug')).toBe(LogLevel.DEBUG);
    expect(parseLevel('WARN')).toBe(LogLevel.WARN);
    expect(parseLevel(LogLevel.FATAL)).toBe(LogLevel.FATAL);
    expect(parseLevel('nonsense')).toBe(LogLevel.INFO);
  });
});

describe('Logger', () => {
  it('filters messages below the configured level', () => {
    const t = memory();
    const log = new Logger({ level: LogLevel.WARN, transports: [t] });
    log.debug('nope');
    log.info('nope');
    log.warn('yes');
    log.error('yes');
    expect(t.records.map((r) => r.levelName)).toEqual(['warn', 'error']);
  });

  it('writes structured fields separately from the message', () => {
    const t = memory();
    const log = new Logger({ level: LogLevel.TRACE, transports: [t] });
    log.info('user login', { userId: 42, ok: true });
    expect(t.records[0]!.message).toBe('user login');
    expect(t.records[0]!.fields).toEqual({ userId: 42, ok: true });