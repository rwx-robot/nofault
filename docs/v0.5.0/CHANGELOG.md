# Changelog — v0.5.0（2020 · 数据访问层）

> 方言只生成字符串，Repository 不碰 SQL。

## 新增包

### `@nofault/orm`
- 实体映射：`@Entity @Column @PrimaryGeneratedColumn @CreateDateColumn @UpdateDateColumn`
  列名默认 snake_case，类型由 `design:type` 推断
- `Repository<T>`：save / update / persist / delete / findById / findOne / find / count / paginate
- `QueryBuilder`：where / whereIn / whereGroup / orderBy / limit / offset / getManyAndCount
- `DataSource` 双实现：
  - `MemoryDataSource`：内存表 + 事务快照回滚 + 迷你 SQL 引擎（供迁移用）
  - `SqlDataSource`：executor 回调，**不绑定任何驱动**
- 事务：`source.transaction()`，抛错即回滚
- 迁移：`Migrator` + `schema_migrations` 版本表，up/down 都要求实现
- DI：`OrmModule.forRoot/forFeature`、`@InjectRepository()`

### `@nofault/cache`
- `Cache` 接口（6 个方法）+ `MemoryCache`（TTL / LRU / 抖动 / single-flight）+ `NullCache`
- `getOrSet()`：并发同 key 只回源一次
- `CacheModule.forRoot()`（全局）、`cacheKey()`、`cached()` 包装器