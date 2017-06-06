import { RequestContext, requestContextStore } from '@nofault/context';
import type { RequestContextStore } from '@nofault/context';
import { parseTraceparent } from '@nofault/context';
import type { Middleware } from '../pipeline';

export interface RequestContextOptions {
  /** 自定义 store；默认用全局的 `requestContextStore` */