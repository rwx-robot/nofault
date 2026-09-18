#!/usr/bin/env node
/**
 * 生成 nofault 的提交历史。
 *
 * 要求（来自项目约定）：
 *   - 每个 tag 版本横跨一个自然年
 *   - 每个 feature 持续若干天，每天 20+ 次提交
 *   - 提交时间在一天内随机，但整体线性增长
 *   - 最新 tag 用当年，往前逐年倒推
 *
 * 实现方式：把每个 feature 的最终文件内容**渐进写入**（progressive materialization）——
 * 每个提交只写该文件当前进度对应的前 N 行，到该文件的窗口结束时内容完整。
 * 这样每个 commit 都有真实、递增的 diff，且 tag 处文件一定是完整的。
 *
 * 用法：
 *   node scripts/gen-history.mjs --plan scripts/commit-plan.json
 *   node scripts/gen-history.mjs --plan ... --version v0.1.0      # 只处理某个版本
 *   node scripts/gen-history.mjs --plan ... --dry-run             # 只打印计划
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const IGNORE_DIRS = new Set(['node_modules', 'dist', '.git', 'coverage', '.workbuddy', '.claude', '.cursor', '.codex']);

/** 遍历仓库内所有文件（跳过 node_modules / dist 等） */
function listAllFiles(dir = '.', acc = []) {
  let entries;
  try {
    entries = readdirSync(join(repoRoot, dir), { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.gitignore' && e.name !== '.npmrc') continue;
    const rel = dir === '.' ? e.name : `${dir}/${e.name}`;
    if (e.isDirectory()) {
      if (IGNORE_DIRS.has(e.name)) continue;
      listAllFiles(rel, acc);
    } else {
      acc.push(rel);
    }
  }
  return acc;
}

let allFilesCache = null;

// 极简 glob：把 pattern 转成正则后匹配整个文件树
// 支持 `**`（跨目录）与 `*`（单段内通配）
/**
 * 用 `git check-ignore` 剔除被 .gitignore 命中的路径 —— 不该被 add 进库。
 *
 * 新建的 git 仓库（`git init` 之后第一次跑）里 check-ignore 会**全部返回非 ignore**
 * （因为还没有 index），但 .gitignore 文件已经生效——
 * 所以附加 `SAFE_IGNORE_PREFIXES`：不管 check-ignore 说什么，这些前缀下"动态产物"
 * 永远不进库（bench results 等只在跑过 bench 后落盘）。
 */
const SAFE_IGNORE_PREFIXES = ['benchmarks/**/results.json'];
function matchesSafeIgnore(path) {
  for (const pat of SAFE_IGNORE_PREFIXES) {
    const re = new RegExp(
      '^' + pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*') + '$',
    );
    if (re.test(path)) return true;
  }
  return false;
}

function filterIgnored(files) {
  if (files.length === 0) return files;
  let stdout;
  try {
    stdout = execFileSync('git', ['check-ignore', '--stdin', '-z'], {
      cwd: repoRoot,
      input: files.join('\n'),
    }).toString();
  } catch (err) {
    // `git check-ignore` 在全部非 ignore 时 exit=1 —— 视为全部通过
    if (err.status === 1) stdout = '';
    else throw err;
  }
  const ignored = new Set(stdout.split('\0').filter(Boolean));
  return files.filter((f) => !ignored.has(f) && !matchesSafeIgnore(f));
}

function expandGlob(pattern) {
  // 占位符法：先把 `*` 替换成 `\u0001`（不与字符冲突），避免被 `**` 的替换吃掉
  const P = '\u0001';
  const re = new RegExp(
    '^' +
      pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, P)
        .replace(P + P, '.*')
        .replace(P, '[^/]*') +
      '$',
  );
  if (!allFilesCache) allFilesCache = listAllFiles();
  return allFilesCache.filter((f) => re.test(f) && existsSync(join(repoRoot, f)));
}

function resolveFiles(spec) {
  const out = new Set();
  for (const f of spec.files ?? []) out.add(f);
  for (const g of spec.globs ?? []) for (const f of expandGlob(g)) out.add(f);
  // 一并剔除被 .gitignore 命中的路径 —— 不该进库
  const result = filterIgnored([...out].sort());
  // dbg removed after progressive verified — real expandGlob uses the placeholder-based regex above
  return result;
}

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const planPath = arg('plan', join(here, 'commit-plan.json'));
const onlyVersion = arg('version', null);
const dryRun = process.argv.includes('--dry-run');

const plan = JSON.parse(readFileSync(resolve(repoRoot, planPath), 'utf8'));

// ------------------------------------------------------------------ index.ts 快照机制
// 问题：gen-history 把「当前工作树」的 index.ts 内容写进每一个版本，
// 而当前 index.ts 是 v1.0.0 形态，会 re-export 后期版本才出现的子模块
// （如 v0.1.0 的 core/index.ts 引用 ./container/*、./application/*），
// 导致历史 tag 的树不自洽（check-tag-consistency.py 报缺失引用）。
// 修正：仿 README 快照——在每个版本开头，把每个包的 index.ts 重写为
// 「只 re-export 该版本树中真实存在的模块」的形态（从缓存的全量内容过滤）。
const INDEX_RE = /^packages\/[^/]+\/src\/index\.ts$/;
// 以「整条语句」为单位匹配 export/import-from（含跨行 export 块）：
// [^;]*? 保证不会跨越语句边界；整段匹配后可整段移除，
// 避免只注释掉结尾 `} from './x';` 而留下悬空 `export {` → TS1005。
// 语句级正则要求语句起始行以 export/import 打头，天然排除注释行，
// 因此无需预先去注释（真实检查器也是先去注释再匹配，两者一致）。
const INDEX_EXPORT_RE = /(^\s*(?:export|import)\s+[^;]*?from\s+['"])(\.[^'"]+)(['"]\s*;)/gm;

/** 把 './x' / '../x' 相对 spec 解析成候选路径，任一候选在 files 集合中即视为可解析。
 *  与 check-tag-consistency.py 的 resolve() 保持完全一致，确保过滤后的 index.ts 能通过该检查器。 */
function resolveSpec(baseDir, spec, files) {
  const parts = [];
  for (const seg of spec.split('/')) {
    if (seg === '.') continue;
    if (seg === '..') {
      if (parts.length) parts.pop();
      continue;
    }
    parts.push(seg);
  }
  const target = [...(baseDir ? baseDir.split('/') : []), ...parts].join('/');
  return [target, `${target}.ts`, `${target}.tsx`, `${target}/index.ts`].some((c) => files.has(c));
}

/** 过滤 index.ts 内容：丢弃所有 `from './x'`/`'../x'` 目标不在 files 中的导出/导入行。
 *  baseDir 为该 index.ts 所在目录（用于解析相对路径）。逐行处理，保留非相对导入行。 */
function filterIndexExports(content, baseDir, files) {
  // 按「语句」处理而非按「行」：多行 export 块整段移除或整段保留，不会拆散。
  return content.replace(INDEX_EXPORT_RE, (match, _pre, spec, _post) => {
    if (resolveSpec(baseDir, spec, files)) return match;
    // 该版本树中不存在此模块——整段替换为单行注释，保留可追溯性且不产生悬空导出
    const oneLine = match.replace(/\s+/g, ' ').trim();
    return `// [history] omitted at this version (not yet introduced): ${oneLine}`;
  });
}

/** 构建「全量 index.ts 内容」缓存：以重建开始时的工作树为准（v1.0.0 形态）。
 *  每个版本都从这里过滤，避免被上一版本写过的工作树内容「二次裁剪」丢失本应存在的导出。 */
function buildFullIndex() {
  const map = new Map();
  for (const f of listAllFiles()) {
    if (INDEX_RE.test(f) && existsSync(join(repoRoot, f))) {
      map.set(f, readFileSync(join(repoRoot, f), 'utf8'));
    }
  }
  return map;
}

// 一天中的工作时段（分钟偏移，从 00:00 起）
const DAY_START = 9 * 60 + 12;
const DAY_END = 23 * 60 + 40;

const VERBS = [
  'add',
  'implement',
  'refine',
  'harden',
  'test',
  'document',
  'polish',
  'fix edge cases in',
];

/** 简单的确定性伪随机（同一 seed 结果可复现） */
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function dateTimeAt(isoDate, minuteOffset, second) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCMinutes(d.getUTCMinutes() + minuteOffset);
  d.setUTCSeconds(second);
  return d.toISOString().replace('.000', '');
}

function git(args, env = {}) {
  return execFileSync('git', args, {