/**
 * @nofault/orm —— 数据访问（v0.5.0）。
 *
 * 分层：`装饰器/元数据 → 方言（纯字符串）→ 数据源（IO 边界）→ Repository`
 * 方言不碰 IO、Repository 不碰 SQL，两边的单测因此可以完全独立。
 */
export {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  getEntityMeta,
  isEntity,
  toSnakeCase,
} from './decorators';