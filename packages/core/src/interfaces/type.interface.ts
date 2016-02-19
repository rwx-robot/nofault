/**
 * 基础类型定义 —— 遵循 TypeScript / NestJS 生态习惯（createXxx 工厂、camelCase 导出）。
 */

/** 具体类（可实例化的构造函数） */
export interface Type<T = unknown> extends Function {
  new (...args: never[]): T;
}

/** 抽象类 / 接口式注入令牌 */
export interface AbstractType<T = unknown> extends Function {
  prototype: T;
}

/** 任意可作为依赖令牌的值 */
export type InjectionToken<T = unknown> = string | symbol | Type<T> | AbstractType<T>;

/** Provider 作用域 */
export enum Scope {
  /** 单例：整个应用生命周期内只创建一次（默认） */
  SINGLETON = 'singleton',
  /** 瞬时：每次解析都创建新实例 */
  TRANSIENT = 'transient',
  /** 请求级：在同一请求上下文中复用（v0.3.0 引入 RequestContext 后启用） */
  REQUEST = 'request',
}

/** 生命周期钩子接口 */
export interface OnModuleInit {
  onModuleInit(): void | Promise<void>;
}

export interface OnApplicationBootstrap {
  onApplicationBootstrap(): void | Promise<void>;
}

export interface OnModuleDestroy {
  onModuleDestroy(): void | Promise<void>;
}

export interface BeforeApplicationShutdown {
  beforeApplicationShutdown(signal?: string): void | Promise<void>;
}

export interface OnApplicationShutdown {
  onApplicationShutdown(signal?: string): void | Promise<void>;
}

export interface NofaultApplicationContext {