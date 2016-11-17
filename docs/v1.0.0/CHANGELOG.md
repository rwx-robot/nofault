# Changelog — v1.0.0（2026 · 全量对齐 + 生产增强）

> 安全相关的默认值一律选"拒绝"那一侧。

## 2026-09-19 文档与注释净化（v1.0.0 发布后）

- 清除历史清理事故遗留的占位损坏文本（101 行，原词被红改替换，曾固化进全部 tag 的树）
- 文档与注释中的外部框架血统字样改写为中性表述，全库以 Node.js / NestJS 规范为唯一口径
- 能力对照表改为"能力 → 包"形态；README 快照生成器修复（不再覆盖手工精修版）
- 验证：`rg` 全库归零、11 个 tag 树抽查归零、425 项测试 + tsc + eslint 全绿

## 2026-09-19 发布内优化（F1.8 ~ F1.10）

- **F1.8 静态文件流式化**（rest）：新增 `RestResponse.stream()`，`serveStatic` 改
  `createReadStream` + `pipeline`，大文件不再全量进内存、背压由管线接管；
  全局中间件改在路由匹配之外运行——未命中路径也能被静态中间件接住（原实现 404 先于中间件，
  serveStatic 对未命中路径形同虚设）；延迟提交语义保留
- **F1.9 日志异步落盘**（logger）：文件传输器改**异步串行写队列**，热路径不再阻塞事件循环；
  `await flush()` 即"这批已落盘"；`flushSync()` 保留为进程退出兜底
- **F1.10 refresh token 重用检测**（security）：已轮转 token 再次出现即判定泄露，
  **静默吊销整个会话族**；`TokenStore` 增加两个可选方法（墓碑反查 + 按族吊销），
  缺省实现自动降级为"仅拒绝"；对客户端仍只回 401，不透露检测到了什么
- 累计 429 项测试全通过（新增 4 项），tsc 与 eslint 全清

## 2026-09-19 流式与新出口（F1.11 ~ F1.13）

- **F1.11 SSE 事件流**（rest）：`openSse(ctx)` 返回 `SseWriter`（`send` / `comment` 心跳 / `close`），
  建在 `RestResponse.stream()` 之上——分帧、延迟提交、背压全部复用
- **F1.12 服务端流式 RPC**（rpc）：handler 返回 **AsyncIterable 即流式**——线上新增 `{id, chunk}` 中间帧，
  末帧仍为正常响应，一元调用字节级不变；客户端 `callStream()` 以 AsyncIterable 消费；
  流**不重试、无整体超时**（过程性语义，节奏由服务端决定），数组等普通返回值保持一元
- **F1.13 MCP 服务器模式**（新包 `@nofault/mcp`，第 18 个包）：stdio 上的换行分隔 JSON-RPC，
  零依赖实现 `initialize` / `tools/list` / `tools/call` / `ping`；工具错误走 `result.isError`，
  协议级错误才用 JSON-RPC error；流可注入，测试与嵌入零成本
- 累计 437 项测试全通过（新增 8 项），tsc 与 eslint 全清

## 2026-09-19 MCP 接进 CLI（F1.15）

- **F1.15 `nofaultctl mcp new <project>`**（cli）：一键生成可跑的 MCP 服务器工程——
  `package.json`（依赖 `@nofault/mcp`，ESM）+ `tsconfig.json`（NodeNext）+ `src/main.ts`
  （注入 SIGINT/SIGTERM 干净退出）+ `src/tools.ts`（示例 `echo` 工具，附 JSON Schema）。
  复用 `commands/new.ts` 的“不留 TODO、立刻能跑”契约，误用返回清晰错误。
- 累计 438 项测试全通过（新增 1 项），tsc 与 eslint 全清

## 2026-09-19 治理与工具（F1.16）

- **短命令**：`nfc` 作为 `nofaultctl` 的别名入口（同一份实现，仅入口不同）；
  子命令命名不变（`nfc new` / `nfc mcp` / `nfc generate` 等）
- **README 架构概览**：`gen-readme-snapshots.mjs` 自动从对应版本的 `ARCHITECTURE.md` 的
  "## 一句话" 摘要段生成 README 的"## 架构概览"块，并保留到完整架构文件的链接
- **治理中性化**：`commit-plan.author.email` 改为项目化邮箱 `maintainers@nofault.io`（重建后
  GitHub 贡献归属按此生效）；`@nofault/mcp` 与 `mcp new` 命令的注释/脚手架 README 不再指向
  具体第三方客户端（改为"实现 MCP 协议的客户端"，与协议层解耦）；`gen-history.mjs` 的 `IGNORE_DIRS`
  扩到本地开发期可能残留的编辑器/工具配置目录（`.claude` / `.cursor` / `.codex`）

## 新增包 `@nofault/security`

- **JWT**（HS256，node:crypto，零依赖）
  - `alg` 不从 token 读，只确认它等于服务端配置的那个（挡住 alg:none 与算法混淆）
  - 校验 exp / nbf / iss / aud，默认容忍 30 秒时钟偏移
  - 签名比较用 `timingSafeEqual`
  - token 无效一律 401，**不透露原因**
- **密码**（scrypt）
  - 每次新盐；哈希格式 `scrypt$N$r$p$salt$hash` 记录参数，便于以后调高成本
  - 定时安全比较
  - 弱密钥（< 16 字符）在构造时直接拒绝
- **RBAC**
  - `@Public()` / `@Roles('admin', 'auditor')`，语义是**任一**
  - `authorize()` 默认拒绝；`authMiddleware()` 只提供身份，授权交给 handler

## 关键设计决策

| 决策 | 理由 |
| --- | --- |