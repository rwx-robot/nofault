# nofault v0.1.0 架构说明（内核雏形）

> 主题：**IoC 容器 + 模块系统 + 配置 + 日志 + 最小 HTTP 服务**
> 覆盖范围：模块编排（生命周期）+ 配置 + 结构化日志的最小集合
> 规范：**Node.js / NestJS 生态规范**（camelCase 导出、createXxx 工厂）

---

## 1. 这一版要解决的问题

v0.1.0 只回答一个问题：**如何让"声明式的类"被框架托管起来，并能对外提供 HTTP 服务？**

因此刻意不做：路由树、中间件管道、参数校验、异常过滤器、ORM、RPC、服务治理。
这些分别在 v0.2.0 及之后的版本引入。

三条设计红线：

1. **零 Web 框架依赖** —— 直接基于 `node:http`，不引入 Express / Fastify
2. **内核零业务依赖** —— `@nofault/core` 只依赖 `reflect-metadata`
3. **依赖方向单向** —— `@nofault/http` → `@nofault/core`，反向不成立（避免循环依赖）

---

## 2. 架构图

![nofault v0.1.0 架构图](./ARCHITECTURE.svg)

Mermaid 版（便于在支持 Mermaid 的阅读器里查看）：

```mermaid
graph TD
    subgraph APP["应用层 · 用户代码"]
        A1[AppModule]
        A2[GreeterService]
        A3[config/app.yaml]
        A4[router.ts 手写路由]
    end

    subgraph BOOT["引导层"]
        B1[NofaultFactory.create]
        B2[NofaultApplication.init / listen]
        B3[enableShutdownHooks]
    end

    subgraph CORE["@nofault/core 内核"]
        C1[ModuleScanner<br/>DFS 遍历模块图]
        C2[NofaultContainer<br/>注册表]
        C3[Injector<br/>构造/属性注入]
        C4[InstanceWrapper<br/>作用域与缓存]
        C5[ModuleRef<br/>可见性]
        C6[生命周期编排]
        C1 --> C2 --> C3 --> C4
        C2 --- C5
        C4 --- C6
    end

    subgraph PLAT["平台与配套"]
        P1["@nofault/config"]
        P2["@nofault/logger"]
        P3["@nofault/http<br/>NodeHttpAdapter"]
    end

    subgraph RT["运行时"]
        R1[node:http]
        R2[reflect-metadata]
        R3[SIGTERM/SIGINT]
    end

    A1 --> B1
    A2 --> B1
    B1 --> B2 --> B3