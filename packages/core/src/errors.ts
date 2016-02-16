import type { InjectionToken } from './interfaces/type.interface';
import { tokenToString } from './interfaces/type.interface';

/** 依赖解析失败 */
export class UnknownDependencyError extends Error {
  constructor(token: InjectionToken, context?: string) {
    const where = context ? ` in ${context}` : '';