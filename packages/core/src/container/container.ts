import type { DynamicModule, Provider } from '../interfaces/module.interface';
import {
  getProviderToken,
  isClassProvider,
  isExistingProvider,
  isFactoryProvider,
} from '../interfaces/module.interface';
import { Scope } from '../interfaces/type.interface';
import type { InjectionToken, Type } from '../interfaces/type.interface';
import { tokenToString } from '../interfaces/type.interface';
import { ContainerLockedError } from '../errors';
import type { ContextId } from './instance-wrapper';
import { readParamTypes } from '../decorators/injectable.decorator';
import { Injector } from './injector';
import type { InstanceWrapper } from './instance-wrapper';
import { ModuleRef } from './module-ref';

/**
 * nofault IoC 容器。
 *
 * 生命周期：`registerModule()` → `createProviders()` → `createInstances()` → `lock()`
 */
export class NofaultContainer {
  private readonly modules = new Map<InjectionToken, ModuleRef>();
  private readonly globalModules = new Set<ModuleRef>();
  private readonly injector: Injector;
  private locked = false;

  constructor() {
    this.injector = new Injector(this);
  }

  getModule(token: InjectionToken): ModuleRef | undefined {
    return this.modules.get(token);
  }

  getAllModules(): ModuleRef[] {
    return [...this.modules.values()];
  }

  /** 注册模块（幂等，同一个类只注册一次） */
  registerModule(raw: Type<unknown> | DynamicModule): ModuleRef {
    if (this.locked) throw new ContainerLockedError();
    const target = (raw as DynamicModule).module ?? (raw as Type<unknown>);
    const existing = this.modules.get(target);
    if (existing) return existing;

    const ref = new ModuleRef(target, raw);
    this.modules.set(target, ref);
    if (ref.isGlobal) this.globalModules.add(ref);
    return ref;
  }

  /** 把 Provider 定义转成 InstanceWrapper（惰性，未实例化） */
  createProviders(moduleRef: ModuleRef): void {
    const defs: Provider[] = [
      ...((moduleRef.raw as DynamicModule).providers ?? []),
      ...moduleRef.providerDefs,
    ];
    for (const def of defs) {
      const token = getProviderToken(def);
      if (moduleRef.hasProvider(token)) continue;
      moduleRef.addProvider(def, this.injector.createWrapper(def, moduleRef));
    }
  }

  /**
   * 按可见性规则查找 InstanceWrapper。
   * 顺序：本模块 → 导入模块的导出 → 全局模块。
   */
  lookupWrapper(token: InjectionToken, moduleRef: ModuleRef, visited = new Set<ModuleRef>()): InstanceWrapper | undefined {
    if (visited.has(moduleRef)) return undefined;
    visited.add(moduleRef);

    const own = moduleRef.providers.get(token);
    if (own) return own;

    for (const imported of moduleRef.imports) {
      if (!imported.exports.has(token)) continue;
      const found = this.lookupWrapper(token, imported, visited);
      if (found) return found;
    }

    // 模块重导出：exports: [UserModule] 的场景
    for (const imported of moduleRef.imports) {
      const isModuleExport = [...imported.exports].some((e) => e === imported.token);
      if (!isModuleExport && !moduleRef.exports.has(imported.token)) continue;
      const found = this.lookupWrapper(token, imported, visited);
      if (found) return found;
    }

    for (const global of this.globalModules) {
      if (global === moduleRef) continue;
      if (!global.exports.has(token)) continue;
      const found = this.lookupWrapper(token, global, visited);
      if (found) return found;
    }

    return undefined;
  }

  /**
   * 沿依赖图传播 REQUEST 作用域（captive dependency 检测）。
   *
   * 规则：若 A 依赖 B，而 B 是 REQUEST 作用域（或已被污染），则 A 也被污染。
   * 迭代到不动点，覆盖任意深度的传递依赖。
   *
   * 为什么必须做：单例缓存住一个请求级对象，会导致**跨请求数据串号**，
   * 这类 bug 在压测和线上偶发，靠 code review 很难发现。
   */
  propagateRequestScope(): void {
    const byToken = new Map<InjectionToken, InstanceWrapper>();
    for (const mod of this.modules.values()) {
      for (const [token, wrapper] of mod.providers) byToken.set(token, wrapper);
    }

    const depsOf = (wrapper: InstanceWrapper): InjectionToken[] => {
      const def = this.findProviderDef(wrapper.token);
      if (!def || typeof def === 'function') return readParamTypes(def ?? (wrapper.token as never));
      if (isClassProvider(def)) return readParamTypes(def.useClass);
      if (isFactoryProvider(def)) return def.inject ?? [];
      if (isExistingProvider(def)) return [def.useExisting];
      return [];
    };

    let changed = true;
    let guard = 0;
    while (changed && guard++ < 100) {
      changed = false;
      for (const mod of this.modules.values()) {
        for (const wrapper of mod.providers.values()) {
          if (wrapper.scope === Scope.REQUEST || wrapper.contextDependent) continue;
          for (const dep of depsOf(wrapper)) {
            const target = byToken.get(dep);
            if (target && (target.scope === Scope.REQUEST || target.contextDependent)) {
              wrapper.contextDependent = true;
              changed = true;
              break;
            }
          }
        }
      }
    }
  }

  /** 在任意模块里找 token 对应的 Provider 定义 */
  private findProviderDef(token: InjectionToken): Provider | undefined {
    for (const mod of this.modules.values()) {
      for (const def of mod.providerDefs) {
        if (getProviderToken(def) === token) return def;
      }
    }
    return undefined;
  }

  /** 全局查找（不校验可见性），用于 `app.get()` */
  lookupGlobal(token: InjectionToken): InstanceWrapper | undefined {
    for (const mod of this.modules.values()) {
      const w = mod.providers.get(token);
      if (w) return w;
    }
    return undefined;
  }

  async resolveToken(token: InjectionToken, moduleRef?: ModuleRef, contextId?: ContextId): Promise<unknown> {
    if (moduleRef) return this.injector.resolveFromModule(token, moduleRef, contextId);
    const wrapper = this.lookupGlobal(token);
    if (!wrapper) throw new UnknownTokenError(token);
    return wrapper.resolve(contextId);
  }

  /**
   * 释放某个上下文在所有 Provider 上的请求级实例。
   *
   * 请求结束时必须调用，否则 `Map<ContextId, instance>` 会无限增长。
   * 返回被清理的实例数量。
   */
  clearRequestContext(contextId: ContextId): number {
    let cleared = 0;
    for (const mod of this.modules.values()) {
      for (const wrapper of mod.providers.values()) {
        if (wrapper.clearContext(contextId)) cleared++;
      }
    }
    return cleared;
  }

  /** 是否声明过 REQUEST 作用域的 Provider（用于决定是否需要在请求内重新解析） */
  hasRequestScopedProviders(): boolean {
    for (const mod of this.modules.values()) {
      for (const wrapper of mod.providers.values()) {
        if (wrapper.scope === Scope.REQUEST) return true;
      }
    }
    return false;
  }

  getInjector(): Injector {
    return this.injector;
  }

  lock(): void {
    this.locked = true;
  }

  /** 调试用：打印已注册模块树 */
  toString(): string {
    return [...this.modules.values()].map((m) => `- ${m.name} (providers: ${m.providers.size})`).join('\n');
  }
}

class UnknownTokenError extends Error {
  constructor(token: InjectionToken) {
    super(`No provider found for token \`${tokenToString(token)}\` in the whole container.`);
    this.name = 'UnknownTokenError';
  }
}
