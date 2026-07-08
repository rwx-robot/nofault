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
      reason: 'unknown',
    });
    // 重用检测（F1.10）：旧 token 再次出现即泄露信号，同族的新 token 一并吊销
    await expect(service.refresh(second.refreshToken, 60)).rejects.toMatchObject({
      reason: 'unknown',
    });
    expect(store.size).toBe(0);
  });

  it('expires stale refresh tokens', async () => {
    // ttl 0 = 立即过期，免真实等待
    const service = new RefreshTokenService(jwt, new InMemoryTokenStore(), {
      refreshTokenTtlSeconds: 0,
    });
    const pair = await service.issue({ sub: 'u1' }, 60);
    await expect(service.refresh(pair.refreshToken, 60)).rejects.toMatchObject({
      name: 'RefreshTokenError',
      reason: 'expired',
    });
  });

  it('revokes tokens so a stolen one becomes useless', async () => {
    const service = new RefreshTokenService(jwt, new InMemoryTokenStore());
    const pair = await service.issue({ sub: 'u1' }, 60);

    expect(await service.revoke(pair.refreshToken)).toBe(true);
    await expect(service.refresh(pair.refreshToken, 60)).rejects.toMatchObject({ reason: 'unknown' });
    // 吊销是幂等的：再次吊销如实返回 false
    expect(await service.revoke(pair.refreshToken)).toBe(false);
  });

  it('stores only the hash of the token', async () => {
    const store = new InMemoryTokenStore();
    const service = new RefreshTokenService(jwt, store);
    const pair = await service.issue({ sub: 'u1' }, 60);

    // 原始 token 不是 key——存储被拖走也还原不出可用 token
    expect(store.find(pair.refreshToken)).toBeUndefined();
    const record: RefreshTokenRecord | undefined = store.find(hashToken(pair.refreshToken));
    expect(record).toBeDefined();
    expect(record!.claims.sub).toBe('u1');
    expect(JSON.stringify(record)).not.toContain(pair.refreshToken);
  });

  it('rejects malformed presented tokens without touching the store', async () => {
    const service = new RefreshTokenService(jwt, new InMemoryTokenStore());
    await expect(service.refresh('', 60)).rejects.toMatchObject({ reason: 'malformed' });
    await expect(service.refresh('short', 60)).rejects.toMatchObject({ reason: 'malformed' });
    await expect(service.refresh(`${'a'.repeat(20)} ${'b'.repeat(20)}`, 60)).rejects.toMatchObject({