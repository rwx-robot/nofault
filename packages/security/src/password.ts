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