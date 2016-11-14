# Benchmark Report — v0.2.0

> 目标：量化"HTTP 全栈层"（路由 + 中间件 + 参数绑定 + 校验）相对裸 `node:http` 的边际成本。

## 方法

- **基线**：纯 `node:http`，手写等效逻辑（见 `baseline-server.mjs`）
- **被测**：`examples/v0.2.0-rest-user-api`（Radix 路由 + 4 个全局中间件 + 路由级中间件 + 参数绑定 + DTO 校验）
- **被测服务与压测器分进程**（继承 v0.1.0 的教训：同进程会互相抢 CPU，基线失真 46%）
- **多轮交替**，取 RPS 中位数轮次

### 场景

| 场景 | 覆盖的框架能力 |
| --- | --- |
| `GET /api/users/1` | 路由匹配 + 路径参数提取 + 类型转换 + 全局/路由级中间件 + 响应包装 |
| `POST /api/users/echo` | 上述全部 + body 解析 + DTO 校验 |

> **为什么用 echo 而不是 create**：create 在重复邮箱时走 409，而**抛异常要捕获调用栈**，
> 拿它测吞吐实际测的是异常开销。echo 端点专门为"成功路径"提供对照样本。

## 环境

| 项 | 值 |
| --- | --- |
| Node.js | v22.22.2 |
| 平台 | darwin / x64 |
| 并发 | 32 |
| 时长 | 5s / 轮 |
| Warmup | 1s |
| 轮次 | 3 |

## 结果

### A. 路由匹配（进程内，纯 CPU）

| 指标 | 值 |
| --- | --- |
| 吞吐 | **1,743,832 ops/sec** |
| 样本 | 1,000,000 次匹配 / 573 ms |
| 路由表 | 10 条（静态 + 参数 + 双层参数 + 深层路径） |

### B. HTTP 端到端

| 场景 | 基线 rps | nofault rps | 开销 | nofault p50 | nofault p95 | nofault p99 |
| --- | --- | --- | --- | --- | --- | --- |
| GET /api/users/1 | 12,927.0 | 12,165.8 | **5.9%** | 2.389 ms | 4.403 ms | 4.800 ms |
| POST /api/users/echo | 12,487.5 | 9,816.3 | **21.4%** | 3.074 ms | 5.415 ms | 6.097 ms |

## 优化过程（真实记录）

初版测出来 GET 开销 15.8%、POST 开销 46%，明显偏高。逐步定位并修复：

| # | 发现 | 措施 | 收益 |
| --- | --- | --- | --- |
| 1 | 每请求 `logger.info()` 写 stdout，而 stdout 被管道读走 | 访问日志降为 `debug`（默认级别下不输出） | GET 15.8% → 5.9%（**−9.9pp**） |
| 2 | `resolveHandlerArgs` 每请求执行 `Reflect.getMetadata` + `sort()` | `WeakMap` 记忆化参数元数据与 DTO | POST 27% → 21.4%（**−5.6pp**） |
| 3 | POST 场景实际跑在 409 抛异常路径上 | 新增 echo 端点测量成功路径 | 数据才具备可比性 |

**结论**：框架的**结构性开销**（路由 + 中间件 + 包装）只有 ~6%；
剩下的主要来自 `for await` 逐块读 body 与校验器本身的 CPU 成本，属于能力换来的合理代价。

## 复现

```bash
cd nofault-all/nofault
pnpm build
cd examples/v0.2.0-rest-user-api && npx tsc -p tsconfig.json && cd -
node scripts/run-bench.mjs v0.2.0 --duration=10 --connections=64 --rounds=5 --report
```

原始数据在 `results.json`。
