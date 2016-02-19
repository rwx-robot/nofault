/**
 * 基础类型定义 —— 遵循 TypeScript / NestJS 生态习惯（createXxx 工厂、camelCase 导出）。
 */

/** 具体类（可实例化的构造函数） */
export interface Type<T = unknown> extends Function {
  new (...args: never[]): T;
}
