/**
 * v1.0.0 示例入口。
 *
 * 关键点：认证中间件通过 `ctx.route` 拿到当前 handler 的装饰器
 * （`@Public` / `@Roles`）——这个字段是本次专门加的，
 * 之前中间件拿不到"现在调的是哪个 handler"，只能靠调用方维护 path 映射。
 */
import 'reflect-metadata';
import { RestApplication, bodyParser } from '@nofault/rest';
import { authMiddleware } from '@nofault/security';
import { createLogger } from '@nofault/logger';

import { AppModule, jwt } from './auth';

const PORT = Number(process.env.PORT ?? 3400);

async function main(): Promise<void> {
  const app = await RestApplication.create(AppModule, {
    quiet: true,
    middleware: [
      bodyParser(),
      // handlerOf 直接读 ctx.route（本次新增）：
      // 鉴权要按 handler 上的 @Public / @Roles 判断，拿不到 handler 就只能瞎猜
      (ctx: { route?: { controller: object; propertyKey: string | symbol }; state: Map<string, unknown> }, next: () => Promise<void>) =>