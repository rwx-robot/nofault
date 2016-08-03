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
    /** error/fatal 的去处；默认 stderr 便于容器日志分流，测试里可注入内存流避免漏写真 stderr */
    private readonly errorStream: NodeJS.WriteStream = process.stderr,
  ) {}

  write(line: string, record: LogRecord): void {
    // error/fatal 走 error 流，便于容器日志分流
    const target = record.level >= LogLevel.ERROR ? this.errorStream : this.stream;
    target.write(line + '\n');
  }
}

/** 内存传输：测试与断言场景 */
export class MemoryTransport implements LogTransport {
  public readonly records: LogRecord[] = [];
  public readonly lines: string[] = [];

  write(line: string, record: LogRecord): void {
    this.lines.push(line);
    this.records.push(record);
  }

  clear(): void {
    this.records.length = 0;
    this.lines.length = 0;
  }
}

/**
 * nofault 日志器。
 *
 * 设计要点：
 * - 结构化优先：message 供人读，fields 供机器读
 * - 级别过滤在入口完成，避免无谓的字符串拼接
 * - 传输目标可插拔
 */
export class Logger {
  private level: LogLevel;
  private readonly context?: string;
  private readonly formatter: LogFormatter;
  private readonly transports: LogTransport[];
  private readonly baseFields: Record<string, unknown>;
  private readonly contextProvider?: () => Record<string, unknown> | undefined | null;
  private readonly sampling?: { rate: number; sampleBelow: LogLevel };

  constructor(options: LoggerOptions = {}) {
    this.level = parseLevel(options.level, LogLevel.INFO);
    this.context = options.context;
    this.formatter = options.formatter ?? createPrettyFormatter();
    this.transports = options.transports ?? [new ConsoleTransport()];
    this.baseFields = options.baseFields ?? {};
    this.contextProvider = options.contextProvider;
    if (options.sampling) {
      this.sampling = { rate: options.sampling.rate, sampleBelow: options.sampling.sampleBelow ?? LogLevel.INFO };
    }
  }

  /** 派生子日志器：继承配置，附加 context */
  child(context: string, fields?: Record<string, unknown>): Logger {
    return new Logger({
      level: this.level,
      context: this.context ? `${this.context}:${context}` : context,
      formatter: this.formatter,
      transports: this.transports,
      baseFields: { ...this.baseFields, ...(fields ?? {}) },
      contextProvider: this.contextProvider,
      sampling: this.sampling,
    });
  }

  setLevel(level: LogLevel | string): void {
    this.level = parseLevel(level, this.level);
  }

  getLevel(): LogLevel {
    return this.level;
  }

  isLevelEnabled(level: LogLevel): boolean {
    return level >= this.level;
  }

  trace(message: string, fields?: Record<string, unknown>): void {
    this.log(LogLevel.TRACE, message, fields);
  }
  debug(message: string, fields?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, fields);
  }
  info(message: string, fields?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, fields);
  }
  warn(message: string, fields?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, fields);
  }
  error(message: string, fields?: Record<string, unknown>, err?: unknown): void {
    this.log(LogLevel.ERROR, message, fields, err);
  }
  fatal(message: string, fields?: Record<string, unknown>, err?: unknown): void {
    this.log(LogLevel.FATAL, message, fields, err);
  }

  /**
   * 采样判定：只对低于 minLevel 的级别生效。
   *
   * 注意 `rate <= 0` 表示全丢弃、`rate >= 1` 表示全保留，边界要写死。
   */
  private shouldSample(level: LogLevel): boolean {
    if (!this.sampling) return true;
    if (level >= this.sampling.sampleBelow) return true;
    if (this.sampling.rate <= 0) return false;
    if (this.sampling.rate >= 1) return true;
    return Math.random() < this.sampling.rate;
  }

  private log(level: LogLevel, message: string, fields?: Record<string, unknown>, err?: unknown): void {
    if (!this.isLevelEnabled(level)) return;
    if (!this.shouldSample(level)) return;

    let merged: Record<string, unknown> | undefined = fields;
    if (Object.keys(this.baseFields).length > 0) {
      merged = { ...this.baseFields, ...(fields ?? {}) };
    }
    const ctxFields = this.contextProvider?.();
    if (ctxFields) {
      merged = { ...(merged ?? {}), ...ctxFields };
    }
    const record = createRecord(level, message, this.context, merged, err);
    const line = this.formatter(record);
    for (const t of this.transports) {
      try {
        void t.write(line, record);
      } catch (err) {
        // 日志失败绝不能把业务请求打挂：退到 stderr，且只提示一次要点
        this.reportTransportFailure(t, err);
      }
    }
  }

  private reportedFailures = 0;

  private reportTransportFailure(t: LogTransport, err: unknown): void {
    // 磁盘满时每条都报会把 stderr 打爆，做个简单限流
    if (this.reportedFailures < 5) {