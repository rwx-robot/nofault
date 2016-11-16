# v0.5.0 架构：数据访问层

> 图见 [`ARCHITECTURE.svg`](./ARCHITECTURE.svg)

## 一句话

**方言只生成字符串，Repository 不碰 SQL，DataSource 是唯一的 IO 边界。**
于是 ORM 可以不装数据库就跑起来，也能接任何驱动。

## 一、分层

```
@Entity 装饰器 ──> EntityMeta（元数据）
                        │
Repository / QueryBuilder ──> Dialect ──> SQL 字符串 + 参数 ──> Executor（驱动）
        │
        └──> DataSource（IO 边界）
                 ├─ MemoryDataSource（内存表 + 迷你 SQL 引擎）
                 └─ SqlDataSource（executor 回调，不绑驱动）
```

两条纪律：

1. **Dialect 不做 IO** —— 所以 SQL 可以单测，换驱动只要换 executor
2. **Repository 不写 SQL** —— 业务逻辑与数据库方言彻底解耦

## 二、为什么自带内存数据源

- 示例、测试、CI **不该依赖外部数据库**
- 事务语义（快照 + 回滚）在内存里能完整实现，行为与真实事务一致
- 迁移需要一张 `schema_migrations` 表；为此内存数据源内置了一个**迷你 SQL 引擎**，
  只支持迁移真正用到的几条语句（CREATE / DROP / INSERT / SELECT / UPDATE / DELETE），
  超出即抛错——宁可明确失败，也不假装支持

## 三、刻意不做的事

| 不做 | 理由 |
| --- | --- |
| 脏检查 / 自动 flush | "什么时候落库"必须在代码上一眼可见；隐式写库是最难排查的一类问题 |
| 关联懒加载代理 | 魔法越多，越难预判一次调用会打几条 SQL |
| 级联保存 | 显式 `save()` 已经覆盖绝大多数场景，猜错的代价太大 |
| 从契约猜关联 | 生成器对嵌套/数组一律存 JSON，不猜外键 |

## 四、事务

- 抛错即回滚，快照在最外层建立（嵌套共享同一回滚点）
- **快照必须包含 raw 写入的表**：否则迁移失败时版本号已落库、结构却回滚了，
  下次永远不会重试——这是本次实现里最容易写错的一处