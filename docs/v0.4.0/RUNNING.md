# nofault v0.4.0 运行说明

环境、安装、构建、Lint 与 v0.1.0 相同，见 [`docs/v0.1.0/RUNNING.md`](../v0.1.0/RUNNING.md)。
这里只写 v0.4.0 新增的部分。

## 跑测试

```bash
pnpm test                                       # 全部（238 项）
pnpm vitest run packages/parser                 # 两种契约的解析 + 错误定位
pnpm vitest run packages/codegen                # 模板引擎 / 校验 / 生成 / 写盘策略
pnpm vitest run packages/cli                    # 参数解析 / 脚手架 / 各命令
pnpm vitest run tests/integration/v0.4.0        # 端到端：生成 → tsc 编译 → 真的起服务
```

集成测试会：
1. 把生成的工程写到仓库内 `.tmp/`（vitest 才能转译它）
2. 用仓库里的 `tsc` **真的编译一遍**生成物
3. `import` 生成的 module、起服务、打真实 HTTP 请求
4. afterAll 清理 `.tmp/`

## 跑示例

```bash
pnpm example v0.4.0-codegen-user-api
pnpm example v0.4.0-codegen-user-api PORT=3340
```

### curl 试一遍

```bash
# 存活
curl -s http://127.0.0.1:3000/api/user/ping

# 创建（DTO 校验：email 格式、name 长度）
curl -s -X POST http://127.0.0.1:3000/api/user/users \
  -H 'content-type: application/json' \
  -d '{"name":"alice","email":"a@example.com"}'

# 非法入参 -> 422，且指明哪个字段哪条规则
curl -s -X POST http://127.0.0.1:3000/api/user/users \
  -H 'content-type: application/json' -d '{"name":"x","email":"nope"}'

# 路径参数（:id 走 @Param 绑定）
curl -s http://127.0.0.1:3000/api/user/users/1
curl -s http://127.0.0.1:3000/api/user/users/abc   # 400，类型强转失败

# query 校验（page 最小值 1）
curl -s "http://127.0.0.1:3000/api/user/users?page=1&pageSize=10"
curl -s "http://127.0.0.1:3000/api/user/users?page=0&pageSize=10"   # 422
```

### 体验"改契约 → 重新生成"

```bash
# 1. 给契约加一条路由
#    api/user.api.ts 里加 @Get('/stats') stats(): OkResp { throw ... }
# 2. 重新生成
node ../../packages/cli/bin/nofaultctl.js generate api api/user.api.ts --out src --root-module
# 3. controller 多了 stats 路由，但手写过的 user.service.ts **没被覆盖**
```

生成器默认只覆盖"自己也认领过"的文件（首行生成标记）。
`user.service.ts` 已删掉标记，因此被跳过。

## 跑基准测试

```bash
pnpm bench v0.4.0
pnpm bench v0.4.0 --iterations=300 --report
```

测的是**开发期**成本：解析、生成、落盘的耗时，以及"1 行契约换来几行代码"。
详见 [`benchmarks/v0.4.0/REPORT.md`](../../benchmarks/v0.4.0/REPORT.md)。

## 目录导航

```
packages/dsl/src/spec.ts                ApiSpec / TypeSpec / RouteSpec / FieldSpec
packages/dsl/src/decorators.ts          契约装饰器（元数据只写不执行）
packages/parser/src/scanner.ts          词法：每个 token 带行列号
packages/parser/src/api-parser.ts       .api（文本 DSL）
packages/parser/src/ts-parser.ts        .api.ts（TS 契约）
packages/codegen/src/validate.ts        契约校验（一次报完）
packages/codegen/src/generate.ts        Spec → 文件内容（纯函数）
packages/codegen/src/writer.ts          落盘策略：只覆盖自己认领过的文件
packages/codegen/src/template.ts        mustache 子集模板引擎
packages/cli/src/cli.ts                 nofaultctl 入口
examples/v0.4.0-codegen-user-api/       可运行示例
tests/integration/v0.4.0/               端到端（含 tsc 编译验证）
```
