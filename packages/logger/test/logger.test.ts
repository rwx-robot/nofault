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