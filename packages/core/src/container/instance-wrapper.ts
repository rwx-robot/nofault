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
 * 2. 按作用域缓存实例：单例全局一份 / 请求级每 contextId 一份 / 瞬时每次新建
 * 3. 记录依赖是否解析完成，用于循环依赖检测
 */
export class InstanceWrapper<T = unknown> {
  /** 单例缓存；非单例为 undefined */
  private instance?: T;
  /** 解析中的 Promise，避免并发重复创建 */
  private pending?: Promise<T>;
  /** REQUEST 作用域：每个上下文一份实例 */
  private readonly contextInstances = new Map<ContextId, T>();
  /** 是否已完成实例化（用于生命周期钩子去重） */
  public isResolved = false;
  /** 所属模块名，便于报错定位 */
  public hostModule?: string;
  /** 解析栈标记：true 表示正在解析中，用于循环依赖检测 */
  public isResolving = false;
  /**
   * 是否"被 REQUEST 作用域污染"（captive dependency）。
   *
   * 典型场景：单例 Controller 依赖了 REQUEST 作用域的 Service。
   * 若不标记，这个单例会被缓存下来，于是**所有请求共用第一个请求的对象**——
   * 数据串号，且极难排查。标记后按上下文缓存，语义才正确。
   */
  public contextDependent = false;

  constructor(
    public readonly token: InjectionToken<T>,
    public readonly scope: Scope,
    /**
     * 创建实例的工厂。
     *
     * 必须接收 contextId：Provider 的依赖里可能有 REQUEST 作用域的成员，
     * 若工厂闭包把 contextId 固定成 undefined，请求上下文就传不下去了。
     */
    private readonly factory: (contextId?: ContextId) => T | Promise<T>,
    public readonly isAsync = false,
  ) {}

  get hasInstance(): boolean {
    return this.instance !== undefined;
  }

  /**
   * 获取（或创建）实例。
   *
   * @param contextId REQUEST 作用域必需；其它作用域忽略
   */
  async resolve(contextId?: ContextId): Promise<T> {
    if (this.scope === Scope.REQUEST || this.contextDependent) {
      if (contextId === undefined) {
        throw new MissingContextIdError(this.token);
      }
      const cached = this.contextInstances.get(contextId);
      if (cached !== undefined) return cached;
      const created = await this.factory(contextId);
      this.contextInstances.set(contextId, created);
      return created;
    }

    if (this.scope === Scope.SINGLETON) {
      if (this.instance !== undefined) return this.instance;
      if (this.pending !== undefined) return this.pending;

      const creating = (async () => {
        const value = await this.factory(contextId);
        this.instance = value;
        this.isResolved = true;
        this.pending = undefined;
        return value;
      })();
      this.pending = creating;

      try {
        return await creating;
      } catch (err) {
        // 关键：失败**不能**缓存。
        // 否则第一次解析失败后，后续每次请求都会拿到同一个 rejected promise，
        // 表现为"错误被永久记住"——这是最难排查的一类 bug。
        this.pending = undefined;
        throw err;
      }
    }