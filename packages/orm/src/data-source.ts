/**
 * 数据源：ORM 与"真正的存储"之间唯一的边界。
 *
 * 提供两种实现：
 * - `MemoryDataSource`：纯内存表，语义完整（增删查改 + 事务快照回滚），开箱可用、可测
 * - `SqlDataSource`：把方言生成的 SQL 交给调用方传入的 executor，
 *   **不绑定任何具体驱动**——mysql2 / pg / better-sqlite3 都能接
 *
 * 之所以不直接依赖某个驱动：框架不该替业务选数据库，
 * 而"能在没有数据库的情况下跑起来"对示例和测试是刚需。
 */
import type { EntityMeta, ColumnMeta } from './decorators';
import { getEntityMeta } from './decorators';