import type { DynamicModule } from '../interfaces/module.interface';
import type { InjectionToken, Type } from '../interfaces/type.interface';
import type { HttpAdapter } from './http-adapter.interface';
import type { ApplicationContextOptions } from './nofault-application-context';
import { NofaultApplicationContext } from './nofault-application-context';

export interface NofaultApplicationOptions extends ApplicationContextOptions {
  /** HTTP 适配器；未指定时尝试从 `@nofault/http` 自动加载 */
  httpAdapter?: HttpAdapter;
  /** 优雅退出超时（毫秒），超过后强制关闭 */
  shutdownTimeout?: number;
}

/**
 * nofault 应用：在上下文之上叠加 HTTP 监听与优雅退出能力。
 *
 * @example
 * ```ts
 * const app = await NofaultFactory.create(AppModule);
 * await app.listen(3000);
 * ```
 */
export class NofaultApplication extends NofaultApplicationContext {
  private adapter?: HttpAdapter;
  private listening = false;
  private shutdownHooksEnabled = false;
  private readonly handlers: Array<Parameters<HttpAdapter['useHandler']>[0]> = [];

  constructor(private readonly appOptions: NofaultApplicationOptions = {}) {
    super(appOptions);
    this.adapter = appOptions.httpAdapter;
  }

  /**
   * 获取 HTTP 适配器。
   *
   * 内核刻意不内置任何具体实现：需要 HTTP 能力时从平台包获取工厂，
   * 例如 `@nofault/http` 的 `createHttpApplication()`，或手动传入 `httpAdapter`。
   */
  async getAdapter(): Promise<HttpAdapter> {
    if (!this.adapter) {
      throw new Error(
        'No HTTP adapter configured. Use `createHttpApplication()` from `@nofault/http`, ' +
          'or pass an `httpAdapter` to `NofaultFactory.create()`.',
      );
    }
    return this.adapter;
  }

  /** 注册统一的请求处理入口（可多次调用，顺序组成链式兜底） */
  use(handler: Parameters<HttpAdapter['useHandler']>[0]): this {
    this.handlers.push(handler);
    return this;
  }

  async listen(port: number, hostname = '0.0.0.0'): Promise<{ port: number; hostname: string }> {
    const adapter = await this.getAdapter();
    const handlers = [...this.handlers];
    adapter.useHandler((req, res) => this.runHandlers(handlers, req, res));
    const addr = await adapter.listen(port, hostname);
    this.listening = true;
    this.log('info', `[nofault] ${this.appOptions.name ?? 'app'} listening on http://${addr.hostname}:${addr.port}`);
    return addr;
  }

  /** 启用 SIGTERM/SIGINT 优雅退出 */
  enableShutdownHooks(signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT']): this {
    if (this.shutdownHooksEnabled) return this;
    this.shutdownHooksEnabled = true;
    for (const signal of signals) {
      process.once(signal, () => {
        void this.close(signal);
      });
    }
    return this;
  }

  /**
   * 优雅退出，带超时保护。
   *
   * 编排顺序：停止监听 → 排在途请求 → beforeApplicationShutdown
   *          → onModuleDestroy → onApplicationShutdown
   *
   * 超时存在的意义：某个 Provider 的 destroy 卡死时，
   * 进程也必须能退出——否则 K8s 只能 SIGKILL，那是真丢数据。
   */
  override async close(signal?: string): Promise<void> {
    const timeout = this.appOptions.shutdownTimeout ?? 5000;
    const work = (async () => {
      if (this.listening && this.adapter) {
        await this.adapter.close();
        this.listening = false;
      }
      await super.close(signal);
    })();

    if (timeout <= 0) {
      await work;
      return;
    }

    let timer: NodeJS.Timeout | undefined;
    const guard = new Promise<void>((resolve) => {
      timer = setTimeout(() => {
        process.stderr.write(
          `[nofault] graceful shutdown timed out after ${timeout}ms, forcing exit\n`,
        );