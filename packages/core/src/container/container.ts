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