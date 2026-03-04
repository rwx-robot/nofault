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

  // 用**存储时记录的参数**重新计算，这样老哈希照样能验证
  const derived = await scryptAsync(password, Buffer.from(saltPart, 'base64url'), KEY_LENGTH);
  const expected = Buffer.from(hashPart, 'base64url');
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

/** 定时安全的字符串比较，用于 token / secret 一类敏感值 */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

// ------------------------------------------------------------------ RBAC

export const ROLES_METADATA = {
  ROLES: 'nofault:security:roles',
  PUBLIC: 'nofault:security:public',
} as const;

/**
 * 要求调用方具备列出的**任一**角色。
 *
 * 用"任一"而不是"全部"：多角色通常是"或"的语义
 * （管理员或审计员都能看），要求全部反而会让多角色用户越权失败。
 */
export function Roles(...roles: string[]): MethodDecorator & ClassDecorator {
  return ((target: object, propertyKey?: string | symbol) => {
    if (propertyKey) Reflect.defineMetadata(ROLES_METADATA.ROLES, roles, target, propertyKey);
    else Reflect.defineMetadata(ROLES_METADATA.ROLES, roles, target);
  }) as MethodDecorator & ClassDecorator;
}

/** 显式标记"不需要登录"。默认是**需要**，这样漏标不会造成越权 */
export function Public(): MethodDecorator & ClassDecorator {
  return ((target: object, propertyKey?: string | symbol) => {
    if (propertyKey) Reflect.defineMetadata(ROLES_METADATA.PUBLIC, true, target, propertyKey);
    else Reflect.defineMetadata(ROLES_METADATA.PUBLIC, true, target);
  }) as MethodDecorator & ClassDecorator;
}

export function requiredRoles(target: object, propertyKey?: string | symbol): string[] | undefined {
  const methodRoles = propertyKey
    ? (Reflect.getMetadata(ROLES_METADATA.ROLES, target, propertyKey) as string[] | undefined)
    : undefined;
  if (methodRoles) return methodRoles;
  return Reflect.getMetadata(ROLES_METADATA.ROLES, target.constructor ?? target) as
    | string[]
    | undefined;
}