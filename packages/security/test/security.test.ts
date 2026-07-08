/**
 * @nofault/security 单元测试。
 *
 * 安全代码的测试必须覆盖**攻击路径**，而不只是正常路径：
 * 篡改签名、把 alg 改成 none、过期 token、跨签发方复用 token。
 * 这类 bug 在正常流程里永远测不出来，只会在被攻击时暴露。
 */
import { describe, expect, it } from 'vitest';
import 'reflect-metadata';
import { createHmac } from 'node:crypto';
import { Jwt, bearerToken } from '../src/jwt';
import { Public, Roles, authorize, hashPassword, safeEqual, verifyPassword } from '../src/password';
import { authMiddleware, type HttpContextLike } from '../src/security.module';

const SECRET = 'a-very-long-secret-value-1234';

describe('jwt', () => {
  const jwt = new Jwt(SECRET, { issuer: 'nofault', audience: 'api' });

  it('round trips a payload', () => {
    const token = jwt.sign({ sub: 'u1', roles: ['admin'] }, 3600);
    const payload = jwt.verify(token);
    expect(payload.sub).toBe('u1');
    expect(payload.roles).toEqual(['admin']);
    expect(payload.iss).toBe('nofault');
    expect(payload.aud).toBe('api');
  });

  it('rejects a forged signature', () => {
    const token = jwt.sign({ sub: 'u1' }, 3600);
    const parts = token.split('.');
    // 只改最后一个字符：签名对不上就必须拒绝
    const forged = `${parts[0]}.${parts[1]}.${parts[2]!.slice(0, -1)}X`;
    expect(() => jwt.verify(forged)).toThrow(/signature/i);
  });

  it('refuses an alg-none token', () => {
    // 经典攻击：把 alg 改成 none 并去掉签名，指望服务端"不验签"
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify({ sub: 'attacker', roles: ['admin'] })).toString('base64url');
    expect(() => jwt.verify(`${header}.${body}.`)).toThrow(/unsupported alg/);
  });

  it('rejects an expired token', () => {
    // 必须过期得比默认 30 秒偏移更久 —— 落在偏移内的过期是**故意放行**的
    const token = jwt.sign({ sub: 'u1' }, -120);
    expect(() => jwt.verify(token)).toThrow(/expired/);
  });

  it('tolerates a small clock skew', () => {
    // 签发方与校验方差几秒是常态；不容忍偏移就会大面积误判
    const skewed = Math.floor(Date.now() / 1000) - 10;
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(
      JSON.stringify({ sub: 'u1', iat: skewed, exp: skewed, iss: 'nofault', aud: 'api' }),
    ).toString('base64url');
    const sig = createHmac('sha256', SECRET).update(`${header}.${body}`).digest('base64url');
    // exp 在 10 秒前 —— 落在默认 30 秒偏移内，应当通过
    expect(jwt.verify(`${header}.${body}.${sig}`).sub).toBe('u1');
  });

  it('rejects a token issued by someone else', () => {
    const other = new Jwt('another-very-long-secret-value', { issuer: 'someone-else' });
    const token = other.sign({ sub: 'u1' }, 3600);
    // 密钥不同 -> 签名不过（在校验 issuer 之前就被拦下）
    expect(() => jwt.verify(token)).toThrow(/signature/i);
  });

  it('rejects wrong audience with the same secret', () => {
    const jwt2 = new Jwt(SECRET, { audience: 'api' });
    const foreign = new Jwt(SECRET, { audience: 'other' });
    expect(() => jwt2.verify(foreign.sign({ sub: 'u1' }, 3600))).toThrow(/audience/);
  });

  it('rejects a short secret', () => {
    // 弱密钥比没有密钥更危险：它会给出一种虚假的安全感
    expect(() => new Jwt('short')).toThrow(/at least 16/);
  });

  it('parses a bearer header', () => {
    expect(bearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');