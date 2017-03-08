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
  instance: Record<string | symbol, unknown> | null;
  propertyKey: string | symbol;
  /** 该路由上的中间件（控制器级 + 方法级） */
  middleware: Middleware[];
  statusCode?: number;
  /** 合成路由（如内建健康端点）：实例是现成的，不要再去容器解析 */
  synthetic?: boolean;
}

/**
 * 路由探测器：把 `@Controller()` / `@Get()` 等装饰器声明翻译成路由表。
 *
 * 流程：遍历所有模块 → 取 `controllers` → 读装饰器元数据 → 解析实例 → 注册进 RouteTable。
 */
export class RouteExplorer {
  /**
   * @param middlewareRegistry 命名中间件表。
   *   契约里写的中间件（如 `@Middleware('RequestLogger')`）落到代码里是**字符串**，
   *   没有这张表就无法从名字找回实现——要么支持名字，要么生成器就不能按名字引用。
   *   我们选择前者，并在找不到时立刻报错，而不是静默忽略。
   */
  static async explore(
    app: NofaultApplicationContext,
    globalPrefix = '/',
    middlewareRegistry: MiddlewareRegistry = {},