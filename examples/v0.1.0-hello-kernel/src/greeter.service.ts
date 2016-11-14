import { Injectable, type OnApplicationBootstrap, type OnModuleDestroy } from '@nofault/core';
import { ConfigService } from '@nofault/config';
import { createLogger, type Logger } from '@nofault/logger';

/**
 * 一个普通业务服务。
 *
 * 演示三件事：
 * 1. `@Injectable()` 声明可被容器管理
 * 2. 构造函数按类型注入 `ConfigService`（依赖 `design:paramtypes` 元数据）
 * 3. 实现生命周期钩子参与启动/关闭编排
 */
@Injectable()
export class GreeterService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger: Logger = createLogger({ context: 'GreeterService' });
  private readonly greeting: string;
  private readonly appName: string;

  constructor(private readonly config: ConfigService) {
    this.greeting = this.config.get<string>('app.greeting', 'Hello');
    this.appName = this.config.get<string>('app.name', 'nofault');
  }

  onApplicationBootstrap(): void {
    this.logger.info('greeter ready', { greeting: this.greeting });
  }

  onModuleDestroy(): void {
    this.logger.info('greeter destroyed');
  }

  greet(name?: string): string {
    return name ? `${this.greeting}, ${name}!` : `${this.greeting}!`;
  }

  getAppName(): string {
    return this.appName;
  }
}
