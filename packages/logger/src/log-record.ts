import { levelName, type LogLevel } from './log-level';

/** 一条结构化日志记录 */
export interface LogRecord {
  timestamp: string;
  level: LogLevel;
  levelName: string;
  message: string;
  context?: string;
  /** 结构化字段 */
  fields?: Record<string, unknown>;
  /** 错误堆栈（error/fatal 时填充） */
  error?: { name: string; message: string; stack?: string };
}

const COLORS: Record<string, string> = {
  trace: '\x1b[90m',
  debug: '\x1b[36m',
  info: '\x1b[32m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
  fatal: '\x1b[35m',
};
const RESET = '\x1b[0m';

export function createRecord(
  level: LogLevel,
  message: string,
  context?: string,
  fields?: Record<string, unknown>,
  error?: unknown,
): LogRecord {