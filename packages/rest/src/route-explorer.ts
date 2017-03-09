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
  ): Promise<RouteTable<ResolvedRoute>> {
    const table = new RouteTable<ResolvedRoute>();
    const resolved = new Map<Type<unknown>, Record<string | symbol, unknown> | null>();

    for (const moduleRef of app.getModuleRefs()) {
      for (const controller of moduleRef.controllers) {
        if (resolved.has(controller)) continue;
        resolved.set(controller, await RouteExplorer.tryResolve(app, moduleRef.token, controller));
      }
    }

    for (const [controller, instance] of resolved) {
      const prefix = joinPath(globalPrefix, getControllerPath(controller));
      const controllerMiddleware =
        (Reflect.getMetadata(REST_METADATA.CONTROLLER_MIDDLEWARE, controller) as Array<unknown> | undefined) ?? [];

      for (const route of getRoutes(controller)) {
        const fullPath = joinPath(prefix, route.path);
        const methods = route.method === 'ALL' ? HTTP_METHODS : [route.method];
        const middleware = [...controllerMiddleware, ...route.middleware].map((m) =>
          RouteExplorer.toMiddleware(m, middlewareRegistry),
        );

        for (const method of methods) {
          table.add(method, fullPath, {
            method,
            path: fullPath,
            controller,
            instance,
            propertyKey: route.propertyKey,
            middleware,
            statusCode: route.statusCode,
          });
        }
      }
    }

    return table;
  }

  /**
   * 尝试在启动期解析控制器实例。
   *
   * 依赖 REQUEST 作用域 Provider 的控制器此时**必然**失败（没有 contextId），
   * 这是预期行为而不是错误——返回 null，交给每请求解析。
   */
  private static async tryResolve(
    app: NofaultApplicationContext,
    moduleToken: Type<unknown>,
    controller: Type<unknown>,
  ): Promise<Record<string | symbol, unknown> | null> {
    try {
      return (await app.select(moduleToken).get(controller)) as Record<string | symbol, unknown>;
    } catch (err) {
      if (err instanceof MissingContextIdError) return null;
      throw err;
    }
  }

  /** 中间件可以是函数、带 `use()` 的类实例，或者**注册表里的名字** */
  private static toMiddleware(m: unknown, registry: MiddlewareRegistry): Middleware {
    if (typeof m === 'string') {
      const found = registry[m];
      if (typeof found !== 'function') {
        throw new Error(
          `middleware "${m}" is not registered; pass it in RestApplication options as ` +
            `{ middlewareRegistry: { ${m}: yourMiddleware } }`,
        );
      }
      return found;
    }
    if (typeof m === 'function' && !isClass(m)) return m as Middleware;
    const instance = m as { use?: (...args: never[]) => unknown };
    if (typeof instance?.use === 'function') {
      return (ctx, next) => Promise.resolve(instance.use!(ctx as never, next as never)) as Promise<void>;
    }