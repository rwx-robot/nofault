import type { DynamicModule } from './interfaces/module.interface';
import type { Type } from './interfaces/type.interface';
import { createApplication } from './application/nofault-application';
import type { NofaultApplicationOptions } from './application/nofault-application';
import type { NofaultApplication } from './application/nofault-application';
import { NofaultApplicationContext } from './application/nofault-application-context';
import type { ApplicationContextOptions } from './application/nofault-application-context';

/**
 * 应用工厂入口。
 *
 * @example
 * ```ts
 * const app = await NofaultFactory.create(AppModule);
 * await app.listen(3000);
 * ```
 */
export class NofaultFactory {
  /** 创建完整应用（含 HTTP 能力） */
  static create(root: Type<unknown> | DynamicModule, options: NofaultApplicationOptions = {}): Promise<NofaultApplication> {
    return createApplication(root, options);
  }

  /** 创建纯应用上下文（无 HTTP，适合定时任务、消费者、脚本） */
  static createApplicationContext(
    root: Type<unknown> | DynamicModule,
    options: ApplicationContextOptions = {},
  ): Promise<NofaultApplicationContext> {
    const ctx = new NofaultApplicationContext(options);