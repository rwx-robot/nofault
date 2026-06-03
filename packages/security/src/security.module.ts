/**
 * 把 JWT 与 RBAC 接进 HTTP 请求链。
 *
 * 中间件的职责**只到"把身份放进请求上下文"**为止：
 * 真正的授权判断交给 `authorize()`（或者说，留给各自的 guard）。
 * 混在一起的结果是"鉴权逻辑散落在中间件里"，没人知道某个接口到底怎么被保护的。
 */
import { Jwt, bearerToken } from './jwt';
import { authorize, isPublic } from './password';

export const CURRENT_PRINCIPAL = 'nofault:security:principal';

export interface Principal {
  readonly sub: string;
  readonly roles: string[];
  readonly claims: Record<string, unknown>;
}

export interface AuthMiddlewareOptions {
  jwt: Jwt;
  /** 未携带有效 token 时是否放行（交给后续 authorize 决定）。默认 false = 直接 401 */
  optional?: boolean;
  /** 从哪里取当前 handler 的 target/propertyKey；由框架注入 */
  handlerOf?: () => { target: object; propertyKey: string | symbol } | undefined;
  /** 把身份放到哪里。默认写进请求上下文 */
  setPrincipal?: (principal: Principal | undefined) => void;
}

export interface HttpContextLike {
  request: { header(name: string): string | undefined; path?: string };
  response: {
    status(code: number): { json(body: unknown): unknown };
    header(name: string, value: string): unknown;
  };
}

export function authMiddleware(options: AuthMiddlewareOptions) {
  return async (ctx: HttpContextLike, next: () => Promise<void>): Promise<void> => {
    const token = bearerToken(ctx.request.header('authorization'));

    let principal: Principal | undefined;
    if (token) {
      try {
        const payload = options.jwt.verify(token);
        principal = {
          sub: payload.sub ?? '',
          roles: payload.roles ?? [],
          claims: payload as Record<string, unknown>,
        };
      } catch {
        // token 无效：不细分原因，一律 401。
        // 告诉调用方"签名不对"还是"过期了"都是在给攻击者递信息
        ctx.response.status(401).json({ code: 401, data: null, message: 'Unauthorized' });
        return;
      }
    }

    // 必须先问 handler 是不是 @Public，再决定"没 token 要不要 401"。
    // 顺序反了的话公开接口（/health、/login）会被一起拦掉 ——
    // 健康检查挂了会触发误摘除，这是生产事故级别的
    const handler = options.handlerOf?.();

    if (!principal) {
      const publicRoute = handler ? isPublic(handler.target, handler.propertyKey) : false;
      if (publicRoute || options.optional === true) {
        options.setPrincipal?.(undefined);
        return next();
      }
      ctx.response.status(401).json({ code: 401, data: null, message: 'Unauthorized' });
      return;
    }

    // 有没有 @Roles 由 handler 自己决定：中间件只提供身份，授权交给 authorize()
    if (handler) {
      const verdict = authorize(handler.target, handler.propertyKey, principal);
      if (!verdict.allowed) {
        ctx.response.status(403).json({ code: 403, data: null, message: verdict.reason ?? 'Forbidden' });
        return;
      }
    }

    options.setPrincipal?.(principal);