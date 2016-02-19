import type { InjectionToken, Type } from './type.interface';

/**
 * 模块元数据：由 `@Module()` 装饰器写入。
 */
export interface ModuleMetadata {
  /** 导入的其它模块 */
  imports?: Array<Type<unknown> | DynamicModule | Promise<DynamicModule>>;
  /** 本模块内声明的 Provider */
  providers?: Provider[];
  /** 对外导出的 Provider（或导出整个模块） */
  exports?: Array<InjectionToken | Type<unknown> | DynamicModule>;
  /**
   * HTTP 控制器（v0.2.0 起由 `@nofault/rest` 消费）。
   *
   * 内核只负责"登记"这些类，不解释它们——保持 core 对 Web 层无感知。
   */
  controllers?: Array<Type<unknown>>;
}
