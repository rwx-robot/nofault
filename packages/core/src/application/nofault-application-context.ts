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
}

function hasHook<T>(obj: unknown, key: string): obj is T {
  return typeof (obj as Record<string, unknown>)?.[key] === 'function';
}

/**
 * 应用上下文：负责模块扫描、实例化、生命周期编排。
 *
 * 按依赖顺序编排启动与停机，用 Node 生态惯用的 IoC 语义表达。
 */
export class NofaultApplicationContext {
  protected readonly container = new NofaultContainer();
  protected rootRef!: ModuleRef;
  private initialized = false;
  private closed = false;

  constructor(protected readonly options: ApplicationContextOptions = {}) {}

  /** 扫描模块图 + 实例化 Provider + 触发生命周期钩子 */
  async init(root: Type<unknown> | DynamicModule): Promise<this> {
    const scanner = new ModuleScanner(this.container);
    this.rootRef = await scanner.scan(root);