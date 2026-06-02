/**
 * 把 JWT 与 RBAC 接进 HTTP 请求链。
 *
 * 中间件的职责**只到"把身份放进请求上下文"**为止：
 * 真正的授权判断交给 `authorize()`（或者说，留给各自的 guard）。
 * 混在一起的结果是"鉴权逻辑散落在中间件里"，没人知道某个接口到底怎么被保护的。
 */
import { Jwt, bearerToken } from './jwt';