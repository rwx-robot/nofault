# 示例：v0.3.0 runtime-basics

演示 v0.3.0 的四个运行时能力：**请求上下文 + REQUEST 作用域 + 配置热更新 + traceId 日志 + 健康探针**。

## 跑起来

```bash
# 在 nofault/ 根目录
pnpm example v0.3.0-runtime-basics
pnpm example v0.3.0-runtime-basics PORT=3333
```

## 试一试

```bash
# 1) 请求上下文 + REQUEST 作用域
curl -s http://127.0.0.1:3000/api/runtime/context
# {"requestId":"req_f6516589","traceId":"afc5…","scopeInstanceNo":1,
#  "scopeRequestId":"req_f6516589","configReloadable":true}
#   ↑ requestId 与 scopeRequestId 一致；多打几次 scopeInstanceNo 会递增

# 2) 配置热更新（改 config/app.yaml 后无需重启）
curl -s http://127.0.0.1:3000/api/runtime/config

# 3) traceparent 传播
curl -s -H 'traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01' \
  http://127.0.0.1:3000/api/runtime/trace
# traceId 与上游一致，parentSpanId 为上游 spanId

# 4) 请求内共享实例
curl -s -X POST http://127.0.0.1:3000/api/runtime/notes \
  -H 'content-type: application/json' -d '{"note":"a"}'
# notes 每次请求都是新的 —— 证明没有跨请求复用

# 5) 探针
curl -i http://127.0.0.1:3000/healthz
curl -i http://127.0.0.1:3000/readyz

# 6) 日志（每行自动带 traceId）
tail -f logs/runtime-basics.log
```

## 文件说明

| 文件 | 作用 |
| --- | --- |
| `src/main.ts` | 装配：日志 `contextProvider`、中间件顺序、readiness 检查、`markReady()` |
| `src/app.module.ts` | 用 `ConfigModule.forRootAsync({ watch: true })` 开启热更新 |
| `src/request-scope.service.ts` | `@Injectable({ scope: Scope.REQUEST })` 的请求级服务 |
| `src/runtime.controller.ts` | 四个端点分别演示四项能力 |
| `config/app.yaml` | 运行时可改的配置 |

## 这个示例证明了什么

1. **上下文自动传播** —— 业务代码不接参数也能拿到 requestId / traceId
2. **REQUEST 作用域语义正确** —— 每请求一份、请求内共享、跨请求隔离
3. **Captive dependency 被自动纠正** —— 单例控制器虽依赖请求级服务，也不会串数据
4. **热更新端到端可用** —— 改文件 → 下一次请求就读到新值
5. **探针语义分离** —— `/healthz` 与 `/readyz` 返回不同的检查项

## 测试

```bash
pnpm vitest run tests/integration/v0.3.0
```
