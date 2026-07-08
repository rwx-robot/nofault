/**
 * refresh token / 吊销 的单元测试。
 *
 * 与 jwt.test.ts 同一立场：**必须覆盖攻击路径**——
 * 旧 refresh token 被重放、token 泄露后吊销、存储被拖走（只有哈希）。
 */
import { describe, expect, it } from 'vitest';
import { Jwt } from '../src/jwt';
import {
  InMemoryTokenStore,
  RefreshTokenService,
  hashToken,
  type RefreshTokenRecord,
  type TokenStore,
} from '../src/refresh';

const SECRET = 'a-very-long-secret-value-1234';

describe('refresh tokens', () => {
  const jwt = new Jwt(SECRET, { issuer: 'nofault', audience: 'api' });

  it('issues a verifiable access token and an opaque refresh token', async () => {
    const service = new RefreshTokenService(jwt, new InMemoryTokenStore());
    const pair = await service.issue({ sub: 'u1', roles: ['admin'] }, 60);

    const payload = jwt.verify(pair.accessToken);
    expect(payload.sub).toBe('u1');
    expect(payload.roles).toEqual(['admin']);
    expect(pair.expiresIn).toBe(60);

    // refresh token 必须不是 JWT：三个点分段的就是把吊销做回了"等过期"
    expect(pair.refreshToken.split('.')).toHaveLength(1);
    // 32 字节 base64url → 43 字符，长度即熵的下限证明
    expect(pair.refreshToken.length).toBeGreaterThanOrEqual(43);
  });

  it('rotates on refresh and rejects the presented token afterwards', async () => {
    const store = new InMemoryTokenStore();
    const service = new RefreshTokenService(jwt, store);
    const first = await service.issue({ sub: 'u1', roles: ['admin'] }, 60);

    const second = await service.refresh(first.refreshToken, 60);
    expect(jwt.verify(second.accessToken).sub).toBe('u1');
    // 轮换不是追加：旧记录作废、新记录入库，存量不变
    expect(store.size).toBe(1);

    // 重放已轮换的旧 token：必须拒绝——这是轮换的全部意义
    await expect(service.refresh(first.refreshToken, 60)).rejects.toMatchObject({
      name: 'RefreshTokenError',