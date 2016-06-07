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
 * （双下划线表示层级，单下划线表示键内下划线）
 */
export function applyEnvOverrides(config: PlainObject, prefix: string, source: NodeJS.ProcessEnv = process.env): PlainObject {
  const normalizedPrefix = prefix.toUpperCase();
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;
    if (normalizedPrefix && !key.toUpperCase().startsWith(normalizedPrefix)) continue;
    const pathKey = normalizedPrefix ? key.slice(normalizedPrefix.length) : key;
    /**
     * 映射规则（与注释一致）：
     * - 双下划线 `__` 表示层级分隔：`SERVER__PORT` → `server.port`
     * - 单下划线是键名的一部分：`MAX_IDLE` → `max_idle`
     */
    const segments = pathKey.toLowerCase().split('__').filter(Boolean);
    if (segments.length === 0) continue;
    setDeep(config, segments, coerce(value));
  }
  return config;
}

function setDeep(target: PlainObject, segments: string[], value: unknown): void {
  let cursor: PlainObject = target;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i]!;
    const next = cursor[seg];
    if (typeof next !== 'object' || next === null || Array.isArray(next)) {
      cursor[seg] = {};
    }
    cursor = cursor[seg] as PlainObject;
  }
  cursor[segments[segments.length - 1]!] = value;
}

function coerce(v: string): unknown {
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v !== '' && !Number.isNaN(Number(v))) return Number(v);
  return v;
}
