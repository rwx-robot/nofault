import { Module } from '@nofault/core';
import { ConfigModule } from '@nofault/config';
import { resolve } from 'node:path';
import { RuntimeController } from './runtime.controller';
import { RequestScopeService } from './request-scope.service';

/**
 * 根模块。
 *