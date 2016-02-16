/** 框架内部使用的元数据键（统一收敛，避免散落魔法字符串） */

export const MODULE_METADATA = {
  IMPORTS: 'nofault:module:imports',
  PROVIDERS: 'nofault:module:providers',
  EXPORTS: 'nofault:module:exports',
  CONTROLLERS: 'nofault:module:controllers',
  GLOBAL: 'nofault:module:global',
} as const;

export const PROVIDER_METADATA = {
  SCOPE: 'nofault:provider:scope',
  DEPENDENCIES: 'nofault:provider:dependencies',
} as const;

export const PARAM_TYPES_METADATA = 'design:paramtypes';
export const PROPERTY_TYPE_METADATA = 'design:type';
export const RETURN_TYPE_METADATA = 'design:returntype';

/** 内置令牌 */