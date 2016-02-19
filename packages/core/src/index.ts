/**
 * @nofault/core —— 内核：IoC 容器、模块系统、生命周期。
 *
 * 规范：遵循 Node.js / NestJS 生态约定（装饰器 + 元数据反射），
 * 工厂用 `createXxx()`，导出用 camelCase。
 */

// 反射元数据必须在任何装饰器之前加载
import 'reflect-metadata';

export * from './interfaces/type.interface';
export * from './interfaces/module.interface';
export * from './constants';
export * from './errors';

export { Module, Global, readModuleMetadata, isGlobalModule } from './decorators/module.decorator';
export {
  Injectable,
  Inject,
  Optional,
  readScope,
  readParamTypes,
  readDependencyOverrides,
  readPropertyInjections,
} from './decorators/injectable.decorator';

export { NofaultContainer } from './container/container';
export { MissingContextIdError } from './errors';
export { ModuleRef } from './container/module-ref';
export { InstanceWrapper } from './container/instance-wrapper';
export type { ContextId } from './container/instance-wrapper';