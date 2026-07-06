# @nofault/core

IoC 容器、模块系统与生命周期。

**引入版本**：v0.1.0

## 为什么这么设计

- 装饰器 + 元数据反射（遵循 NestJS 约定），工厂用 `createXxx()`、导出用 camelCase
- 容器在**启动阶段**解析依赖图：缺依赖会立刻失败，而不是等到第一次调用才炸
- 三种 Provider 形态：`useClass` / `useValue` / `useFactory`
- 三种作用域：SINGLETON（默认）/ REQUEST / TRANSIENT

## 最快上手

```ts
import 'reflect-metadata';
import { Injectable, Module, Inject } from '@nofault/core';

@Injectable()
class UserRepository {
  find(id: string) { return { id }; }
}

@Injectable()
class UserService {
  constructor(private readonly repo: UserRepository) {}
  get(id: string) { return this.repo.find(id); }
}

@Module({ providers: [UserRepository, UserService] })
class UserModule {}
```

## 注意

装饰器元数据依赖 `emitDecoratorMetadata`；关掉它 `@Inject` 会拿不到类型，且报错指不到这里。

## 相关文档

- 架构说明 → [`docs/v0.1.0/ARCHITECTURE.md`](../../docs/v0.1.0/ARCHITECTURE.md)
- 变更记录 → [`docs/v0.1.0/CHANGELOG.md`](../../docs/v0.1.0/CHANGELOG.md)
