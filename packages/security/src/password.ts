/**
 * 密码哈希（scrypt）与角色访问控制。
 *
 * 密码部分的三条铁律：
 * 1. **绝不明文存密码**，也绝不用通用哈希（MD5/SHA）——
 *    它们快，而"快"正是密码哈希的敌人。必须用**故意慢**的 KDF
 * 2. **每次都要新盐**。盐相同 → 相同密码哈希相同 → 拖库后能直接比对出
 *    "哪些人用了同一个密码"
 * 3. **比较要用定时安全比较**。用 `===` 会在第一个不同字节返回，
 *    理论上是可被利用的信息泄漏
 */
import 'reflect-metadata';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

/** scrypt 的 N 参数（CPU/内存成本）。2048 是安全与延迟的折中 */
const COST = 2048;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/**
 * 哈希结果格式：`scrypt$N$r$p$salt$hash`
 *
 * 把参数写进结果里，是为了**以后能平滑升级成本**：
 * 老哈希仍能验证，新哈希用更强的参数。否则一旦想调高 COST，
 * 所有老用户的密码就都验证不过了（只能强制所有人重置）。
 */
export async function hashPassword(password: string, cost: number = COST): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scryptAsync(password, salt, KEY_LENGTH);
  return `scrypt$${cost}$1$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 5 || parts[0] !== 'scrypt') return false;

  const [, costPart, , saltPart, hashPart] = parts as [string, string, string, string, string];
  const cost = Number(costPart);
  if (!Number.isInteger(cost) || cost <= 0) return false;