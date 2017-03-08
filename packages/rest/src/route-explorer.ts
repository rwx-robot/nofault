import { REST_METADATA, getControllerPath, getRoutes } from './metadata';
import { joinPath } from './metadata';
import { RouteTable } from './router/route-tree';
import type { Middleware } from './pipeline';
import { MissingContextIdError } from '@nofault/core';
import type { Type } from '@nofault/core';
import type { NofaultApplicationContext } from '@nofault/core';

export type MiddlewareRegistry = Record<string, Middleware>;

export interface ResolvedRoute {
  method: string;
  path: string;
  /** 控制器类 */
  controller: Type<unknown>;
  /**
   * 控制器实例（依赖已注入）。
   *
   * 若控制器依赖了 REQUEST 作用域的 Provider，启动期解析会失败，
   * 此时为 `null`，改由**每请求**在上下文内解析。
   */