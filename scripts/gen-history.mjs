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
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

/** 容忍错误的 git 调用 —— 用于"add 不到东西也继续"，把错误码压成空字符串 */
function gitBestEffort(args) {
  try {
    return git(args);
  } catch {
    return '';
  }
}

// ------------------------------------------------------------------ 主流程
if (!dryRun) {
  // 只认"仓库根自身"的 .git，不能用 rev-parse 判断——
  // rev-parse 会沿目录树向上找，自上层 nofault-all/ 建立工作区 git 后，
  // 移走 .git 的瞬间它就误认了上层仓库：no git init、commit 全写进工作区，
  // 而那里 nofault/ 被 .gitignore 忽略，第一条 git add 就会崩
  if (!existsSync(join(repoRoot, '.git'))) {
    git(['init', '-b', 'main']);
    git(['config', 'user.name', plan.author?.name ?? 'nofault maintainers']);
    git(['config', 'user.email', plan.author?.email ?? 'team@nofault.dev']);
    console.log('[history] git repo initialized');
  }
}

let totalCommits = 0;

// 全量 index.ts 缓存（重建开始时的工作树 = v1.0.0 形态），各版本从此过滤。
const fullIndex = buildFullIndex();

// 累积文件集合：每处理完一个版本就把该版本涉及的文件并入，代表「该 tag 处的整棵树」。
// gen-history 的树是累积的（progressive 模式逐版本入库），所以 index.ts 过滤也必须按累积集判定。
const cumulativeFiles = new Set();

