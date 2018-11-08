import { Module } from '@nofault/core';
import { ConfigModule } from '@nofault/config';
import { resolve } from 'node:path';
import { RuntimeController } from './runtime.controller';
import { RequestScopeService } from './request-scope.service';

/**
 * 根模块。
 *
 * 注意这里用的是 `ConfigModule.forRootAsync(...)`：
 * 内核的模块扫描器会 `await` 动态模块，所以能先完成首次加载再继续启动，
 * 从而支持 `watch: true` 的热更新。
 */
@Module({
  imports: [
    ConfigModule.forRootAsync({
      path: process.env.NOFAULT_CONFIG_PATH ?? resolve(__dirname, '../config/app.yaml'),