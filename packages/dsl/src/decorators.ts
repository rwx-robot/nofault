import 'reflect-metadata';
import { FieldSource } from './spec';

/**
 * 契约文件用的装饰器。
 *
 * 两条使用路径都支持：
 * 1. **静态解析**（推荐）：`@nofault/parser` 读源码，不执行用户代码
 * 2. **运行时读取**：装饰器同时把元信息写进 `reflect-metadata`，可用于自省与测试
 */

const M = {
  API: 'nofault:dsl:api',
  SERVICE: 'nofault:dsl:service',
  ROUTE: 'nofault:dsl:routes',
  FIELDS: 'nofault:dsl:fields',
} as const;

export interface ServiceMeta {
  name?: string;
  prefix?: string;
  group?: string;
  jwt?: string;
  middleware?: string[];
  timeout?: string;
  maxBytes?: number;
}

export interface RouteMeta {
  method: string;
  path: string;
  handler?: string;
}

export interface FieldMeta {
  name: string;
  key?: string;
  source: FieldSource;
  rules: string[];
  optional: boolean;
}

function mergeService(target: object, patch: ServiceMeta): void {
  const cur: ServiceMeta = Reflect.getMetadata(M.SERVICE, target.constructor) ?? {};
  Reflect.defineMetadata(M.SERVICE, { ...cur, ...patch }, target.constructor);
}

// ------------------------------------------------------------------ 服务级

export function Api(name: string): ClassDecorator {
  return (target) => mergeService(target, { name });
}
export function Prefix(prefix: string): ClassDecorator {
  return (target) => mergeService(target, { prefix });
}
export function Group(group: string): ClassDecorator {
  return (target) => mergeService(target, { group });