import 'reflect-metadata';
import { PARAM_TYPES_METADATA, PROVIDER_METADATA, PROPERTY_TYPE_METADATA } from '../constants';
import { Scope } from '../interfaces/type.interface';
import type { InjectionToken } from '../interfaces/type.interface';
import { tokenToString } from '../interfaces/type.interface';

interface InjectableOptions {
  scope?: Scope;
}

/**
 * 标记一个类可以被 IoC 容器实例化与注入。
 *