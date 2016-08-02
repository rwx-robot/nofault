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