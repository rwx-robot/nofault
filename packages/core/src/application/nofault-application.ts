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