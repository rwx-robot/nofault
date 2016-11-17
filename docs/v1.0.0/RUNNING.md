# nofault v1.0.0 运行说明

其余与 v0.1.0 相同，见 [`docs/v0.1.0/RUNNING.md`](../v0.1.0/RUNNING.md)。

## 跑测试

```bash
pnpm test                                    # 全部（396 项）
pnpm vitest run packages/security            # JWT / 密码 / RBAC / 中间件
pnpm vitest run tests/integration/v1.0.0     # 真实 HTTP 上的 401 / 403 / 200
```

## 用起来

```ts
import { Jwt, Roles, Public, authMiddleware, SecurityModule } from '@nofault/security';

const jwt = new Jwt(process.env.JWT_SECRET!, { issuer: 'my-app', audience: 'api' });

// 登录：签发
const token = jwt.sign({ sub: user.id, roles: user.roles }, 3600);

// 校验（不抛错即有效）
const payload = jwt.verify(token);

// 控制器
class AdminController {
  @Public()
  @Get('/health')
  health() { return { ok: true }; }

  @Roles('admin')
  @Get('/wipe')
  wipe() { return { wiped: true }; }
}

// 挂中间件
RestApplication.create(AppModule, {
  middleware: [bodyParser(), authMiddleware({ jwt, handlerOf: () => currentHandler() })],
});
```

## 跑示例

```bash