import { RestContext, RestRequest, RestResponse } from './http/context';
import { BadRequestException, HttpException } from './errors/http-exception';
import { ParamSource, getParams, type ParamMetadata } from './metadata';
import { getRouteDto } from './decorators';
import { validateDto, coerceDtoFields, type ValidationError } from './validation';

/**
 * 中间件签名：洋葱模型。