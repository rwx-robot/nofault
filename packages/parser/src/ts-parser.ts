import { Scanner, TokenType } from './scanner';
import type { Token } from './scanner';
import {
  FieldSource,
  createApiSpec,
  type ApiSpec,
  type FieldSpec,
  type RouteSpec,
  type ServiceSpec,
  type TypeSpec,
} from '@nofault/dsl';

/**
 * TypeScript 契约文件（`.api.ts`）解析器。
 *
 * **不执行用户代码**——只做词法 + 轻量语法分析，因此安全、快速、无副作用。
 * （TypeScript Compiler API 能提供完整类型信息，但会带来几十 MB 依赖；
 *   契约文件的形状是固定的，扫描器足够。需要更严格的类型分析时再换。）
 *
 * 支持：
 * ```ts
 * @Api('user') @Prefix('/v1') @Group('user') @Jwt('Auth') @Timeout('3s')