import {
  readScope,
  readDependencyOverrides,
  readOptionalParams,
  readParamTypes,
  readPropertyInjections,
} from '../decorators/injectable.decorator';
import { CircularDependencyError, UnknownDependencyError } from '../errors';
import type { Provider } from '../interfaces/module.interface';
import {
  isClassProvider,
  isExistingProvider,
  isFactoryProvider,
  isValueProvider,
} from '../interfaces/module.interface';
import { Scope } from '../interfaces/type.interface';
import type { InjectionToken } from '../interfaces/type.interface';
import { tokenToString } from '../interfaces/type.interface';
import { InstanceWrapper } from './instance-wrapper';
import type { ContextId } from './instance-wrapper';
import type { ModuleRef } from './module-ref';
import type { NofaultContainer } from './container';