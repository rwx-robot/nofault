# @nofault/security

认证与授权：JWT（HS256）、scrypt 密码哈希、RBAC。

**引入版本**：v1.0.0

## 为什么这么设计

- **`alg` 不从 token 读**：照 header 说的算法去验证，正是 alg:none 与 RS→HS 混淆的根源
- 签名比较用 `timingSafeEqual`——`===` 在第一个不同字节就返回
- 容忍 30 秒时钟偏移：不容忍的话机器差几秒就大面积误判
- token 无效一律 401 **且不透露原因**（"签名不对"还是"过期了"都是在递信息）
- 哈希参数写进结果（`scrypt$N$...`）：以后调高成本时老密码仍能验证
- **默认拒绝**：漏写装饰器应当是"调不通"，而不是"谁都能调"

## 最快上手

```ts
import { Jwt, Roles, Public, authMiddleware } from '@nofault/security';

const jwt = new Jwt(process.env.JWT_SECRET!, { issuer: 'my-app' });
const token = jwt.sign({ sub: user.id, roles: user.roles }, 3600);

class AdminController {
  @Public() @Get('/health') health() {}
  @Roles('admin') @Get('/wipe') wipe() {}
}
```

## 注意

中间件要**先**判断 `@Public` **再**决定 401——顺序反了会把健康检查一起拦掉（误摘除，生产事故级）。

## 相关文档

- 架构说明 → [`docs/v1.0.0/ARCHITECTURE.md`](../../docs/v1.0.0/ARCHITECTURE.md)
- 变更记录 → [`docs/v1.0.0/CHANGELOG.md`](../../docs/v1.0.0/CHANGELOG.md)
