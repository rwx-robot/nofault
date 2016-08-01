import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readdirSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { appendFile } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import type { LogTransport } from './logger';
import type { LogRecord } from './log-record';

export interface FileTransportOptions {
  /** 日志文件路径 */
  filePath: string;
  /** 单文件上限（字节），超过则轮转；0 表示不按大小轮转 */
  maxSize?: number;
  /** 按天轮转（文件名自动带日期后缀） */
  daily?: boolean;
  /** 保留的历史文件数，默认 5 */
  maxFiles?: number;
  /** 缓冲多少条再落盘，默认 1（每条即排入写队列） */
  flushEvery?: number;
}

/**
 * 文件传输：追加写 + 按大小/按天轮转 + 保留 N 份历史。
 *
 * 落盘走**异步串行队列**（`appendFile` 一条链上排队）：
 * - 顺序性靠"同一时刻只有一个在途写"保证，绝不交错；
 * - 热路径不再阻塞事件循环——高日志量下 sync 写是明显的停顿源；
 * - `flushSync()` 保留为兜底：进程退出前、以及测试需要"立刻在磁盘上"时用；
 * - 轮转仍用同步 rename（低频，且必须先于下一次写完成）。
 *
 * 写失败不在 fire-and-forget 路径里上抛（日志是尽力而为的旁路，
 * 不能因为磁盘满把业务线程炸掉）；`await flush()` 会如实拒绝，供关停路径感知。
 */
export class FileTransport implements LogTransport {
  private readonly options: Required<Pick<FileTransportOptions, 'maxFiles'>> & FileTransportOptions;
  private buffer: string[] = [];
  private currentPath: string;
  private currentDay: string;
  private queue: Promise<void> = Promise.resolve();

  constructor(options: FileTransportOptions) {
    this.options = { maxFiles: 5, ...options };
    this.currentDay = today();