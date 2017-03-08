import { REST_METADATA, getControllerPath, getRoutes } from './metadata';
import { joinPath } from './metadata';
import { RouteTable } from './router/route-tree';
import type { Middleware } from './pipeline';
import { MissingContextIdError } from '@nofault/core';
import type { Type } from '@nofault/core';
import type { NofaultApplicationContext } from '@nofault/core';

export type MiddlewareRegistry = Record<string, Middleware>;

export interface ResolvedRoute {