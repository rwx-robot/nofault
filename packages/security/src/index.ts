/**
 * @nofault/security —— 认证与授权（v1.0.0）。
 *
 * 三个部件，各管一件事，且**都能独立使用**：
 *   JWT        无状态地把"你是谁"带到下一次请求
 *   密码哈希   让拖库也不至于直接拿到明文
 *   RBAC       决定"这个人能不能做这件事"
 *
 * 共通的原则：**安全相关的默认值一律选"拒绝"那一侧**。
 * 漏写一个装饰器应当是"调不通"，而不是"谁都能调"。
 */
export { Jwt, JwtError, bearerToken } from './jwt';
export type { JwtAlgorithm, JwtOptions, JwtPayload } from './jwt';

export {
  RefreshTokenService,
  RefreshTokenError,
  InMemoryTokenStore,
  hashToken,
} from './refresh';
export type { TokenStore, RefreshTokenRecord, IssuedPair, RefreshTokenOptions } from './refresh';

export { hashPassword, verifyPassword, safeEqual } from './password';
export { Roles, Public, authorize, isPublic, requiredRoles, ROLES_METADATA } from './password';

export { SecurityModule, authMiddleware, CURRENT_PRINCIPAL } from './security.module';