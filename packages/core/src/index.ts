/**
 * @nofault/core —— 内核：IoC 容器、模块系统、生命周期。
 *
 * 规范：遵循 Node.js / NestJS 生态约定（装饰器 + 元数据反射），
 * 工厂用 `createXxx()`，导出用 camelCase。
 */

// 反射元数据必须在任何装饰器之前加载
import 'reflect-metadata';
// [history] omitted at this version (not yet introduced): export * from './interfaces/type.interface';