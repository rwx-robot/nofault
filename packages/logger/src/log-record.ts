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
  const record: LogRecord = {
    timestamp: new Date().toISOString(),
    level,
    levelName: levelName(level),
    message,
  };
  if (context) record.context = context;
  if (fields && Object.keys(fields).length > 0) record.fields = fields;
  if (error !== undefined) record.error = serializeError(error);
  return record;
}

export function serializeError(err: unknown): { name: string; message: string; stack?: string } {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  return { name: 'NonError', message: safeStringify(err) };
}

function safeStringify(v: unknown): string {
  try {
    return typeof v === 'string' ? v : JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/** 格式化器：把记录渲染成一行文本 */
export type LogFormatter = (record: LogRecord) => string;

export function createJsonFormatter(): LogFormatter {
  return (record) => JSON.stringify(record);
}

export function createPrettyFormatter(useColor = true): LogFormatter {
  return (record) => {
    const lvl = record.levelName.toUpperCase().padEnd(5);
    const color = useColor ? (COLORS[record.levelName] ?? '') : '';
    const reset = useColor ? RESET : '';