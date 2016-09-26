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