/**
 * JWT：签发与校验（HS256，基于 node:crypto，零依赖）。
 *
 * 安全上最容易写错、也最要命的三处：
 *
 * 1. **`alg` 必须从可信来源取，不能从 token 里读**。
 *    经典的 "alg: none" 与 RS256→HS256 混淆攻击，根源都是
 *    "照着 token 头里说的算法去验证"。这里根本不读 header 的 alg，
 *    只按服务端配置的算法验证
 * 2. **过期必须校验，且允许少量时钟偏移**。
 *    不校验 exp，token 就永不失效；不容忍偏移，
 *    调用方与签发方差几秒就会大面积误判
 * 3. **比较签名必须用定时安全比较**（`timingSafeEqual`）。
 *    用 `===` 比字符串会在第一个不同字节就返回，
 *    理论上可被逐字节爆破
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export type JwtAlgorithm = 'HS256';

export interface JwtPayload {
  sub?: string;
  /** 过期时间（秒） */
  exp?: number;
  /** 生效时间（秒） */
  nbf?: number;
  /** 签发时间（秒） */
  iat?: number;
  iss?: string;
  aud?: string;
  roles?: string[];
  [key: string]: unknown;
}

export interface JwtOptions {
  /** 签发方，校验时会比对 */
  issuer?: string;
  /** 受众，校验时会比对 */
  audience?: string;
  /** 允许的时间偏差（秒），默认 30 */
  clockSkewSeconds?: number;
}

export class JwtError extends Error {
  constructor(
    readonly reason:
      | 'malformed'
      | 'bad-signature'
      | 'expired'
      | 'not-yet-valid'
      | 'wrong-issuer'
      | 'wrong-audience',
    message: string,
  ) {
    super(message);
    this.name = 'JwtError';
  }
}

export class Jwt {
  constructor(
    private readonly secret: string,
    private readonly options: JwtOptions = {},
  ) {
    if (secret.length < 16) {
      // 弱密钥比没有密钥更危险：它会给出一种虚假的安全感
      throw new Error('jwt secret must be at least 16 characters');
    }
  }

  sign(payload: JwtPayload, expiresInSeconds: number): string {
    const now = Math.floor(Date.now() / 1000);
    const body: JwtPayload = {
      ...payload,
      iat: now,
      exp: now + expiresInSeconds,
      ...(this.options.issuer ? { iss: this.options.issuer } : {}),
      ...(this.options.audience ? { aud: this.options.audience } : {}),
    };
    return `${encode(header())}.${encode(body)}.${signPart(`${encode(header())}.${encode(body)}`, this.secret)}`;
  }

  verify(token: string): JwtPayload {
    const parts = token.split('.');
    if (parts.length !== 3) throw new JwtError('malformed', 'token must have three parts');

    const [encodedHeader, encodedBody, encodedSignature] = parts as [string, string, string];

    // header 只用来取 alg 并**确认它就是我们期望的那个**；
    // 绝不能"按 header 里说的算法去验签"
    const head = decodeJson<Record<string, unknown>>(encodedHeader);
    if (head?.alg !== 'HS256') {
      throw new JwtError('malformed', `unsupported alg: ${String(head?.alg)}`);
    }

    const expected = Buffer.from(signPart(`${encodedHeader}.${encodedBody}`, this.secret));
    const actual = Buffer.from(encodedSignature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      throw new JwtError('bad-signature', 'signature does not match');
    }

    const payload = decodeJson<JwtPayload>(encodedBody);
    if (!payload) throw new JwtError('malformed', 'payload is not an object');

    const now = Math.floor(Date.now() / 1000);
    const skew = this.options.clockSkewSeconds ?? 30;

    if (payload.exp !== undefined && now - skew > payload.exp) {
      throw new JwtError('expired', 'token has expired');
    }
    if (payload.nbf !== undefined && now + skew < payload.nbf) {
      throw new JwtError('not-yet-valid', 'token is not valid yet');
    }
    if (this.options.issuer && payload.iss !== this.options.issuer) {
      throw new JwtError('wrong-issuer', 'issuer mismatch');
    }
    if (this.options.audience && payload.aud !== this.options.audience) {
      throw new JwtError('wrong-audience', 'audience mismatch');
    }
    return payload;
  }

  /** 不验签地读 payload —— 只用于排查，绝不能用于鉴权 */
  peek(token: string): JwtPayload | undefined {
    return decodeJson<JwtPayload>(token.split('.')[1] ?? '');
  }
}

function header(): Record<string, unknown> {
  return { alg: 'HS256', typ: 'JWT' };
}

function signPart(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}