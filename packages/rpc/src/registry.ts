/**
 * 服务注册与发现。
 *
 * 接口刻意很小：注册、注销、查询、心跳续租。
 * 真实环境背后可以是 etcd / consul / nacos / k8s service——
 * 而**内存实现让 RPC 在没有外部依赖时也能跑**，这对示例和测试是刚需。
 *
 * 关键行为：**TTL 过期自动剔除**。
 * 服务进程被 SIGKILL 时没有机会注销自己，若不下线，
 * 调用方会一直往一个死掉的实例发请求。
 */
export interface ServiceInstance {
  id: string;
  name: string;
  host: string;
  port: number;
  /** 权重（简单负载均衡用） */
  weight?: number;
  metadata?: Record<string, string>;
  /** 最后一次心跳时间（毫秒时间戳） */
  lastHeartbeat?: number;
}

export interface Registry {
  register(instance: Omit<ServiceInstance, 'lastHeartbeat'>): Promise<void>;
  deregister(id: string): Promise<void>;
  heartbeat(id: string): Promise<void>;
  /** 返回当前存活的实例；过期实例会被顺带清理 */
  discover(name: string): Promise<ServiceInstance[]>;
  list(): Promise<ServiceInstance[]>;
  close(): Promise<void>;
}

export interface InMemoryRegistryOptions {
  /** 超过这个时间没有心跳即视为下线（毫秒） */
  ttlMs?: number;
}

export class InMemoryRegistry implements Registry {
  private readonly instances = new Map<string, ServiceInstance>();
  private readonly ttlMs: number;

  constructor(options: InMemoryRegistryOptions = {}) {
    this.ttlMs = options.ttlMs ?? 30_000;
  }

  async register(instance: Omit<ServiceInstance, 'lastHeartbeat'>): Promise<void> {
    this.instances.set(instance.id, { ...instance, lastHeartbeat: Date.now() });
  }

  async deregister(id: string): Promise<void> {
    this.instances.delete(id);
  }

  async heartbeat(id: string): Promise<void> {
    const existing = this.instances.get(id);
    if (existing) existing.lastHeartbeat = Date.now();
  }

  async discover(name: string): Promise<ServiceInstance[]> {
    this.sweep();
    return [...this.instances.values()].filter((i) => i.name === name);
  }

  async list(): Promise<ServiceInstance[]> {
    this.sweep();
    return [...this.instances.values()];
  }

  async close(): Promise<void> {
    this.instances.clear();
  }

  /** 剔除心跳超时的实例 */
  private sweep(): void {
    const now = Date.now();
    for (const [id, instance] of this.instances) {
      if (now - (instance.lastHeartbeat ?? 0) > this.ttlMs) {
        this.instances.delete(id);
      }
    }
  }
}

/**
 * 加权轮询。
 *
 * 不用随机的原因：随机会在短时间内把流量打到同一实例（"热点"），
 * 而轮询的分布在任何窗口内都更均匀。
 */
export class RoundRobinBalancer {
  private index = 0;

  pick(instances: ServiceInstance[]): ServiceInstance | undefined {
    if (instances.length === 0) return undefined;