import type { InjectionToken, Type } from './type.interface';

/**
 * 模块元数据：由 `@Module()` 装饰器写入。
 */
export interface ModuleMetadata {
  /** 导入的其它模块 */
  imports?: Array<Type<unknown> | DynamicModule | Promise<DynamicModule>>;
  /** 本模块内声明的 Provider */
  providers?: Provider[];