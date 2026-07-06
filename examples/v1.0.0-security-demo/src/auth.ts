/**
 * v1.0.0 示例：一个带认证的最小服务。
 *
 * 演示四件事，全部走真实 HTTP：
 * 1. **登录** —— scrypt 校验密码哈希，签发 JWT
 * 2. **鉴权** —— `@Public()` / 默认需登录 / `@Roles('admin')`
 * 3. **错误语义** —— 401 不透露原因、403 说明缺什么角色
 * 4. **traceId 自动进日志** —— `withTraceFields()` 包装后业务零改动
 */
import 'reflect-metadata';
import { Injectable, Module } from '@nofault/core';
import { Body, Controller, Get, HttpException, Post } from '@nofault/rest';
import { Jwt, Public, Roles, hashPassword, verifyPassword } from '@nofault/security';
import { withTraceFields } from '@nofault/telemetry';
import { createLogger } from '@nofault/logger';

/** 弱密钥会在构造时直接拒绝——这里用环境变量，缺省值仅用于演示 */
export const JWT_SECRET = process.env.JWT_SECRET ?? 'demo-secret-please-override-in-prod';
export const jwt = new Jwt(JWT_SECRET, { issuer: 'security-demo', audience: 'api' });

/** 业务日志器：包装一次，之后所有调用自动带 traceId / spanId */
const log = withTraceFields(createLogger({ level: 'info', context: 'users' }));

interface Account {
  id: string;
  name: string;
  roles: string[];
  /** 存的是哈希，绝不是明文 */
  passwordHash: string;
}

const accounts = new Map<string, Account>();

@Injectable()
export class AuthService {
  constructor() {
    // 演示用：预置两个账号。生产环境密码来自注册接口 + hashPassword()
    void this.register('alice', 'correct-horse-battery', ['admin']);