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
}
export function Jwt(scheme: string): ClassDecorator {
  return (target) => mergeService(target, { jwt: scheme });
}
export function Middleware(...names: string[]): ClassDecorator {
  return (target) => mergeService(target, { middleware: names });
}
export function Timeout(value: string): ClassDecorator {
  return (target) => mergeService(target, { timeout: value });
}
export function MaxBytes(bytes: number): ClassDecorator {
  return (target) => mergeService(target, { maxBytes: bytes });
}

// ------------------------------------------------------------------ 路由级

function methodDecorator(method: string) {
  return (path: string, handler?: string): MethodDecorator =>
    (target, propertyKey) => {
      const list: RouteMeta[] = Reflect.getMetadata(M.ROUTE, target.constructor) ?? [];
      list.push({ method, path, handler: handler ?? String(propertyKey) });
      Reflect.defineMetadata(M.ROUTE, list, target.constructor);
    };
}

export const Get = methodDecorator('GET');
export const Post = methodDecorator('POST');
export const Put = methodDecorator('PUT');
export const Delete = methodDecorator('DELETE');
export const Patch = methodDecorator('PATCH');
export const Head = methodDecorator('HEAD');
export const Options = methodDecorator('OPTIONS');

/** 显式指定生成的 handler 名（默认取方法名） */
export function Handler(name: string): MethodDecorator {
  return (target, propertyKey) => {
    const list: RouteMeta[] = Reflect.getMetadata(M.ROUTE, target.constructor) ?? [];
    const last = [...list].reverse().find((r) => r.handler === String(propertyKey) || r.handler === undefined);
    if (last) last.handler = name;
    else list.push({ method: 'GET', path: '/', handler: name });
    Reflect.defineMetadata(M.ROUTE, list, target.constructor);
  };
}

// ------------------------------------------------------------------ 字段级

function fieldDecorator(source: FieldSource) {
  return (key?: string): PropertyDecorator =>
    (target, propertyKey) => {
      const ctor = target.constructor;
      const list: FieldMeta[] = Reflect.getMetadata(M.FIELDS, ctor) ?? [];
      list.push({ name: String(propertyKey), key, source, rules: [], optional: false });
      Reflect.defineMetadata(M.FIELDS, list, ctor);
    };
}

export const Body = fieldDecorator(FieldSource.BODY);
export const Path = fieldDecorator(FieldSource.PATH);
export const Query = fieldDecorator(FieldSource.QUERY);
export const Header = fieldDecorator(FieldSource.HEADER);
export const Form = fieldDecorator(FieldSource.FORM);

/** 追加一条校验规则（规则以字符串保存，生成代码时翻译成 Node.js 的写法） */
export function Rule(rule: string): PropertyDecorator {
  return (target, propertyKey) => {
    const ctor = target.constructor;
    const list: FieldMeta[] = Reflect.getMetadata(M.FIELDS, ctor) ?? [];
    const field = [...list].reverse().find((f) => f.name === String(propertyKey));
    if (field) field.rules.push(rule);
    else list.push({ name: String(propertyKey), source: FieldSource.BODY, rules: [rule], optional: false });
    Reflect.defineMetadata(M.FIELDS, list, ctor);
  };
}

export function Optional(): PropertyDecorator {
  return (target, propertyKey) => {
    const ctor = target.constructor;
    const list: FieldMeta[] = Reflect.getMetadata(M.FIELDS, ctor) ?? [];
    const field = [...list].reverse().find((f) => f.name === String(propertyKey));
    if (field) field.optional = true;
    Reflect.defineMetadata(M.FIELDS, list, ctor);
  };
}

// 常用校验规则的语法糖
export const IsString = (): PropertyDecorator => Rule('isString');
export const IsInt = (): PropertyDecorator => Rule('isInt');
export const IsNumber = (): PropertyDecorator => Rule('isNumber');
export const IsEmail = (): PropertyDecorator => Rule('isEmail');
export const IsNotEmpty = (): PropertyDecorator => Rule('isNotEmpty');
export const MinLength = (n: number): PropertyDecorator => Rule(`minLength:${n}`);
export const MaxLength = (n: number): PropertyDecorator => Rule(`maxLength:${n}`);
export const Min = (n: number): PropertyDecorator => Rule(`min:${n}`);
export const Max = (n: number): PropertyDecorator => Rule(`max:${n}`);

// ------------------------------------------------------------------ 读取

export function readServiceMeta(target: Function): ServiceMeta | undefined {
  return Reflect.getMetadata(M.SERVICE, target);
}

export function readRouteMeta(target: Function): RouteMeta[] {
  return Reflect.getMetadata(M.ROUTE, target) ?? [];
}

export function readFieldMeta(target: Function): FieldMeta[] {
  return Reflect.getMetadata(M.FIELDS, target) ?? [];
}

export function isApiService(target: Function): boolean {
  return Reflect.getMetadata(M.API, target) === true || (readServiceMeta(target)?.name !== undefined);
}
