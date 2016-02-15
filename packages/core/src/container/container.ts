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
