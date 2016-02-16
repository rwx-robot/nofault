import type { DynamicModule, Provider } from '../interfaces/module.interface';
import { getProviderToken } from '../interfaces/module.interface';
import type { InjectionToken, Type } from '../interfaces/type.interface';
import { tokenToString } from '../interfaces/type.interface';
import type { InstanceWrapper } from './instance-wrapper';

/**