import 'reflect-metadata';

/** 路由参数来源 */
export enum ParamSource {
  PARAM = 'param',
  QUERY = 'query',
  BODY = 'body',
  HEADERS = 'headers',
  REQUEST = 'request',
  RESPONSE = 'response',
  CONTEXT = 'context',
  RAW_REQUEST = 'rawRequest',
  RAW_RESPONSE = 'rawResponse',
}

export interface ParamMetadata {
  source: ParamSource;
  /** 取值的键；对 body 来说是对象内的属性路径 */
  key?: string;
  index: number;
  /** 是否必填 */
  required: boolean;
  /** 默认值 */
  defaultValue?: unknown;