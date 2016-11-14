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
> v0.3.0 的 30~35% **不是回归**，而是这一版真的多做了事：
> 请求上下文、每请求依赖解析、4 个全局中间件、就绪探针注册。
> 基线服务则是"直给"，不含这些。

## 基准测试挖出的两处真实问题（已修）

这正是"每个版本都要跑 benchmark"的价值——两处问题靠读代码都发现不了：

### 1. 每次 `config.get()` 都全量克隆配置

`ConfigService.read()` → `registry.values()`，而 `values()` 里是 `structuredClone(current)`。
也就是说**读一个配置项的成本 = 克隆整份配置**。示例里一个请求读 3 次，就是 3 次全量克隆。

**修法**：`values()` 直接返回内部对象，不再克隆。
安全性由"整体替换"保证——`reload()` 每次生成全新对象，从不在原地改，
所以旧引用不会看到撕裂状态。需要不可变副本时用 `ConfigService.snapshot()`（那里仍克隆）。

收益：config 场景开销 **50.2% → 35.1%（−15pp）**。

### 2. 每个请求做 3 次 `crypto.getRandomValues`

建一个 `RequestContext` 需要 traceId(32hex) + spanId(16hex) + requestId(8hex)，
原本各自调用一次随机源 —— 每次调用都有固定开销，合计约 16µs。

**修法**：新增 `generateRequestIds()`，一次抽 28 字节（56 hex）再切分，调用次数 3 → 1。

收益：上下文创建 **62k → 153k ops/sec（2.5×）**，ALS run **16.92 → 7.01 µs**。

## 结论

1. 上下文与 REQUEST 作用域的**绝对成本很低**（~7µs/请求），
   在 8k rps 量级下约占 0.06 秒/秒，不是瓶颈。
2. 真正的开销来自**中间件数量与每请求 DI**，这属于"能力换成本"，
   后续可用"中间件编译期折叠成单个函数"（框架通行做法）进一步优化。
3. 热路径上**任何一次 structuredClone / crypto 调用都要当心**。

## 复现

```bash
cd nofault-all/nofault
pnpm build
cd examples/v0.3.0-runtime-basics && npx tsc -p tsconfig.json && cd -
node scripts/run-bench.mjs v0.3.0 --duration=10 --connections=64 --rounds=5 --report
```

原始数据在 `results.json`。
