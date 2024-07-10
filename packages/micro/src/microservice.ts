/**
 * 一键装配：把一个 ORDER 好的微服务跑起来。
 *
 * **为什么要有这一层**：前面八个版本各自交付了能力，
 * 但把它们接起来要写五十行样板代码，而且顺序错了就会出微妙的问题——
 * 比如先接流量再迁移数据库，会有半初始化的实例开始处理请求。
 *
 * 启动顺序（反过来全是 bug）：
 * ```
 * 1. 数据源连接         —— 后面每一步都可能要用它
 * 2. 迁移              —— 表结构必须先就位
 * 3. 依赖注册清理/自检   —— 尽早失败，别等到接流量才发现
 * 4. 中间件与路由装配
 * 5. 监听端口          —— 到这里才对外可见
 * 6. 注册到注册中心     —— 可见之后才让别人发现我
 * 7. 就绪探针置 true    —— 最后一步，必须在真正能服务之后
 * ```
 *
 * 停机是启动的逆序：**先注销，再停流量**，
 * 否则会有一段时间"我已经下线了但还有请求进来"。
 */
export type LifecyclePhase = 'starting' | 'running' | 'stopping' | 'stopped';

export interface LifecycleHook {
  (ctx: MicroserviceContext): Promise<void> | void;
}

export interface MicroserviceContext {
  readonly name: string;
  readonly startedAt: number;
  phase(): LifecyclePhase;
  ready(): boolean;
  setReady(value: boolean): void;
  /** 注册停机时要跑的动作（逆序执行） */
  onStop(hook: LifecycleHook): void;
  log(message: string): void;
}

export interface ShutdownOptions {
  /** 优雅停机的最长等待时间；超时就强杀 */
  graceMs?: number;
  /** 是否自己接管 SIGTERM / SIGINT。多实例测试时要关掉 */
  captureSignals?: boolean;
}

export interface MicroserviceOptions {
  name: string;
  /** 启动阶段的钩子，按数组顺序执行 */
  bootstrap?: LifecycleHook[];
  /** 全部就位之后、置就绪之前执行 */
  beforeReady?: LifecycleHook[];
  shutdown?: ShutdownOptions;
  logger?: (message: string) => void;
  /** 每次 `run()` 都要重跑一遍（幂等），用于 migrate 这类动作 */
  repeated?: LifecycleHook[];
}

export class ShutdownTimeoutError extends Error {
  constructor(graceMs: number) {
    super(`graceful shutdown exceeded ${graceMs}ms`);
    this.name = 'ShutdownTimeoutError';
  }
}

export class Microservice {
  private phaseValue: LifecyclePhase = 'stopped';
  private readyValue = false;
  private readonly stopHooks: LifecycleHook[] = [];
  private readonly signalHandlers = new Map<NodeJS.Signals, () => void>();
  private ctx!: MicroserviceContext;

  constructor(private readonly options: MicroserviceOptions) {}

  get context(): MicroserviceContext {
    if (!this.ctx) throw new Error('microservice has not been started');
    return this.ctx;
  }

  phase(): LifecyclePhase {
    return this.phaseValue;
  }

  ready(): boolean {
    return this.readyValue;
  }

  async start(): Promise<MicroserviceContext> {
    if (this.phaseValue === 'running' || this.phaseValue === 'starting') return this.ctx;

    this.phaseValue = 'starting';
    this.readyValue = false;
    // 没有传 logger 时用 console：这是个默认实现，不是散落的调试打印
    // eslint-disable-next-line no-console
    const log = this.options.logger ?? ((m: string) => console.log(m));

    const ctx: MicroserviceContext = {
      name: this.options.name,
      startedAt: Date.now(),
      phase: () => this.phaseValue,
      ready: () => this.readyValue,
      setReady: (value) => {
        this.readyValue = value;
      },
      onStop: (hook) => this.stopHooks.push(hook),
      log: (message) => log(`[${this.options.name}] ${message}`),
    };
    this.ctx = ctx;

    try {
      for (const hook of this.options.bootstrap ?? []) await hook(ctx);
      for (const hook of this.options.repeated ?? []) await hook(ctx);
      for (const hook of this.options.beforeReady ?? []) await hook(ctx);

      this.phaseValue = 'running';
      // 就绪标记必须**最后**打开：在此之前，探针要如实回答"还不能服务"
      ctx.setReady(true);
      ctx.log(`ready in ${Date.now() - ctx.startedAt}ms`);

      if (this.options.shutdown?.captureSignals !== false) {
        this.captureSignals();
      }
      return ctx;
    } catch (err) {
      // 启动失败要把已经申请的资源还回去：
      // 连接池、监听器、已注册的实例…… 留着就是泄漏
      await this.stop();
      throw err;
    }
  }

  async stop(): Promise<void> {
    if (this.phaseValue === 'stopped' || this.phaseValue === 'stopping') return;
    this.phaseValue = 'stopping';
    // 第一件事就让探针说"不健康"：上游该开始把流量挪走了
    this.readyValue = false;

    const graceMs = this.options.shutdown?.graceMs ?? 10_000;
    this.releaseSignals();

    const deadline = Date.now() + graceMs;
    // 逆序：后装的先卸。否则先卸的东西可能还被依赖它的东西用着
    for (const hook of [...this.stopHooks].reverse()) {
      if (Date.now() > deadline) throw new ShutdownTimeoutError(graceMs);