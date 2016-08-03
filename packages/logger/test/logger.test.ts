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