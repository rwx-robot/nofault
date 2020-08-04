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
import { kebabCase, pascalCase } from '@nofault/dsl';
import type { GeneratedFile } from './generate';

export interface DataLayerOptions {
  /** 目录前缀，默认 `data` */
  dir?: string;
  /** 只生成这些类型；不传则全部生成 */
  only?: string[];
}

/**
 * 挑出"该建表"的类型。
 *
 * 判据是**被当作响应类型使用过**：请求 DTO 是传输对象（`CreateUserReq`），
 * 给它建一张表毫无意义；而响应对象（`UserResp`）通常就对应领域实体。
 * 一开始就选对，比事后删掉六个没用的 entity 文件省事得多。
 */
function entityTypes(spec: ApiSpec, only?: string[]): TypeSpec[] {
  if (only) return spec.types.filter((t) => only.includes(t.name));
  const referenced = new Set<string>();
  for (const service of spec.services) {
    for (const route of service.routes) {
      if (route.responseType) referenced.add(route.responseType.replace(/\[\]$/, '').trim());
    }
  }
  const matched = spec.types.filter((t) => referenced.has(t.name));
  return matched.length > 0 ? matched : [];
}

export function generateDataLayer(spec: ApiSpec, options: DataLayerOptions = {}): GeneratedFile[] {
  const dir = options.dir ?? 'data';
  const types = entityTypes(spec, options.only);

  const files: GeneratedFile[] = types.map((type) => ({
    kind: 'entity' as const,
    path: `${dir}/entities/${kebabCase(type.name)}.entity.ts`,
    content: renderEntity(type),
  }));

  for (const type of types) {
    files.push({
      kind: 'repository' as const,
      path: `${dir}/repositories/${kebabCase(type.name)}.repository.ts`,
      content: renderRepository(type),
    });
  }
  return files;
}