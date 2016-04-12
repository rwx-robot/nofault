import type { DynamicModule } from '../interfaces/module.interface';
import type { InjectionToken, Type } from '../interfaces/type.interface';
import type { HttpAdapter } from './http-adapter.interface';
import type { ApplicationContextOptions } from './nofault-application-context';
import { NofaultApplicationContext } from './nofault-application-context';

export interface NofaultApplicationOptions extends ApplicationContextOptions {
  /** HTTP 适配器；未指定时尝试从 `@nofault/http` 自动加载 */
  httpAdapter?: HttpAdapter;
  /** 优雅退出超时（毫秒），超过后强制关闭 */