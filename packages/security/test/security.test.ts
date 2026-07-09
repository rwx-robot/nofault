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
    expect(bearerToken('bearer abc')).toBe('abc');
    expect(bearerToken('Basic abc')).toBeUndefined();
    expect(bearerToken(undefined)).toBeUndefined();
  });
});

describe('password hashing', () => {
  it('verifies the right password and rejects the wrong one', async () => {
    const stored = await hashPassword('s3cret-pass');
    expect(await verifyPassword('s3cret-pass', stored)).toBe(true);
    expect(await verifyPassword('wrong', stored)).toBe(false);
  });

  it('never stores the password in clear text', async () => {
    const stored = await hashPassword('s3cret-pass');
    expect(stored).not.toContain('s3cret-pass');
    expect(stored.startsWith('scrypt$')).toBe(true);
  });

  it('uses a fresh salt every time', async () => {
    // 盐相同 → 相同密码哈希相同 → 拖库后能直接看出谁用了同一个密码
    const a = await hashPassword('same');
    const b = await hashPassword('same');
    expect(a).not.toBe(b);
    expect(await verifyPassword('same', a)).toBe(true);
    expect(await verifyPassword('same', b)).toBe(true);
  });

  it('rejects a malformed stored value instead of throwing', async () => {
    expect(await verifyPassword('x', 'not-a-hash')).toBe(false);
    expect(await verifyPassword('x', 'scrypt$bad$1$c2FsdA$aGFzaA')).toBe(false);
  });

  it('compares secrets in constant time', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('role based access control', () => {
  class Admin {
    @Public()
    health(): string {
      return 'ok';
    }

    secret(): string {
      return 'secret';
    }

    @Roles('admin')
    wipe(): string {
      return 'wiped';
    }

    @Roles('admin', 'auditor')
    audit(): string {
      return 'audit';
    }
  }

  const target = new Admin();

  it('allows a public route without any principal', () => {
    expect(authorize(target, 'health', undefined).allowed).toBe(true);
  });

  it('denies a protected route when nobody is logged in', () => {
    // 默认拒绝：漏标装饰器应该是"调不通"，而不是"谁都能调"
    expect(authorize(target, 'secret', undefined).allowed).toBe(false);
  });

  it('allows any logged in user when no roles are required', () => {
    expect(authorize(target, 'secret', { roles: [] }).allowed).toBe(true);
  });

  it('requires one of the listed roles, not all of them', () => {
    // 多角色通常是"或"的语义；要求全部会让多角色用户越权失败
    expect(authorize(target, 'audit', { roles: ['auditor'] }).allowed).toBe(true);
    expect(authorize(target, 'audit', { roles: ['admin'] }).allowed).toBe(true);