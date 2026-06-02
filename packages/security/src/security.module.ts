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