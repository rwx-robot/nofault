/**
 * 由契约生成数据层骨架（v0.5.0）。
 *
 * 与 controller/service 一样，**生成的只是骨架**：
 * 实体给出表结构映射，Repository 给出类型化的访问入口。
 * 真实的业务查询写在 repository 里（它会被人工接管，生成器不再覆盖）。
 *
 * 类型映射规则（契约的 TS 类型 → 列类型）：
 * `string → string`、`number → int`、`boolean → boolean`、`Date → date`、
 * 数组与自定义类型 → `json`（不生成关联，关联要人来定，猜错代价太大）
 */
import type { ApiSpec, TypeSpec, FieldSpec } from '@nofault/dsl';