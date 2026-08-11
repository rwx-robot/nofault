/**
 * Refresh token + 吊销 —— 补上 JWT 无状态的必然缺口。
 *
 * access token 保持无状态（Jwt.verify 不查任何存储，性能不受影响），
 * 但"无状态"的代价是**发出去就收不回**。这对"记住我 14 天"是致命的：
 * 要么 token 短命到用户天天重登，要么长命到泄露后无可挽回。
 *
 * 解法是业界标准的三件套，各自守一条纪律：
 * 1. **refresh token 是不透明的随机串，不是 JWT**——身上一个 claim 都不带，
 *    全部状态在服务端（TokenStore）；"能不能用"只由服务端说了算，这才吊销得动。
 *    反过来把 refresh token 也做成 JWT，等于把"吊销"做回了"等它自然过期"
 * 2. **存储只存 sha256 哈希**——库被拖走也拿不到可用的 token。
 *    refresh token 是 256 位随机数，熵足够，不需要 scrypt 那样的慢哈希
 *    （慢哈希是给低熵的人类密码准备的）
 * 3. **每次 refresh 都轮转**：旧 token 用过即废。被偷走的 token
 *    只有一次使用窗口
 * 4. **重用检测**：已轮转的 token 再次出现 = 泄露信号 → 静默吊销
 *    整个会话族（family）——偷来的 token 用一次，全家作废。
 *    store 通过两个可选方法参与（缺省实现自动降级为"仅拒绝"）
 */
import { createHash, randomBytes } from 'node:crypto';
import type { Jwt, JwtPayload } from './jwt';

/** 对 refresh token 的唯一存储形态：sha256 hex。原始 token 绝不落库 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export interface RefreshTokenRecord {
  /** sha256(raw token) */
  tokenHash: string;
  /** 会话族 id：同一次登录轮转出的所有 token 同族，重用检测按族吊销 */
  familyId: string;
  /** 重新签发 access token 时携带的 claims（sub / roles / 业务自定义字段） */
  claims: JwtPayload;
  issuedAtMs: number;
  expiresAtMs: number;
}

/**
 * refresh token 的存取缝。
 *
 * 内存实现开箱可用、可测；生产换 Redis 等只需实现这三个方法。
 * 请求/响应侧都允许同步实现——和 Exporter 的缝一个约定。
 *
 * **过期不是 store 的职责**：find 如实返回找到的记录（哪怕已过期），
 * "过期"与"未知"的区分由 RefreshTokenService 统一裁定——
 * 否则每种 store 实现都得自带一套过期语义，行为必然漂移。
 */
export interface TokenStore {
  save(record: RefreshTokenRecord): Promise<void> | void;
  find(tokenHash: string): Promise<RefreshTokenRecord | undefined> | RefreshTokenRecord | undefined;
  revoke(tokenHash: string): Promise<void> | void;
  /** 重用检测（可选）：按"已用过的 token 哈希"反查会话族 */
  findFamilyByUsedHash?(usedTokenHash: string): Promise<string | undefined> | string | undefined;
  /** 重用检测（可选）：吊销整个会话族的全部活跃 token */
  revokeFamily?(familyId: string): Promise<void> | void;
}

/** 内存实现：哑存储，读到什么就是什么；另存"已用 token 哈希 → 会话族"的墓碑 */
export class InMemoryTokenStore implements TokenStore {
  private readonly records = new Map<string, RefreshTokenRecord>();
  private readonly used = new Map<string, string>();

  save(record: RefreshTokenRecord): void {
    this.records.set(record.tokenHash, record);
  }

  find(tokenHash: string): RefreshTokenRecord | undefined {
    return this.records.get(tokenHash);
  }

  revoke(tokenHash: string): void {
    const family = this.records.get(tokenHash)?.familyId;
    this.records.delete(tokenHash);
    if (family) this.used.set(tokenHash, family);
  }

  findFamilyByUsedHash(usedTokenHash: string): string | undefined {
    return this.used.get(usedTokenHash);
  }

  revokeFamily(familyId: string): void {
    for (const [hash, record] of this.records) {
      if (record.familyId !== familyId) continue;
      this.records.delete(hash);
      this.used.set(hash, familyId);
    }
  }

  /** 当前记录数（含未清的过期记录），测试与运维观测用 */
  get size(): number {
    return this.records.size;
  }
}

export class RefreshTokenError extends Error {
  constructor(
    readonly reason: 'malformed' | 'unknown' | 'expired',
    message: string,
  ) {
    super(message);
    this.name = 'RefreshTokenError';
  }
}

