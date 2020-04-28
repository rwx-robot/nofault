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