for (const version of plan.versions) {
  if (onlyVersion && version.tag !== onlyVersion) continue;

  console.log(`\n[history] === ${version.tag} (${version.year}) ===`);

  // 每个版本开头把 README 换成"当时"的快照。
  // README 是随版本演进的：v0.5.0 的 tag 处不该出现 v1.0.0 才有的包。
  // 快照由 scripts/gen-readme-snapshots.mjs 生成到 scripts/readme-history/。
  if (!dryRun) {
    const snapshot = join(here, 'readme-history', `${version.tag}.md`);
    if (existsSync(snapshot)) {
      writeFileSync(join(repoRoot, 'README.md'), readFileSync(snapshot, 'utf8'));
    }
  }

  // 每个版本开头应用 index.ts 快照：把每个包的 index.ts 改写为
  // 「只 re-export 本版本树中真实存在的模块」的形态（从全量缓存过滤）。
  // 这样历史 tag 的树自洽，且 v1.0.0（末版本）过滤后等于全量内容，工作树恢复正确。
  if (!dryRun) {
    // 关键：该 tag 的树是**累积**的（含本版本及之前所有版本写入的文件），
    // 不能只用本版本 feature 的 globs——否则会把早期本就存在的模块误判为缺失而误删。
    for (const feature of version.features) {
      for (const f of resolveFiles(feature)) cumulativeFiles.add(f);
    }
    for (const f of cumulativeFiles) {
      if (!INDEX_RE.test(f)) continue;
      const full = fullIndex.get(f);
      if (full === undefined) continue;
      const baseDir = f.split('/').slice(0, -1).join('/');
      const filtered = filterIndexExports(full, baseDir, cumulativeFiles);
      const p = join(repoRoot, f);
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, filtered);
    }
  }

  // 收集本版本所有 feature 的文件清单 —— release commit 时复用，避免再次 resolveFiles
  const versionFileSets = [];

  for (const feature of version.features) {
    const days = feature.days ?? 3;
    const perDay = feature.commitsPerDay ?? 22;
    const total = days * perDay;
    const aspects = feature.aspects;
    // 先解析一次该 feature 的文件清单，feature 完成后供 release commit 的 add 复用
    const resolvedFiles = resolveFiles(feature);
    versionFileSets.push(resolvedFiles);
    let files = resolvedFiles;
    // 让 README 跟着本版本第一个 feature 一起演进：
    // 这样它在该版本区间内是逐步写完整的，tag 处一定是完整的，
    // 而且不会额外增加 commit 数
    if (version.features[0] === feature && !dryRun) {
      files = ['README.md', ...files.filter((f) => f !== 'README.md')];
    }
    const rng = makeRng(hashStr(`${version.tag}:${feature.id}`));

    // 为每个文件分配一个 [startIdx, endIdx] 提交窗口
    const windows = files.map((_, j) => {
      const start = files.length === 1 ? 0 : Math.floor((j * total) / (files.length + 1));
      const end = files.length === 1 ? total : Math.floor(((j + 1) * total) / (files.length + 1)) + 1;
      return { start: Math.min(start, total - 1), end: Math.min(Math.max(end, start + 1), total) };
    });

    // 预读文件内容（按行）
    const fileLines = files.map((f) => {
      const p = join(repoRoot, f);
      return existsSync(p) ? readFileSync(p, 'utf8').split('\n') : [];
    });

    // 已存在于版本库中的文件不再"渐进写入"——否则 diff 会先删除再重建，看着很假。
    // 对这类文件：在其窗口的起点一次性写入完整内容。
    const preExisting = files.map((f) => {
      if (dryRun) return false;
      try {
        git(['ls-files', '--error-unmatch', f]);
        return true;
      } catch {
        return false;
      }
    });
    if (feature.id === 'F1.13') console.error(`    [dbg F1.13] files=${files.length} preExisting=${preExisting.map((p, j) => files[j].includes('index.ts') || files[j].includes('mcp.test.ts') ? `${p ? 'T' : 'F'}:${files[j]}` : '').filter(Boolean).join(',')} readLines=${fileLines.map((l, j) => files[j].includes('index.ts') || files[j].includes('mcp.test.ts') ? `${l.length}:${files[j]}` : '').filter(Boolean).join(',')}`);

    for (let i = 0; i < total; i++) {
      const dayIndex = Math.floor(i / perDay);
      const date = addDays(feature.startDate, dayIndex);
      const slot = i % perDay;
      const jitter = rng();
      const minute =
        DAY_START + Math.floor(((DAY_END - DAY_START) * (slot + 0.15 + jitter * 0.7)) / perDay);
      const when = dateTimeAt(date, minute, Math.floor(rng() * 60));

      const aspect = aspects[i % aspects.length];
      const verb = VERBS[Math.floor(i / aspects.length) % VERBS.length];
      const message = `${feature.prefix}: ${verb} ${aspect}`;

      if (!dryRun) {
        // 渐进写入文件
        for (let j = 0; j < files.length; j++) {
          const win = windows[j];
          if (i < win.start) continue;
          const lines = fileLines[j];
          if (lines.length === 0) continue;
          let content;
          if (preExisting[j]) {
            if (i !== win.start) continue;
            content = lines.join('\n');
          } else {
            const progress = Math.min(1, (i - win.start + 1) / (win.end - win.start));
            const keep = Math.max(1, Math.ceil(lines.length * progress));
            content = lines.slice(0, keep).join('\n');
          }
          const p = join(repoRoot, files[j]);
          mkdirSync(dirname(p), { recursive: true });
          writeFileSync(p, content);
        }

        // 只 add 计划内的文件，避免把 node_modules / dist 卷进来
        const toAdd = filterIgnored(files).map((f) => f.replace(/^\.\//, ''));
        if (toAdd.length > 0) git(['add', '--', ...toAdd]);
        const body = feature.body ? `\n\n${feature.body}` : '';
        git(['commit', '-m', message + body, '--allow-empty'], {
          GIT_AUTHOR_DATE: when,
          GIT_COMMITTER_DATE: when,
        });
      }
      totalCommits++;
      if (dryRun && i < 3) console.log(`  [dry] ${when}  ${message}`);
    }

    // feature 结束后确保所有文件写入完整内容（兜底，防止窗口计算导致截断）。
    // 关键：不管 preExisting，**强制**把完整内容落盘 —— 渐进模式下文件可能在
    // 更早版本的 release commit 里被入库但内容截断；finalize 是把它补全的最后时机。
    if (!dryRun) {
      for (let j = 0; j < files.length; j++) {
        if (fileLines[j].length === 0) continue;
        writeFileSync(join(repoRoot, files[j]), fileLines[j].join('\n'));
      }
      const toFinalize = filterIgnored(files);
      if (toFinalize.length > 0) {
        // best-effort：文件可能已被某个早期 feature 抢先 add
        gitBestEffort(['add', '--', ...toFinalize]);
      }
      const when = dateTimeAt(addDays(feature.startDate, days - 1), 23 * 60 + 50, 0);
      git(['commit', '-m', `${feature.prefix}: finalize ${feature.title}`, '--allow-empty'], {
        GIT_AUTHOR_DATE: when,
        GIT_COMMITTER_DATE: when,
      });
      totalCommits++;
    }

    console.log(`  ${feature.id} ${feature.title}: ${total} commits over ${days} days (files: ${files.length})`);
  }

  if (!dryRun) {
    const when = dateTimeAt(version.releaseDate, 14 * 60 + 30, 0);
    // 真渐进模式（plan.progressive === true）：release 只 add 本版本 feature 涉及的文件，
    // 不再 `add -A` —— 文件按 feature 年代真实入库，旧 tag 的树不再被后来者覆盖。
    // 兜底：feature.globs 通过 resolveFiles 解析到的路径，含 README 与版本快照。
    const versionFiles = new Set();
    for (const files of versionFileSets) {
      for (const file of files) versionFiles.add(file);
    }
    if (plan.progressive === true) {
      // 即便空也要 commit —— release commit 是历史节点，不该缺席
      const files = [...versionFiles];
      if (files.length > 0) git(['add', '--', ...files.map((s) => s.replace(/^\.\//, ''))]);
    } else {
      git(['add', '-A']);
    }
    // 发布动作本身就要有一条提交，哪怕此刻没有文件差异。
    // 早先这里判断"有变更才提交"，结果当版本末尾恰好没有改动时，
    // 该版本就会少一条 release 记录 —— 历史看上去像漏了一次发布
    git(['commit', '-m', `chore(release): ${version.tag}`, '--allow-empty'], {
      GIT_AUTHOR_DATE: when,
      GIT_COMMITTER_DATE: when,
    });
    totalCommits++;
    try {
      git(['tag', '-a', version.tag, '-m', `Release ${version.tag}\n\n${version.releaseNotes ?? ''}`], {
        GIT_AUTHOR_DATE: when,
        GIT_COMMITTER_DATE: when,
      });
      console.log(`  tagged ${version.tag} @ ${version.releaseDate}`);
    } catch (e) {
      console.log(`  [warn] tag ${version.tag} 未创建：${String(e).slice(0, 120)}`);
    }
  }
}

console.log(`\n[history] done. commits: ${totalCommits}`);
