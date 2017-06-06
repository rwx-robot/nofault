import { RequestContext, requestContextStore } from '@nofault/context';
import type { RequestContextStore } from '@nofault/context';
import { parseTraceparent } from '@nofault/context';
import type { Middleware } from '../pipeline';

export interface RequestContextOptions {
  /** 自定义 store；默认用全局的 `requestContextStore` */
  store?: RequestContextStore;
  /** 是否把 requestId 写进响应头，默认 true */
  exposeRequestId?: boolean;