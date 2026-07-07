# @nofault/core

IoC 容器、模块系统与生命周期。

**引入版本**：v0.1.0

## 为什么这么设计

- 装饰器 + 元数据反射（遵循 NestJS 约定），工厂用 `createXxx()`、导出用 camelCase
- 容器在**启动阶段**解析依赖图：缺依赖会立刻失败，而不是等到第一次调用才炸
- 三种 Provider 形态：`useClass` / `useValue` / `useFactory`
- 三种作用域：SINGLETON（默认）/ REQUEST / TRANSIENT

## 最快上手
