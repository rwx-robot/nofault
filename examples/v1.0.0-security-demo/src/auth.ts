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
    void this.register('bob', 'another-passphrase-here', ['viewer']);
  }

  async register(name: string, password: string, roles: string[]): Promise<{ id: string }> {
    const id = `u-${accounts.size + 1}`;
    accounts.set(name, {
      id,
      name,
      roles,
      // 每次新盐；参数写进结果，以后调高 N 时老密码仍能验证
      passwordHash: await hashPassword(password),
    });
    return { id };
  }

  async login(name: string, password: string): Promise<{ token: string; roles: string[] }> {
    const account = accounts.get(name);
    // 用户不存在与密码错误**返回同一个错误**：
    // 区分开等于告诉攻击者"这个用户名是存在的"
    if (!account || !(await verifyPassword(password, account.passwordHash))) {
      throw new HttpException(401, 'invalid credentials', 401);
    }
    log.info('login ok', { user: account.id, roles: account.roles });
    return {
      token: jwt.sign({ sub: account.id, roles: account.roles }, 3600),
      roles: account.roles,
    };
  }

  whoami(sub: string): { id: string; name: string; roles: string[] } {
    const account = [...accounts.values()].find((a) => a.id === sub);
    if (!account) throw new HttpException(404, 'account not found', 404);
    return { id: account.id, name: account.name, roles: account.roles };
  }
}

@Controller('/auth')
export class AuthController {
  constructor(private readonly service: AuthService) {}

  /** 公开路由：健康检查与登录都必须免认证——顺序反了会一起被拦 */
  @Public()
  @Get('/health')
  health(): { ok: true } {
    return { ok: true };
  }

  @Public()
  @Post('/login')
  async login(@Body() body: { name: string; password: string }): Promise<unknown> {
    return this.service.login(body.name, body.password);
  }

  /** 无 @Public、无 @Roles：只要登录了就能调 */
  @Get('/me')
  async me(): Promise<unknown> {
    return { ok: true };
  }

  /** 多角色是"任一"语义：admin 或 auditor 都可以 */
  @Roles('admin', 'auditor')
  @Get('/audit')
  async audit(): Promise<{ entries: number }> {
    return { entries: 42 };
  }

  @Roles('admin')
  @Post('/register')
  async register(@Body() body: { name: string; password: string; roles?: string[] }): Promise<unknown> {
    return this.service.register(body.name, body.password, body.roles ?? ['viewer']);
  }
}

@Module({ controllers: [AuthController], providers: [AuthService] })
export class AppModule {}
