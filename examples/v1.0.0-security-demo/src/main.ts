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
        authMiddleware({
          jwt,
          handlerOf: () => {
            const route = (ctx as { route?: { controller: object; propertyKey: string | symbol } }).route;
            return route ? { target: route.controller, propertyKey: route.propertyKey } : undefined;
          },
          // 把身份交给请求上下文，后续 handler / 日志都能取到
          setPrincipal: (principal) => {
            (ctx as { state: Map<string, unknown> }).state.set('principal', principal);
          },
        })(ctx as never, next),
    ] as never[],
  });

  const { port } = await app.listen(PORT, '127.0.0.1');
  const log = createLogger({ level: 'info', context: 'main' });
  log.info(`listening on http://127.0.0.1:${port}`);

  console.log(`
试一试：

  # 公开路由
  curl -s http://127.0.0.1:${port}/auth/health
