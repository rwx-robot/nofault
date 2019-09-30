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