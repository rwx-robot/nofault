/**
 * SQL 方言。
 *
 * 只做一件事：把结构化的意图翻译成 SQL 字符串 + 参数。
 * **不碰连接、不做 IO** —— 这样方言可以单测，也能被任何驱动复用。
 */
import type { ColumnMeta, ColumnType, EntityMeta } from './decorators';