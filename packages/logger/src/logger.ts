import { LogLevel, parseLevel } from './log-level';
import { createRecord, createJsonFormatter, createPrettyFormatter, type LogFormatter, type LogRecord } from './log-record';

/** 输出目标：实现 `write` 即可接入文件、网络、stdout */
export interface LogTransport {
  write(line: string, record: LogRecord): void | Promise<void>;
  /** 关闭时刷新缓冲（文件传输需要） */
  flush?(): Promise<void>;
}

export interface LoggerOptions {
  level?: LogLevel | string;
  context?: string;
  formatter?: LogFormatter;
  transports?: LogTransport[];
  /** 固定附加字段（如 service、version） */
  baseFields?: Record<string, unknown>;
  /**
   * 上下文提供者：每条日志调用一次，把返回值合并进 fields。
   *
   * 典型用法是注入请求上下文，让**每一行日志自动带上 traceId**：
   * ```ts
   * createLogger({ contextProvider: () => currentContext()?.toJSON() })
   * ```
   * 放在这里而不是让 logger 依赖 `@nofault/context`，是为了保持 logger 零依赖。
   */
  contextProvider?: () => Record<string, unknown> | undefined | null;
  /**
   * 采样：只对**低于** `sampleBelow` 的级别生效（默认 INFO，即只采样 debug/trace）。
   *
   * 高频调试日志用它降本；`sampleBelow` 及以上永远不打折扣——
   * 问题排查最需要的就是 warn/error，那些不能丢。
   */
  sampling?: { rate: number; sampleBelow?: LogLevel };
}

/** 标准输出传输 */
export class ConsoleTransport implements LogTransport {
  constructor(
    private readonly stream: NodeJS.WriteStream = process.stdout,
  ) {}