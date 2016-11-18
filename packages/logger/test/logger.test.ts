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
  });

  it('attaches serialized errors', () => {
    const t = memory();
    const log = new Logger({ level: LogLevel.ERROR, transports: [t] });
    log.error('boom', undefined, new TypeError('bad type'));
    expect(t.records[0]!.error).toMatchObject({ name: 'TypeError', message: 'bad type' });
    expect(t.records[0]!.error!.stack).toBeDefined();
  });

  it('derives child loggers that keep the parent context', () => {
    const t = memory();
    const root = createLogger({ level: LogLevel.INFO, context: 'app', transports: [t] });
    root.child('db').info('connected');
    expect(t.records[0]!.context).toBe('app:db');
  });

  it('emits JSON when using the JSON formatter', () => {
    const t = memory();
    const log = new Logger({ level: LogLevel.INFO, transports: [t], formatter: createJsonFormatter() });
    log.info('hello', { a: 1 });
    const parsed = JSON.parse(t.lines[0]!) as Record<string, unknown>;
    expect(parsed.message).toBe('hello');
    expect(parsed.levelName).toBe('info');
  });

  it('exposes level predicates', () => {
    const log = new Logger({ level: LogLevel.WARN, transports: [] });
    expect(log.isLevelEnabled(LogLevel.ERROR)).toBe(true);
    expect(log.isLevelEnabled(LogLevel.DEBUG)).toBe(false);
    log.setLevel('debug');
    expect(log.isLevelEnabled(LogLevel.DEBUG)).toBe(true);
  });

  it('has a console transport that is constructible', () => {
    expect(new ConsoleTransport()).toBeInstanceOf(ConsoleTransport);
  });
});
