# Benchmark Report — v0.3.0

> 目标：量化"运行时基座"（请求上下文 + REQUEST 作用域 + 热配置 + 探针）的边际成本，
> 并用它反过来**发现并修掉热路径上的性能问题**。

## 方法

- **基线**：纯 `node:http`，手写等效逻辑（`baseline-server.mjs`）
- **被测**：`examples/v0.3.0-runtime-basics`
- 被测服务与压测器**分进程**；多轮交替，取 RPS 中位数
- 压测前先轮询 `/readyz`，避免把启动过程算进吞吐

### 场景

| 场景 | 覆盖的框架能力 |
| --- | --- |
| `GET /api/runtime/config` | 路由 + 请求上下文 + 4 个全局中间件 + 每请求 DI + 热配置读取 + 响应包装 |
| `GET /api/runtime/context` | 上述全部 + REQUEST 作用域实例化 + 每请求解析控制器 |

## 环境

| 项 | 值 |
| --- | --- |
| Node.js | v22.22.2 |
| 平台 | darwin / x64 |
| 并发 | 32 |
| 时长 | 4s / 轮 |
| Warmup | 1s |
| 轮次 | 2 |

## 结果

### A. 上下文微基准（进程内）

| 指标 | 优化前 | 优化后 |
| --- | --- | --- |
| `new RequestContext()` | 62,303 ops/sec | **153,130 ops/sec**（2.5×） |
| ALS `run + current()` | 59,102 ops/sec（16.92 µs/次） | **142,643 ops/sec（7.01 µs/次）** |

### B. HTTP 端到端

| 场景 | 基线 rps | nofault rps | 开销 | p50 | p95 | p99 |
| --- | --- | --- | --- | --- | --- | --- |
| GET config（路由+上下文） | 11,969.0 | 7,768.5 | **35.1%** | 3.913 ms | 6.542 ms | 7.613 ms |
| GET context（+REQUEST 作用域） | 11,798.9 | 8,221.3 | **30.3%** | 3.674 ms | 6.228 ms | 7.178 ms |

> 对比：v0.2.0 的 `GET /api/users/1` 开销是 5.9%。