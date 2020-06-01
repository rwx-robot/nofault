/**
 * 迁移：把"表结构变更"变成可版本化、可回滚、可重复执行的代码。
 *
 * 三条纪律：
 * 1. 每个 migration 只做一件事，且**必须写 down**——没有回滚的迁移等于埋雷
 * 2. 已执行的版本记在 `schema_migrations` 表里，重复执行不会重跑
 * 3. up 失败即中止，后面的版本不执行（顺序是有依赖的）
 */
import type { DataSource } from './data-source';
import { getEntityMeta } from './decorators';