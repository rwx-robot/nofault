import { NofaultApplication, createApplication } from '@nofault/core';
import type { DynamicModule, Type } from '@nofault/core';
import { NodeHttpAdapter } from './node-http-adapter';

export interface HttpApplicationOptions {
  name?: string;