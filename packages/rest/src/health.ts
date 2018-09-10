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
