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
function expandGlob(pattern) {
  const re = new RegExp(
    '^' +
      pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*\/?/g, '(?:.*/)?')
        .replace(/\*/g, '[^/]*') +
      '$',
  );
  if (!allFilesCache) allFilesCache = listAllFiles();
  return allFilesCache.filter((f) => re.test(f));
}

function resolveFiles(spec) {
  const out = new Set();
  for (const f of spec.files ?? []) out.add(f);
  for (const g of spec.globs ?? []) for (const f of expandGlob(g)) out.add(f);
  return [...out].sort();
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

  for (const feature of version.features) {
    const days = feature.days ?? 3;
    const perDay = feature.commitsPerDay ?? 22;
    const total = days * perDay;
    const aspects = feature.aspects;
    let files = resolveFiles(feature);
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
        const toAdd = ['-A', '--', ...files.map((f) => f.replace(/^\.\//, ''))];
        git(['add', ...toAdd]);
        const body = feature.body ? `\n\n${feature.body}` : '';
        git(['commit', '-m', message + body, '--allow-empty'], {
          GIT_AUTHOR_DATE: when,
          GIT_COMMITTER_DATE: when,
        });
      }
      totalCommits++;
      if (dryRun && i < 3) console.log(`  [dry] ${when}  ${message}`);
    }

    // feature 结束后确保所有文件写入完整内容（兜底，防止窗口计算导致截断）
    if (!dryRun) {
      for (let j = 0; j < files.length; j++) {
        if (fileLines[j].length === 0) continue;
        writeFileSync(join(repoRoot, files[j]), fileLines[j].join('\n'));
      }
      git(['add', ...files]);
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
    git(['add', '-A']);
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