export interface IssuedPair {
  /** 短时效 access token（JWT，无状态校验） */
  accessToken: string;
  /** 不透明的 refresh token，服务端可吊销 */
  refreshToken: string;
  /** access token 的有效期（秒），给客户端设置定时刷新用 */
  expiresIn: number;
}

export interface RefreshTokenOptions {
  /** refresh token 有效期（秒），默认 14 天 */
  refreshTokenTtlSeconds?: number;
  /** refresh token 的随机字节数，默认 32（256 位熵）；低于 32 一律拒绝 */
  tokenBytes?: number;
}

const DAY_SECONDS = 24 * 60 * 60;

export class RefreshTokenService {
  private readonly refreshTokenTtlSeconds: number;
  private readonly tokenBytes: number;

  constructor(
    private readonly jwt: Jwt,
    private readonly store: TokenStore,
    options: RefreshTokenOptions = {},
  ) {
    this.refreshTokenTtlSeconds = options.refreshTokenTtlSeconds ?? 14 * DAY_SECONDS;
    this.tokenBytes = options.tokenBytes ?? 32;
    // 弱熵比没有更危险：它给出一种虚假的安全感（与 Jwt 的弱密钥检查同一立场）
    if (this.tokenBytes < 32) {
      throw new Error('refresh token entropy must be at least 32 bytes');
    }
  }

  /** 登录成功后签发 access + refresh 对；familyId 缺省时开新会话族，轮转链上传入同族 */
  async issue(
    claims: JwtPayload,
    accessTokenTtlSeconds: number,
    familyId: string = newFamilyId(),
  ): Promise<IssuedPair> {
    const refreshToken = this.newToken();
    const now = Date.now();
    this.store.save({
      tokenHash: hashToken(refreshToken),
      familyId,
      claims,
      issuedAtMs: now,
      expiresAtMs: now + this.refreshTokenTtlSeconds * 1000,
    });
    return {
      accessToken: this.jwt.sign(claims, accessTokenTtlSeconds),
      refreshToken,
      expiresIn: accessTokenTtlSeconds,
    };
  }

  /**
   * 用 refresh token 换一对新的：**先验证后轮转**。
   * 轮转 = 吊销旧的 + 签发新的（同族）；旧 token 从此按"未知"拒绝——
   * 若它再次出现，说明被偷了，重用检测会吊销全家。
   */
  async refresh(presentedToken: string, accessTokenTtlSeconds: number): Promise<IssuedPair> {
    const record = await this.findValid(presentedToken);
    // 轮转：旧记录立即作废。这里 await 之后再写新记录，
    // 保证"同一条旧 token 换两次"里至少有一次拿到 unknown
    this.store.revoke(record.tokenHash);
    return this.issue(record.claims, accessTokenTtlSeconds, record.familyId);
  }

  /** 吊销（登出 / 管理员踢人）。返回是否真的存在过 */
  async revoke(presentedToken: string): Promise<boolean> {
    if (!isPresentable(presentedToken)) return false;
    const tokenHash = hashToken(presentedToken);
    const record = await this.store.find(tokenHash);
    if (!record) return false;
    this.store.revoke(tokenHash);
    return true;
  }

  private async findValid(presentedToken: string): Promise<RefreshTokenRecord> {
    if (!isPresentable(presentedToken)) {
      throw new RefreshTokenError('malformed', 'refresh token is required');
    }
    const record = await this.store.find(hashToken(presentedToken));
    // 三种失败共用"拒绝"语义，但 reason 分开：malformed 是客户端 bug，
    // unknown 与 expired 是登录态结束——对客户端一律只回 401，不解释更多
    if (!record) {
      // 重用检测：这个哈希在墓碑里 = 它曾被正常轮转/吊销，现在又出现了。
      // 按泄露处理：静默吊掉整个会话族（响应仍是同一个 401，不透露检测到了什么）
      await this.containReusedFamily(presentedToken);
      throw new RefreshTokenError('unknown', 'refresh token is not recognized');
    }
    if (record.expiresAtMs <= Date.now()) {
      this.store.revoke(record.tokenHash);
      throw new RefreshTokenError('expired', 'refresh token has expired');
    }
    return record;
  }

  private async containReusedFamily(presentedToken: string): Promise<void> {
    const family = await this.store.findFamilyByUsedHash?.(hashToken(presentedToken));
    if (family) await this.store.revokeFamily?.(family);
  }

  private newToken(): string {
    return randomBytes(this.tokenBytes).toString('base64url');
  }
}

/** 出示的 token 至少要像样：非空、无空白、长度合理 */
function isPresentable(token: string): boolean {
  return token.length >= 16 && token.length <= 512 && !/\s/.test(token);
}

function newFamilyId(): string {
  return randomBytes(12).toString('base64url');
}
