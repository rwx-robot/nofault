import { levelName, type LogLevel } from './log-level';

/** 一条结构化日志记录 */
export interface LogRecord {
  timestamp: string;
  level: LogLevel;
  levelName: string;
  message: string;
  context?: string;
  /** 结构化字段 */