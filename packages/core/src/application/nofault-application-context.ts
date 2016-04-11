import { NofaultContainer } from '../container/container';
import { ModuleScanner } from '../container/scanner';
import type { ModuleRef } from '../container/module-ref';
import type { DynamicModule } from '../interfaces/module.interface';
import { Scope } from '../interfaces/type.interface';
import type {
  BeforeApplicationShutdown,
  InjectionToken,
  OnApplicationBootstrap,
  OnApplicationShutdown,
  OnModuleDestroy,
  OnModuleInit,