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
  Type,
} from '../interfaces/type.interface';
import { tokenToString } from '../interfaces/type.interface';
import type { ContextId } from '../container/instance-wrapper';

export interface ApplicationContextOptions {
  /** 关闭时不打印日志（测试用） */
  quiet?: boolean;
  /** 应用名称 */
  name?: string;
  /** 日志输出函数 */
  logger?: { info(msg: string): void; error(msg: string): void };