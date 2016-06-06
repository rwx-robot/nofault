import { Global, Module } from '@nofault/core';
import type { DynamicModule, ValueProvider } from '@nofault/core';
import { ConfigService, createConfigService } from './config.service';
import { buildRegistry } from './registry';
import type { ConfigSource } from './provider';
import { applyEnvOverrides, loadConfigFile, type PlainObject } from './loader';

export interface ConfigModuleOptions {
  /** 配置文件路径（json/yaml/env） */
  path?: string;
  /** 直接内联的配置对象 */
  values?: PlainObject;
  /** 额外配置源（远程配置中心等）；合并时后者覆盖前者 */
  sources?: ConfigSource[];
  /** 环境变量前缀，默认 `NOFAULT_` */