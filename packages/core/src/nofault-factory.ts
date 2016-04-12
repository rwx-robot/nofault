import type { DynamicModule } from './interfaces/module.interface';
import type { Type } from './interfaces/type.interface';
import { createApplication } from './application/nofault-application';
import type { NofaultApplicationOptions } from './application/nofault-application';
import type { NofaultApplication } from './application/nofault-application';
import { NofaultApplicationContext } from './application/nofault-application-context';
import type { ApplicationContextOptions } from './application/nofault-application-context';

/**
 * 应用工厂入口。
 *