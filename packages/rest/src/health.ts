/**
 * 健康检查（v0.3.0）。
 *
 * 两个端点，语义严格区分（K8s 约定）：
 * - **liveness（/healthz）**：进程活着吗？挂了就重启。只做最廉价的检查。
 * - **readiness（/readyz）**：能接流量吗？没就绪就从负载均衡摘掉。
 *
 * 常见错误把两者写成同一个——那样依赖抖动会把健康实例也重启掉。
 */

export type HealthStatus = 'ok' | 'degraded' | 'down';

export interface HealthCheckResult {
  name: string;
  status: HealthStatus;
  /** 耗时（毫秒） */
  durationMs: number;
  error?: string;
}

export interface HealthReport {
  status: HealthStatus;
  uptimeSec: number;
  checks: HealthCheckResult[];
}

/** 单项检查：抛错即视为 down */
export type HealthCheck = () => Promise<unknown> | unknown;

interface RegisteredCheck {
  name: string;
  check: HealthCheck;
  /** true 表示失败只降级（degraded）不判死 */
  degradeOnFailure?: boolean;
}

const worst = (a: HealthStatus, b: HealthStatus): HealthStatus => {
  const rank: Record<HealthStatus, number> = { ok: 0, degraded: 1, down: 2 };
  return rank[a] >= rank[b] ? a : b;
};

export class HealthRegistry {
  private readonly liveness = new Map<string, RegisteredCheck>();
  private readonly readiness = new Map<string, RegisteredCheck>();
  private ready = true;

  registerLiveness(name: string, check: HealthCheck, degradeOnFailure = false): this {
    this.liveness.set(name, { name, check, degradeOnFailure });
    return this;
  }

  registerReadiness(name: string, check: HealthCheck, degradeOnFailure = false): this {
    this.ready = false;
    this.readiness.set(name, { name, check, degradeOnFailure });
    return this;
  }

  /** 启动完成：标记为可接流量 */
  markReady(): void {
    this.ready = true;
  }

  /** 优雅退出前：先摘流量，再关进程 */
  markNotReady(): void {
    this.ready = false;
  }

  get isReady(): boolean {
    return this.ready;
  }

  async checkLiveness(): Promise<HealthReport> {
    return this.run([...this.liveness.values()]);
  }

  async checkReadiness(): Promise<HealthReport> {
    if (!this.ready) {
      return { status: 'down', uptimeSec: Math.round(process.uptime()), checks: [] };
    }
    return this.run([...this.readiness.values()]);
  }

  private async run(checks: RegisteredCheck[]): Promise<HealthReport> {
    let status: HealthStatus = 'ok';
    const results: HealthCheckResult[] = [];

    for (const c of checks) {
      const started = performance.now();
      try {
        await Promise.race([
          Promise.resolve(c.check()),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
        ]);
        results.push({
          name: c.name,
          status: 'ok',