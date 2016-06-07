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
  }
}

/** 解析 .env 文件 */
export function parseDotEnv(raw: string): PlainObject {
  const out: PlainObject = {};
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (t === '' || t.startsWith('#')) continue;
    const idx = t.indexOf('=');
    if (idx === -1) continue;
    out[t.slice(0, idx).trim()] = t.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

/**
 * 用环境变量覆盖配置。
 *
 * 映射规则：`NOFAULT_SERVER__PORT=8080` → `server.port = 8080`