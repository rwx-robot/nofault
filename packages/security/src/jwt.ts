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