import { existsSync, readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { parse as parseYamlDocument } from 'yaml';

export type PlainObject = Record<string, unknown>;

/**
 * 配置文件加载：JSON / YAML / .env。
 *
 * 遵循 12-factor：文件提供默认值，环境变量优先覆盖。
 */

export function loadConfigFile(filePath: string): PlainObject {
  if (!existsSync(filePath)) {
    throw new Error(`Config file not found: ${filePath}`);
  }
  const raw = readFileSync(filePath, 'utf8');
  const ext = extname(filePath).toLowerCase();

  switch (ext) {
    case '.json':
      return JSON.parse(raw) as PlainObject;
    case '.yaml':
    case '.yml':
      return (parseYamlDocument(raw) ?? {}) as PlainObject;
    case '.env':
      return parseDotEnv(raw);
    default:
      // 无扩展名时按内容嗅探
      return raw.trimStart().startsWith('{') ? (JSON.parse(raw) as PlainObject) : ((parseYamlDocument(raw) ?? {}) as PlainObject);