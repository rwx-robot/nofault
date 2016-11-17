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

## 生成器扩展
- `nofaultctl generate api --with-orm`：额外产出 entity 与 repository 骨架
- `nofaultctl generate api --watch`：监听契约变化自动重新生成（防抖 120ms）

## 关键设计决策

| 决策 | 理由 |
| --- | --- |
| 只给"响应类型"建表 | 请求 DTO 是传输对象，给它建表毫无意义 |
| 契约里的 `id` 跳过 | 主键由生成器统一提供，否则生成两个同名 `id` |
| `save()` 把 0 当未设置 | TS 里 `new User().id` 恒为 0，照写会撞主键 |
| 比较前归一化布尔 | 库里是 1/0、实体上是 true/false，否则"存得进取不出来" |
| 事务快照覆盖 raw 表 | 否则迁移失败会留下版本号，下次永远不重试 |
| `getOrSet` 不固化 undefined | 固化"查不到"会让数据写入后永远读不到 |
| 缓存命中/回源差数量级 | 所以"能不能命中"是唯一重要的问题 |

## 测试

- 单元测试 +29：orm 14、cache 15
- 集成测试 +3：Repository 经容器解析、事务回滚不留幽灵行、并发只回源一次
- 合计 **270 项全通过**；`tsc --noEmit` 与 `eslint` 全清

## 性能

| 指标 | 数值 |
| --- | --- |
| insert | 210,719 ops/sec |
| findById | 13,346 ops/sec |
| query（where+order+limit） | 4,599 ops/sec |
| 事务提交 | 15,970 ops/sec |
| 缓存命中 vs 回源（1ms 模拟） | ~12,300× |
| 50 并发同 key | 回源 1 次 |
| 20 条迁移 | 4.78 ms |

## 已知限制

- 方言只覆盖单表 CRUD，无 JOIN
- 内存数据源的 WHERE 只支持迁移所需的形式
- LRU 淘汰为 O(n log n)，`max` 不宜过大
- 无连接池（交给驱动）
- 无 RPC → v0.6.0；无熔断限流 → v0.7.0；无链路追踪 / 指标 → v0.8.0
