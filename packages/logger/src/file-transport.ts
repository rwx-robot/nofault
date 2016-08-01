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
