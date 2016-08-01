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
    this.currentPath = this.resolvePath();
    this.ensureFile();
  }

  private resolvePath(): string {
    const { filePath, daily } = this.options;
    if (!daily) return filePath;
    const ext = extname(filePath);
    const base = basename(filePath, ext);
    return join(dirname(filePath), `${base}.${this.currentDay}${ext || '.log'}`);
  }

  private ensureFile(): void {
    const dir = dirname(this.currentPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    if (!existsSync(this.currentPath)) {
      closeSync(openSync(this.currentPath, 'a'));
    }
  }

  write(line: string, _record: LogRecord): void {
    // 跨天：旧一天的尾巴先排进队列（此刻仍指向旧路径），再切新文件
    if (this.options.daily && today() !== this.currentDay) {
      void this.flush().catch(() => undefined);
      this.currentDay = today();
      this.currentPath = this.resolvePath();
      this.ensureFile();
      this.rotateIfNeeded();
    }

    this.buffer.push(line);
    if (this.buffer.length >= (this.options.flushEvery ?? 1)) {
      void this.flush().catch(() => undefined);
    }
  }

  /** 把当前缓冲排进异步写队列；await 返回值即"这一批已落盘"（失败会拒绝） */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) return this.queue;
    const chunk = this.buffer.join('\n') + '\n';
    this.buffer = [];
    this.rotateIfNeeded();
    const target = this.currentPath;
    this.queue = this.queue.then(() => appendFile(target, chunk, 'utf8'));
    return this.queue;
  }

  /** 同步兜底：进程退出前保证缓冲内容落盘（不走队列，直接写） */
  flushSync(): void {
    if (this.buffer.length === 0) return;
    const chunk = this.buffer.join('\n') + '\n';
    this.buffer = [];
    this.rotateIfNeeded();
    appendFileSync(this.currentPath, chunk, 'utf8');
  }

  private rotateIfNeeded(): void {
    const maxSize = this.options.maxSize ?? 0;
    if (maxSize <= 0) return;
    if (!existsSync(this.currentPath)) return;
    if (statSync(this.currentPath).size < maxSize) return;

    // name.log → name.1.log → name.2.log ...
    for (let i = this.options.maxFiles - 1; i >= 1; i--) {
      const from = i === 1 ? this.currentPath : this.rotatedPath(i - 1);
      const to = this.rotatedPath(i);
      if (existsSync(from)) renameSync(from, to);
    }
    // 超过保留数量的直接删（循环里最老那份已被顶掉）
    const oldest = this.rotatedPath(this.options.maxFiles);
    if (existsSync(oldest) && this.rotatedPath(this.options.maxFiles) !== this.currentPath) {
      // 由下一次轮转覆盖，这里不动
    }
    this.ensureFile();
  }

  private rotatedPath(index: number): string {
    return `${this.currentPath}.${index}`;
  }

  /** 清理所有历史文件（测试用） */
  cleanup(): void {
    const dir = dirname(this.currentPath);
    if (!existsSync(dir)) return;
    const prefix = basename(this.currentPath);
    for (const entry of readdirSync(dir)) {
      if (entry.startsWith(prefix)) unlinkSync(join(dir, entry));
    }
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
