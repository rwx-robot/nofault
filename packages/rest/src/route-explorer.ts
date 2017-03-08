import { REST_METADATA, getControllerPath, getRoutes } from './metadata';
import { joinPath } from './metadata';
import { RouteTable } from './router/route-tree';
import type { Middleware } from './pipeline';
import { MissingContextIdError } from '@nofault/core';
import type { Type } from '@nofault/core';