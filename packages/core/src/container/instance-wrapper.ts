import { Scope } from '../interfaces/type.interface';
import type { InjectionToken } from '../interfaces/type.interface';
import { MissingContextIdError } from '../errors';

/**
 * 上下文标识：一个请求对应一个 contextId。
 *
 * 内核只把它当作**不透明的 key**——它到底是 `AsyncLocalStorage` 里的对象、
 * 还是 gRPC 的 metadata，内核不关心。具体语义由 `@nofault/context` 定义。
 */
export type ContextId = object;

/**
 * 实例包装器：容器里真正存放的东西。
 *
 * 职责：
 * 1. 持有"如何创建对象"的知识（工厂或类）