import { RestContext, RestRequest, RestResponse } from './http/context';
import { BadRequestException, HttpException } from './errors/http-exception';
import { ParamSource, getParams, type ParamMetadata } from './metadata';
import { getRouteDto } from './decorators';
import { validateDto, coerceDtoFields, type ValidationError } from './validation';

/**
 * 中间件签名：洋葱模型。
 *
 * ```ts
 * const timing: Middleware = async (ctx, next) => {
 *   const t = Date.now();
 *   await next();
 *   ctx.response.header('x-response-time', String(Date.now() - t));
 * };
 * ```
 */
export type Middleware = (ctx: RestContext, next: () => Promise<void>) => Promise<void> | void;

/** 把中间件数组折叠成单个执行函数（经典的 compose） */
export function composeMiddleware(middleware: Middleware[]): (ctx: RestContext, final: () => Promise<void>) => Promise<void> {
  return async (ctx, final) => {
    let index = -1;
    const dispatch = async (i: number): Promise<void> => {
      if (i <= index) throw new Error('next() called multiple times');
      index = i;
      const fn = i === middleware.length ? final : middleware[i];
      if (!fn) return;
      await fn(ctx, () => dispatch(i + 1));
    };
    await dispatch(0);
  };
}

/** 拦截器：在 handler 前后插入逻辑，可改写结果 */
export interface Interceptor {
  intercept(ctx: RestContext, next: () => Promise<unknown>): Promise<unknown>;
}

// ------------------------------------------------------------------ 参数绑定

function coerce(value: string, type: unknown): unknown {
  if (type === Number) {
    const n = Number(value);
    if (Number.isNaN(n)) throw new BadRequestException(`Cannot convert "${value}" to number`);
    return n;
  }
  if (type === Boolean) return value === 'true' || value === '1';
  return value;
}

function pick(source: ParamSource, ctx: RestContext, key?: string): unknown {
  const req = ctx.request;
  switch (source) {
    case ParamSource.PARAM:
      return key ? req.params[key] : { ...req.params };
    case ParamSource.QUERY:
      return key ? (req.query.get(key) ?? undefined) : Object.fromEntries(req.query.entries());
    case ParamSource.BODY:
      if (!key) return req.body;
      return (req.body as Record<string, unknown> | undefined)?.[key];
    case ParamSource.HEADERS:
      return key ? req.header(key) : req.headers;
    case ParamSource.REQUEST:
      return req;
    case ParamSource.RESPONSE:
      return ctx.response;
    case ParamSource.CONTEXT:
      return ctx;
    case ParamSource.RAW_REQUEST:
      return req.raw;
    case ParamSource.RAW_RESPONSE:
      return ctx.response.raw;
    default:
      return undefined;
  }
}

/**
 * 按方法签名解析实参。
 *
 * 顺序必须与装饰器声明顺序一致（TS 的 `design:paramtypes` 顺序即参数顺序）。
 */
/** 只需要 propertyKey，放宽类型以便复用（ResolvedRoute / RouteMetadata 都能传） */
type RouteLike = { propertyKey: string | symbol };

/**
 * 参数元数据缓存。
 *
 * `Reflect.getMetadata` + `sort()` 是**每请求**都要走的路径，
 * 在热路径上反复做反射查询开销可观（实测占 POST 场景不小比例），
 * 因此按 (target, propertyKey) 记忆化一次。
 */
const paramCache = new WeakMap<object, Map<string | symbol, ParamMetadata[]>>();

function cachedParams(target: object, propertyKey: string | symbol): ParamMetadata[] {
  let byProp = paramCache.get(target);
  if (!byProp) {
    byProp = new Map();
    paramCache.set(target, byProp);
  }
  const hit = byProp.get(propertyKey);
  if (hit) return hit;
  const metas = getParams(target, propertyKey).sort((a, b) => a.index - b.index);
  byProp.set(propertyKey, metas);
  return metas;
}

const dtoCache = new WeakMap<object, Map<string | symbol, (new () => object) | undefined>>();

function cachedDto(target: object, propertyKey: string | symbol): (new () => object) | undefined {
  let byProp = dtoCache.get(target);
  if (!byProp) {
    byProp = new Map();
    dtoCache.set(target, byProp);
  }
  if (byProp.has(propertyKey)) return byProp.get(propertyKey);
  const dto = getRouteDto(target.constructor ?? (target as Function), propertyKey);
  byProp.set(propertyKey, dto);
  return dto;
}

export function resolveHandlerArgs(
  target: object,
  route: RouteLike,
  ctx: RestContext,
): unknown[] {
  const metas = cachedParams(target, route.propertyKey);
  if (metas.length === 0) return [];

  const maxIndex = Math.max(...metas.map((m) => m.index));
  const args: unknown[] = new Array(maxIndex + 1).fill(undefined);

  for (const meta of metas) {
    let value = pick(meta.source, ctx, meta.key);
    if (typeof value === 'string' && meta.type) value = coerce(value, meta.type);
    // 整个对象绑到 DTO 上时按属性声明类型做一次强制（query string 里全是字符串）
    if (isDtoClass(meta.type) && meta.key === undefined && value !== null && typeof value === 'object') {
      value = coerceDtoFields(meta.type as new () => object, value);
    }
    if (value === undefined) value = meta.defaultValue;
    if (value === undefined && meta.required) {
      throw new BadRequestException(`Missing required parameter: ${meta.source}${meta.key ? ` "${meta.key}"` : ''}`);
    }
    args[meta.index] = value;
  }
  return args;
}

/**
 * DTO 校验：失败抛 422。
 *
 * 取值要看 DTO **绑在哪儿**：绑 body 就校验 body，绑 query 就校验 query。
 * 只认 body 的话 `@Query() dto` 会完全绕过校验，
 * 而查询参数恰恰是最容易被外部乱填、最需要校验的一处。
 */
export function validateDtoIfDeclared(target: object, route: RouteLike, ctx: RestContext): void {
  const dto = cachedDto(target, route.propertyKey);
  if (!dto) return;

  const bound = cachedParams(target, route.propertyKey).find(
    (m) => m.source === ParamSource.BODY || m.source === ParamSource.QUERY,
  );
  // 没有任何"整体绑定"的 DTO（例如只用了若干个 @Param），
  // 就没有可校验的对象 —— 跳过，不要拿空的 body 去撞必填规则
  if (!bound) return;
  const fromQuery = bound.source === ParamSource.QUERY;
  const raw = fromQuery ? Object.fromEntries(ctx.request.query.entries()) : ctx.request.body;

  const errors: ValidationError[] = validateDto(dto, coerceDtoFields(dto, raw));
  if (errors.length > 0) {
    throw new HttpException(422, 'Validation failed', 422, errors);
  }
}

/**
 * 保留旧名字：签名从 `(target, route, body)` 变成了 `(target, route, ctx)`，
 * 但已有代码不至于因为更名被打挂。
 */
export const validateBodyIfDeclared = (target: object, route: RouteLike, ctx: RestContext): void =>
  validateDtoIfDeclared(target, route, ctx);

/** 是 DTO 类（而不是 Number/String 这类内建构造函数） */
function isDtoClass(type: unknown): boolean {
  return (
    typeof type === 'function' &&
    type !== Number &&
    type !== String &&
    type !== Boolean &&
    type !== Date &&
    type !== Array &&
    type !== Object
  );
}

/** 把任意抛出的异常归一化成 HttpException */