/**
 * ORM 的依赖注入装配。
 *
 * `OrmModule.forRoot({ dataSource })` 提供全局 DataSource；
 * `OrmModule.forFeature([User])` 为每个实体注册一个 Repository Provider，
 * token 是 `getRepositoryToken(User)`——注入时用 `@InjectRepository(User)`。
 *
 * Repository 是**单例**：它无状态，所有状态都在 DataSource 里。
 * 这点与请求级服务不同，别把它标成 REQUEST 作用域。
 */
import { Inject, Injectable, Module, type DynamicModule, type Provider } from '@nofault/core';
import type { Type } from '@nofault/core';
import type { DataSource } from './data-source';
import { getEntityMeta } from './decorators';
import { Repository } from './repository';

export const DATA_SOURCE = Symbol('NOFAULT_DATA_SOURCE');

export function getRepositoryToken(entity: Function): string {
  return `${getEntityMeta(entity).table}Repository`;
}

/** 构造函数参数注入用：`constructor(@InjectRepository(User) private users: Repository<User>)` */
export function InjectRepository(entity: Function): ParameterDecorator {
  return Inject(getRepositoryToken(entity) as never);
}

class RepositoryFactory {
  constructor(private readonly source: DataSource) {}

  create<T extends object>(entity: Type<T>): Repository<T> {
    return new Repository<T>(entity, this.source);
  }
}

@Injectable()
class RepositoryRegistry {
  private readonly cache = new Map<string, unknown>();

  constructor(@Inject(DATA_SOURCE as never) private readonly source: DataSource) {}

  get<T extends object>(entity: Type<T>): Repository<T> {
    const token = getRepositoryToken(entity);
    let repo = this.cache.get(token) as Repository<T> | undefined;
    if (!repo) {
      repo = new Repository<T>(entity, this.source);
      this.cache.set(token, repo);
    }
    return repo;
  }
}

export interface OrmModuleOptions {