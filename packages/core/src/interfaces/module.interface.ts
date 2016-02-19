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

/** 动态模块（如 `ConfigModule.forRoot()` 的返回值） */
export interface DynamicModule extends ModuleMetadata {
  /** 动态模块必须显式指定宿主模块 */
  module: Type<unknown>;
  /** 是否全局模块 */
  global?: boolean;
}

/** 值 Provider */
export interface ValueProvider<T = unknown> {
  provide: InjectionToken<T>;
  useValue: T;
}

/** 类 Provider */
export interface ClassProvider<T = unknown> {
  provide: InjectionToken<T>;
  useClass: Type<T>;
  scope?: import('./type.interface').Scope;
}