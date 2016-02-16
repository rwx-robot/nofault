import {
  readScope,
  readDependencyOverrides,
  readOptionalParams,
  readParamTypes,
  readPropertyInjections,
} from '../decorators/injectable.decorator';
import { CircularDependencyError, UnknownDependencyError } from '../errors';
import type { Provider } from '../interfaces/module.interface';
import {
  isClassProvider,
  isExistingProvider,
  isFactoryProvider,
  isValueProvider,
} from '../interfaces/module.interface';
import { Scope } from '../interfaces/type.interface';
import type { InjectionToken } from '../interfaces/type.interface';
import { tokenToString } from '../interfaces/type.interface';
import { InstanceWrapper } from './instance-wrapper';
import type { ContextId } from './instance-wrapper';
import type { ModuleRef } from './module-ref';
import type { NofaultContainer } from './container';

/**
 * 注入器：负责把一个 Provider 定义变成真实实例。
 *
 * 解析顺序（与 NestJS 一致）：
 * 1. 本模块声明的 Provider
 * 2. 导入模块的 exports
 * 3. 全局模块
 * 4. 抛 UnknownDependencyError
 *
 * `contextId` 会一路透传给依赖链，
 * 这样 REQUEST 作用域的 Provider 才能在同一请求内共享同一个实例。
 */
export class Injector {
  /** 当前解析栈，用于循环依赖检测 */
  private readonly resolutionStack: string[] = [];

  constructor(private readonly container: NofaultContainer) {}

  /** 计算某个 Provider 的作用域 */
  static resolveScope(provider: Provider): Scope {
    if (typeof provider === 'function') return readScope(provider);
    if (isClassProvider(provider)) return provider.scope ?? readScope(provider.useClass);
    if (isFactoryProvider(provider)) return provider.scope ?? Scope.SINGLETON;
    // 值 / 别名 Provider 本质上都是单例
    return Scope.SINGLETON;
  }

  /** 为 Provider 创建实例包装器（惰性，不立即实例化） */
  createWrapper(provider: Provider, moduleRef: ModuleRef): InstanceWrapper {
    const token = typeof provider === 'function' ? provider : provider.provide;
    const scope = Injector.resolveScope(provider);
    const wrapper = new InstanceWrapper(
      token,
      scope,
      (contextId) => this.instantiate(provider, moduleRef, token, contextId),
      isFactoryProvider(provider) || this.isAsyncProvider(provider),
    );
    wrapper.hostModule = moduleRef.name;
    return wrapper;
  }

  private isAsyncProvider(provider: Provider): boolean {
    return isFactoryProvider(provider);
  }

  /** 真正创建对象 */
  private async instantiate(
    provider: Provider,
    moduleRef: ModuleRef,
    token: InjectionToken,
    contextId?: ContextId,
  ): Promise<unknown> {
    if (typeof provider === 'function') {
      return this.instantiateClass(provider, provider, moduleRef, token, contextId);
    }
    if (isClassProvider(provider)) {
      return this.instantiateClass(provider.useClass, provider.useClass, moduleRef, token, contextId);
    }
    if (isValueProvider(provider)) {
      return provider.useValue;
    }
    if (isFactoryProvider(provider)) {
      const deps = provider.inject ?? [];
      const args = await this.resolveMany(deps, moduleRef, token, contextId);
      return provider.useFactory(...(args as never[]));
    }
    if (isExistingProvider(provider)) {
      return this.resolveFromModule(provider.useExisting, moduleRef, contextId);
    }
    throw new UnknownDependencyError(token, moduleRef.name);
  }

  private async instantiateClass(
    ctor: { new (...args: never[]): unknown },
    target: Function,
    moduleRef: ModuleRef,
    token: InjectionToken,
    contextId?: ContextId,
  ): Promise<unknown> {
    const paramTypes = readParamTypes(target);
    const overrides = readDependencyOverrides(target);
    const optionals = readOptionalParams(target);
    const length = Math.max(paramTypes.length, overrides.length);

    const args: unknown[] = [];
    for (let i = 0; i < length; i++) {
      const depToken = overrides[i] ?? paramTypes[i];
      if (depToken === undefined) {
        args.push(undefined);
        continue;
      }
      // 跳过 JS 内置类型（Number/String/Object 等），它们无法作为 Provider
      if (this.isBuiltinType(depToken)) {
        if (!optionals.includes(i)) {
          throw new UnknownDependencyError(depToken, `${tokenToString(token)}[arg${i}]`);
        }
        args.push(undefined);
        continue;
      }
      try {
        args.push(await this.resolveFromModule(depToken, moduleRef, contextId));
      } catch (err) {
        if (optionals.includes(i) && err instanceof UnknownDependencyError) {
          args.push(undefined);
          continue;
        }
        throw err;
      }
    }

    const instance = new ctor(...(args as never[]));
    await this.injectProperties(instance, target, moduleRef, contextId);
    return instance;
  }

  private isBuiltinType(token: InjectionToken): boolean {
    if (typeof token !== 'function') return false;
    const name = token.name;
    return ['Number', 'String', 'Boolean', 'Object', 'Array', 'Function', 'Symbol', 'Promise', 'Date'].includes(name);
  }

  /** 属性注入 */
  private async injectProperties(
    instance: unknown,
    target: Function,
    moduleRef: ModuleRef,
    contextId?: ContextId,
  ): Promise<void> {
    const props = readPropertyInjections(target);
    for (const prop of props) {
      try {