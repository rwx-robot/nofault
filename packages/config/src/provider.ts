import { watch, type FSWatcher } from 'node:fs';
import { existsSync, readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { parse as parseYamlDocument } from 'yaml';
import { applyEnvOverrides, parseDotEnv, type PlainObject } from './loader';

/**
 * 配置源：配置的**来源**抽象。
 *
 * 有了这一层，文件、环境变量、etcd/consul/nacos 都是同一种东西，
 * 热更新也就不必为每个来源各写一遍。
 */
export interface ConfigSource {
  readonly name: string;
  /** 拉取一次配置 */