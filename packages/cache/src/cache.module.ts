/**
 * 缓存的 DI 装配与两个常用工具。
 *
 * `CacheModule.forRoot()` 是**全局**模块：缓存通常是基础设施，
 * 每个业务模块都 import 一遍纯属噪音。
 */
import { Inject, type DynamicModule, type Provider } from '@nofault/core';
import type { Cache } from './cache';
import { MemoryCache, type MemoryCacheOptions } from './memory-cache';

export const CACHE = Symbol('NOFAULT_CACHE');

export function InjectCache(): ParameterDecorator {
  return Inject(CACHE as never);
}

export interface CacheModuleOptions {
  /** 直接给一个实现（比如接 Redis 的适配器） */
  cache?: Cache;
  /** 或者给参数，由框架造一个 MemoryCache */
  memory?: MemoryCacheOptions;
}

export class CacheModule {
  static forRoot(options: CacheModuleOptions = {}): DynamicModule {
    const providers: Provider[] = [
      {
        provide: CACHE,
        useFactory: () => options.cache ?? new MemoryCache(options.memory ?? {}),
      },
    ];
    return { module: CacheModule, providers, exports: [CACHE], global: true };
  }
}

/** 拼缓存键：把非字符串参数序列化，保证不同参数不会撞键 */
export function cacheKey(parts: Array<string | number | boolean | object>): string {