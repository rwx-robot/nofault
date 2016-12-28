/**
 * `nofaultctl dev` —— 改文件就自动重启。
 *
 * 三个容易做糙的地方：
 * 1. **防抖** —— 编辑器保存常常一次写多个文件、或者一次写触发多次事件。
 *    不防抖就会重启三四次，每次都是完整启动开销
 * 2. **重启前必须真的杀掉上一个进程** —— 否则新旧进程抢同一个端口，
 *    表现为"改了代码却没生效"，非常难查
 * 3. **重启中到来的变更不能丢** —— 记下来，这一轮结束后立刻再重启一次
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { watch } from 'node:fs';
import { resolve } from 'node:path';

export interface DevOptions {
  /** 要执行的命令，例如 `node dist/main.js` */
  command: string;
  args?: string[];
  /** 监听哪些目录（相对 cwd），默认 `src` */
  watchDirs?: string[];
  /** 防抖窗口，默认 150ms */
  debounceMs?: number;
  /** 重启前留给旧进程的退出时间，默认 2000ms */
  killTimeoutMs?: number;
  cwd?: string;
  onLog?: (line: string) => void;
}

export interface DevHandle {
  stop: () => Promise<void>;
}

export class DevRunner {
  private child?: ChildProcess;
  private timer?: NodeJS.Timeout;
  private pendingRestart = false;
  private restarting = false;
  private stopped = false;
  private readonly watchers: Array<{ close: () => void }> = [];

  constructor(private readonly options: DevOptions) {}

  async start(): Promise<DevHandle> {
    const dirs = this.options.watchDirs ?? ['src'];
    const cwd = this.options.cwd ?? process.cwd();

    for (const dir of dirs) {
      const watcher = watch(resolve(cwd, dir), { recursive: true }, () => {
        if (this.stopped) return;
        this.scheduleRestart();
      });
      this.watchers.push(watcher);
    }

    await this.spawnChild();
    return { stop: () => this.stop() };
  }

  private scheduleRestart(): void {
    if (this.restarting) {
      // 重启期间又变了：记一笔，结束后立刻再重启（不能丢掉这次变更）
      this.pendingRestart = true;
      return;
    }
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.restart();
    }, this.options.debounceMs ?? 150);
  }

  private async restart(): Promise<void> {
    this.restarting = true;
    this.log('change detected, restarting');
    await this.killChild();
    await this.spawnChild();
    this.restarting = false;

    if (this.pendingRestart) {
      this.pendingRestart = false;
      await this.restart();
    }
  }

  /** 杀掉旧进程并**等它真的退出** —— 不等的话新进程会抢端口失败 */
  private async killChild(): Promise<void> {
    const child = this.child;
    if (!child || child.exitCode !== null || child.signalCode !== null) return;

    const timeout = this.options.killTimeoutMs ?? 2000;
    const exited = new Promise<void>((done) => {
      child.once('exit', () => done());
    });

    child.kill('SIGTERM');
    const forced = new Promise<void>((done) => setTimeout(done, timeout));
    await Promise.race([exited, forced]);
    // 到点还没退出就强杀：留着它只会让新进程起不来
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    this.child = undefined;
  }

  private async spawnChild(): Promise<void> {
    const [cmd, ...rest] = this.options.command.split(/\s+/);
    const child = spawn(cmd!, [...rest, ...(this.options.args ?? [])], {
      cwd: this.options.cwd ?? process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });
    this.child = child;

    child.stdout?.on('data', (chunk: Buffer) => this.log(chunk.toString()));
    child.stderr?.on('data', (chunk: Buffer) => this.log(chunk.toString()));
    child.on('exit', (code) => {
      // 自己退出（比如崩溃）时不要自动重启成无限循环——
      // 那会在坏代码上反复启动，刷屏且看不出原因
      if (!this.stopped && code !== 0 && !this.restarting) {
        this.log(`process exited with code ${code}; waiting for a file change`);
      }
    });
  }

  private log(line: string): void {
    for (const part of line.split('\n')) {
      if (part.trim().length > 0) this.options.onLog?.(part);
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    for (const w of this.watchers) w.close();
    this.watchers.length = 0;
    await this.killChild();
  }
}
