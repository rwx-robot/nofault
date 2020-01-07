/**
 * 实体映射装饰器。
 *
 * 设计取舍：**只描述"表里长什么样"，不描述"对象怎么活"**。
 * 于是这里没有级联、没有懒加载代理、没有脏检查魔法——
 * 那些东西带来的惊喜远多于便利，而一个明确的 `save()` 足以覆盖 95% 的场景。
 */
import 'reflect-metadata';
import { ORM_METADATA } from './metadata';

export type ColumnType = 'int' | 'bigint' | 'float' | 'string' | 'text' | 'boolean' | 'date' | 'json';

export interface ColumnOptions {
  /** 列名，默认取属性名的 snake_case */
  name?: string;
  type?: ColumnType;
  nullable?: boolean;
  unique?: boolean;
  /** 自增主键 */
  primary?: boolean;
  generated?: boolean;
  /** 写入时自动填充 */
  onCreate?: () => unknown;
  onUpdate?: () => unknown;
  comment?: string;
}

export interface EntityOptions {
  /** 表名，默认取类名的 snake_case */
  table?: string;
  comment?: string;
}

export interface ColumnMeta extends ColumnOptions {
  property: string;
  name: string;
  type: ColumnType;
  nullable: boolean;
}

export interface EntityMeta {
  target: Function;
  table: string;
  columns: Map<string, ColumnMeta>;
  primaryColumn?: string;
  comment?: string;
}

function toSnakeCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[A-Z]+(?![a-z])/g, (m) => `_${m}`)
    .replace(/^_+/, '')
    .toLowerCase();
}

function inferType(designType: unknown): ColumnType {
  if (designType === Number) return 'int';
  if (designType === Boolean) return 'boolean';
  if (designType === Date) return 'date';
  if (designType === Object || designType === Array) return 'json';
  return 'string';
}

export function Entity(options: EntityOptions = {}): ClassDecorator {
  return (target) => {
    const meta = ensureMeta(target);
    meta.table = options.table ?? toSnakeCase(target.name);
    if (options.comment) meta.comment = options.comment;
  };
}

export function Column(options: ColumnOptions = {}): PropertyDecorator {
  return (target, propertyKey) => {
    const meta = ensureMeta(target.constructor);
    const property = String(propertyKey);
    const designType = Reflect.getMetadata('design:type', target, propertyKey) as unknown;
    const column: ColumnMeta = {
      property,
      name: options.name ?? toSnakeCase(property),
      type: options.type ?? inferType(designType),
      nullable: options.nullable ?? false,
      ...options,
    };
    meta.columns.set(property, column);
    if (column.primary) meta.primaryColumn = property;
  };
}

/** 自增主键的简写：`@PrimaryGeneratedColumn()` */
export function PrimaryGeneratedColumn(options: ColumnOptions = {}): PropertyDecorator {
  return Column({ type: 'int', primary: true, generated: true, ...options });
}
