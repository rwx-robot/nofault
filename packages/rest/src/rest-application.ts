import type { IncomingMessage, ServerResponse } from 'node:http';
import { createHttpApplication } from '@nofault/http';
import type { NofaultApplication } from '@nofault/core';
import type { DynamicModule, Type } from '@nofault/core';
import { RequestContext, requestContextStore } from '@nofault/context';
import type { RequestContextStore } from '@nofault/context';
import { parseTraceparent } from '@nofault/context';
import { createLogger, type Logger } from '@nofault/logger';
import { RestContext, RestRequest, RestResponse } from './http/context';
import { MethodNotAllowedException, NotFoundException, isHttpException } from './errors/http-exception';
import {
  composeMiddleware,
  resolveHandlerArgs,
  validateDtoIfDeclared,
  normalizeError,
  type Middleware,
} from './pipeline';
import { RouteExplorer, type ResolvedRoute, type MiddlewareRegistry } from './route-explorer';
import type { RouteTable } from './router/route-tree';
import { HealthRegistry, statusToHttpCode } from './health';
import type { HealthReport } from './health';

export interface RestApplicationOptions {
  name?: string;
  quiet?: boolean;
  /** 全局路由前缀 */
  globalPrefix?: string;
  /** 全局中间件 */
  middleware?: Middleware[];
  /** 是否把返回值包装成 `{ code, data, message }`，默认 true */
  wrapResponse?: boolean;
  /** 自定义日志器 */
  logger?: Logger;
  /**
   * 上下文存储。默认开启（全局 `requestContextStore`）。
   * 传 `null` 关闭——但没有上下文时 `Scope.REQUEST` 的 Provider 无法解析。
   */
  contextStore?: RequestContextStore | null;
  /**
   * 健康检查端点。默认开启：`/healthz`（存活）+ `/readyz`（就绪）。
   * 传 `false` 关闭，或传对象自定义路径。
   */
  health?: false | { livenessPath?: string; readinessPath?: string };
  /**
   * 命名中间件表：契约/装饰器里以**字符串**声明的中间件在这里登记实现。
   * 缺省为空，用到未登记的名字会立刻启动失败（而不是悄悄不生效）。
   */
  middlewareRegistry?: MiddlewareRegistry;
}

/**
 * nofault REST 应用。
 *
 * 采用**组合**而非继承 `NofaultApplication`：
 * Web 层只是内核之上的一层能力，组合能让两者的职责边界保持清晰。
 */
export class RestApplication {
  private readonly logger: Logger;
  private readonly options: Required<Pick<RestApplicationOptions, 'wrapResponse'>> & RestApplicationOptions;
  private readonly store: RequestContextStore | null;
  private table!: RouteTable<ResolvedRoute>;
  /** 存在 REQUEST 作用域 Provider 时，控制器必须每请求重新解析 */
  private perRequestControllers = false;
  /** 健康检查注册表 */
  private readonly healthRegistry = new HealthRegistry();

  constructor(
    private readonly app: NofaultApplication,
    options: RestApplicationOptions = {},
  ) {
    this.options = { wrapResponse: true, ...options };
    this.logger = options.logger ?? createLogger({ context: 'rest', level: options.quiet ? 'warn' : 'info' });
    this.store = options.contextStore === undefined ? requestContextStore : options.contextStore;
  }

  static async create(
    root: Type<unknown> | DynamicModule,
    options: RestApplicationOptions = {},
  ): Promise<RestApplication> {
    const app = await createHttpApplication(root, { name: options.name, quiet: options.quiet });
    const rest = new RestApplication(app, options);
    await rest.registerRoutes();
    return rest;
  }

  /** 扫描控制器并挂载请求处理器 */
  async registerRoutes(): Promise<void> {
    this.table = await RouteExplorer.explore(
      this.app,
      this.options.globalPrefix ?? '/',
      this.options.middlewareRegistry ?? {},
    );
    this.perRequestControllers = this.app.hasRequestScopedProviders();
    this.registerHealthRoutes();
    this.app.use((req, res) => this.handle(req, res));
    for (const r of this.table.listRoutes()) {
      this.logger.debug('route registered', { method: r.method, path: r.pattern });
    }
  }

  /** 直接注册一条路由（不走装饰器，给健康检查这类内建端点用） */
  addRoute(method: string, path: string, handler: (ctx: RestContext) => unknown | Promise<unknown>): void {
    this.table.add(method, path, {
      method,
      path,
      controller: Object as never,
      instance: { [method]: handler } as never,
      propertyKey: method,
      middleware: [],
      synthetic: true,
    });
  }

  /** 健康检查注册表：业务可注册自己的依赖检查 */
  get health(): HealthRegistry {
    return this.healthRegistry;
  }

  private registerHealthRoutes(): void {
    const cfg = this.options.health;
    if (cfg === false) return;
    const livenessPath = cfg?.livenessPath ?? '/healthz';
    const readinessPath = cfg?.readinessPath ?? '/readyz';

    const send = (ctx: RestContext, report: HealthReport): void => {
      ctx.response.status(statusToHttpCode(report.status)).json(report);
    };

    this.addRoute('GET', livenessPath, async (ctx) => {
      send(ctx, await this.healthRegistry.checkLiveness());
      return undefined;
    });
    this.addRoute('GET', readinessPath, async (ctx) => {
      send(ctx, await this.healthRegistry.checkReadiness());
      return undefined;
    });
  }

  /**
   * 标记应用就绪。
   *
   * 注册过 readiness 检查后默认是"未就绪"的，依赖预热完成后必须显式调用它，
   * 否则 `/readyz` 会一直 503——这是有意的，避免半初始化的实例接流量。
   */
  markReady(): void {
    this.healthRegistry.markReady();
  }

  /** 优雅退出前摘流量 */
  markNotReady(): void {
    this.healthRegistry.markNotReady();
  }

  /** 已注册路由（调试与文档用） */
  getRoutes(): Array<{ method: string; path: string }> {
    return this.table.listRoutes().map((r) => ({ method: r.method, path: r.pattern }));
  }

  get<T>(token: Type<T> | string | symbol, contextId?: object): Promise<T> {
    return this.app.get<T>(token as never, contextId);
  }
