/**
 * `nofaultctl generate api <contract>` —— 契约 → 代码。
 *
 * 链路：`parser → Spec → validate → generate → write`
 *
 * 顺序有讲究：**先校验再生成**。
 * 校验失败时一个文件都不写，否则用户会拿到半套代码，
 * 编译错报指向生成物，而真正要改的是契约。
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ApiSpec } from '@nofault/dsl';
import { generate, generateDataLayer, writeFiles, validateSpec, watchFile } from '@nofault/codegen';
import type { GeneratedFile, WritePolicy } from '@nofault/codegen';
import { parseContractFile } from '@nofault/parser';
import { log, printSummary } from '../log';

export interface GenerateApiOptions {
  /** 契约文件路径 */
  contract: string;
  /** 输出根目录，默认 `src` */
  out?: string;
  /** 模板覆盖目录 */
  templates?: string;
  /** 是否额外生成根模块 */
  rootModule?: boolean;
  /** 覆盖策略，默认 `generated` */
  policy?: WritePolicy;
  /** 只报告，不写盘 */
  dryRun?: boolean;
  /** 额外生成 entity / repository 骨架（数据层） */
  withOrm?: boolean;
  /** 监听契约变化并自动重新生成 */
  watch?: boolean;
  /** 不合格时也继续生成 */
  force?: boolean;
}

export interface GenerateApiResult {
  spec: ApiSpec;
  files: GeneratedFile[];
  written: string[];
  skipped: string[];
  changed: string[];
}

export function compileContract(file: string): ApiSpec {
  if (!existsSync(file)) {
    throw new Error(`contract not found: ${file}`);
  }
  return parseContractFile(file);
}

export function generateFromSpec(
  spec: ApiSpec,
  options: Omit<GenerateApiOptions, 'contract'> = {},
): { files: GeneratedFile[]; warnings: string[] } {
  const diagnostics = validateSpec(spec);
  const errors = diagnostics.filter((d) => d.severity === 'error');

  if (errors.length > 0) {
    for (const d of errors) log.error(`${d.at}: ${d.message}`);
    if (!options.force) {
      throw new Error(`contract has ${errors.length} error(s); refusing to generate partial code (use --force to override)`);
    }
    log.warn(`--force given, generating anyway (${errors.length} error(s))`);
  }
  for (const d of diagnostics.filter((w) => w.severity === 'warning')) {
    log.warn(`${d.at}: ${d.message}`);
  }

  const { files, warnings } = generate(spec, {
    templatesDir: options.templates,
    rootModule: options.rootModule,
  });
  if (options.withOrm) files.push(...generateDataLayer(spec));
  for (const w of warnings) log.warn(w);
  return { files, warnings };
}

function writeOnce(options: GenerateApiOptions): GenerateApiResult {
  const contractPath = resolve(options.contract);
  const spec = compileContract(contractPath);
  log.step(`parsed ${contractPath}: ${spec.types.length} type(s), ${spec.services.length} service(s)`);

  const { files } = generateFromSpec(spec, options);

  const outDir = resolve(options.out ?? 'src');
  const summary = writeFiles(files, {
    outDir,
    policy: options.policy ?? 'generated',
    dryRun: options.dryRun,
  });

  printSummary(summary, options.dryRun ? `${outDir} (dry run)` : outDir);
  return { spec, files, ...summary };
}

export function generateApi(options: GenerateApiOptions): GenerateApiResult {
  const result = writeOnce(options);

  if (options.watch) {
    const contractPath = resolve(options.contract);
    log.step(`watching ${contractPath} (Ctrl-C to stop)`);
    const handle = watchFile(
      contractPath,
      () => {
        // 契约改坏了不能让监听器死掉：报错后继续等下一次保存
        try {
          writeOnce(options);
        } catch (err) {
          log.error(err instanceof Error ? err.message : String(err));
        }
      },
      { onError: (err: unknown) => log.error(String(err)) },
    );
    process.on('SIGINT', () => {
      handle.close();
      process.exit(0);
    });
  }

  return result;
}
