import { NofaultApplication, createApplication } from '@nofault/core';
import type { DynamicModule, Type } from '@nofault/core';
import { NodeHttpAdapter } from './node-http-adapter';

export interface HttpApplicationOptions {
  name?: string;
  quiet?: boolean;
  shutdownTimeout?: number;
  /** 复用外部传入的适配器（测试常用） */
  httpAdapter?: import('@nofault/core').HttpAdapter;
}

/**
 * 创建一个带 `node:http` 适配器的 nofault 应用。
 *
 * 这是 v0.1.0 的推荐入口，对应 NestJS 里 `NestFactory.create(AppModule)` 的角色。
 *
 * @example
 * ```ts
 * const app = await createHttpApplication(AppModule);