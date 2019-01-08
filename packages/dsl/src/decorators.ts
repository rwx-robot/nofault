import 'reflect-metadata';
import { FieldSource } from './spec';

/**
 * 契约文件用的装饰器。
 *
 * 两条使用路径都支持：
 * 1. **静态解析**（推荐）：`@nofault/parser` 读源码，不执行用户代码
 * 2. **运行时读取**：装饰器同时把元信息写进 `reflect-metadata`，可用于自省与测试
 */

const M = {
  API: 'nofault:dsl:api',
  SERVICE: 'nofault:dsl:service',
  ROUTE: 'nofault:dsl:routes',