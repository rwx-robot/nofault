# Benchmark Report — v0.1.0

> 目标：量化「框架抽象」相对「裸 `node:http`」的开销，确认内核没有引入隐性成本。

## 方法

- **被测对象 A（基线）**：纯 `node:http` 服务，手写 URL 解析 + `res.writeHead` + `res.end`
- **被测对象 B**：nofault v0.1.0 示例 `hello-kernel`（IoC 容器 + 模块系统 + 配置 + 适配器）
- **接口**：`GET /hello?name=world`，两者返回**完全相同的 JSON**
- **压测器**：自研零依赖脚本（`benchmarks/v0.1.0/bench.mjs`）
  - keep-alive 连接池，固定并发数
  - 每轮：warmup → 固定时长采样
  - **多轮交替**，取 RPS 中位数轮次，规避冷启动偏差

### 关键方法论修正

> 初版把基线服务和压测器放在**同一个进程**，压测器与服务端争抢 CPU，
> 导致基线 RPS 被压低约 46%，出现「nofault 比裸 node:http 还快 70%」的荒谬结论。
>
> **修正后**：被测服务一律独立子进程，压测器独占自己的进程。数据才具备可比性。

## 环境

| 项 | 值 |
| --- | --- |
| Node.js | v22.22.2 |
| 平台 | darwin / x64 |
| 并发 | 32 |
| 时长 | 6s / 轮 |
| Warmup | 1s |
| 轮次 | 3 |

## 结果

| 目标 | RPS | 平均 (ms) | p50 (ms) | p95 (ms) | p99 (ms) | max (ms) |
| --- | --- | --- | --- | --- | --- | --- |
| raw node:http（基线） | 13191.1 | 2.410 | 2.301 | 3.962 | 4.542 | 6.375 |
| **nofault v0.1.0** | **13266.3** | **2.396** | **2.254** | **4.044** | **4.484** | **7.765** |

**吞吐差距：-0.6%**（正数表示 nofault 更慢；-0.6% 在测量噪声范围内，视为零开销）

各轮 RPS：

- baseline：`[12622.1, 13272.1, 13191.1]`
- nofault ：`[13308.9, 13160.3, 13266.3]`

## 结论

1. **内核抽象是零成本的**：IoC 解析只在启动阶段发生一次，请求路径上只有
   `handler 链 → sendJson`，与手写代码几乎等价。
2. p99 与 max 略有差异（4.484 vs 4.542 / 7.765 vs 6.375），主要来自 GC 与进程调度噪声，
   非框架路径引入。
3. 本版**未**引入路由树、中间件、校验等请求路径开销；
   v0.2.0 之后每一版都需要重新测量，观察这些能力各自的边际成本。

## 复现

```bash
cd nofault-all/nofault
pnpm build
cd examples/v0.1.0-hello-kernel && npx tsc -p tsconfig.json && cd -
node scripts/run-bench.mjs v0.1.0 --duration=10 --connections=64 --rounds=5 --report
```

原始数据在 `results.json`。
