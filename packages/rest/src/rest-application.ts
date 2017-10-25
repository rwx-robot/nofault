import type { IncomingMessage, ServerResponse } from 'node:http';
import { createHttpApplication } from '@nofault/http';
import type { NofaultApplication } from '@nofault/core';
import type { DynamicModule, Type } from '@nofault/core';
import { RequestContext, requestContextStore } from '@nofault/context';
import type { RequestContextStore } from '@nofault/context';
import { parseTraceparent } from '@nofault/context';
import { createLogger, type Logger } from '@nofault/logger';
import { RestContext, RestRequest, RestResponse } from './http/context';
import { MethodNotAllowedException, NotFoundException, isHttpException } from './errors/http-exception';
import {
  composeMiddleware,
  resolveHandlerArgs,
  validateDtoIfDeclared,
  normalizeError,