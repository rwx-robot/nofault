import { AsyncLocalStorage } from 'node:async_hooks';
import { RequestContext } from './request-context';
import type { RequestContextInit } from './request-context';

/**
 * 上下文存储：基于 `AsyncLocalStorage`。
 *