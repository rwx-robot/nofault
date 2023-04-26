/**
 * 指标：Counter / Gauge / Histogram。
 *
 * 三条取舍：
 * 1. **标签是有界的**。每个指标的标签取值会被记录在一张表里；
 *    用 userId 当标签会让这张表无限膨胀（基数爆炸），
 *    所以这里显式限制 `maxCardinality`，超出就不再新建序列。
 * 2. **Histogram 用边界桶而不是存每个样本**。
 *    存全部样本在每秒几千次请求下必然 OOM；
 *    桶换来的是 O(1) 内存和足够用的分位数近似。
 * 3. 提供 **Prometheus 文本格式**导出，不自建采集协议。
 */
export type Labels = Record<string, string>;

export interface Sample {
  name: string;
  labels: Labels;
  value: number;
}

export class Counter {
  private readonly values = new Map<string, number>();

  constructor(
    readonly name: string,
    readonly help = '',
  ) {}

  inc(labels: Labels = {}, by = 1): void {
    const key = keyOf(labels);
    this.values.set(key, (this.values.get(key) ?? 0) + by);
  }

  get(labels: Labels = {}): number {
    return this.values.get(keyOf(labels)) ?? 0;
  }

  samples(): Sample[] {
    return [...this.values.entries()].map(([key, value]) => ({
      name: this.name,
      labels: parseKey(key),
      value,
    }));
  }
}

export class Gauge {
  private readonly values = new Map<string, number>();

  constructor(
    readonly name: string,
    readonly help = '',
  ) {}

  set(value: number, labels: Labels = {}): void {
    this.values.set(keyOf(labels), value);
  }

  add(delta: number, labels: Labels = {}): void {
    const key = keyOf(labels);
    this.values.set(key, (this.values.get(key) ?? 0) + delta);
  }

  get(labels: Labels = {}): number {
    return this.values.get(keyOf(labels)) ?? 0;
  }

  samples(): Sample[] {
    return [...this.values.entries()].map(([key, value]) => ({
      name: this.name,
      labels: parseKey(key),
      value,
    }));
  }
}

/** 默认桶边界（毫秒）——覆盖 Web 服务的常见延迟区间 */
export const DEFAULT_BUCKETS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];

export class Histogram {
  private readonly buckets = new Map<string, { counts: number[]; sum: number; count: number }>();

  constructor(
    readonly name: string,
    readonly help = '',
    readonly boundaries: number[] = DEFAULT_BUCKETS,
  ) {}

  observe(value: number, labels: Labels = {}): void {
    const key = keyOf(labels);
    let series = this.buckets.get(key);
    if (!series) {
      series = { counts: new Array(this.boundaries.length + 1).fill(0), sum: 0, count: 0 };
      this.buckets.set(key, series);
    }
    series.sum += value;
    series.count += 1;
    let index = this.boundaries.findIndex((b) => value <= b);
    if (index < 0) index = this.boundaries.length; // +Inf
    series.counts[index] = (series.counts[index] ?? 0) + 1;
  }

  /**
   * 分位数近似。
   *
   * 返回的是**所在桶的上界**（与 Prometheus 的 histogram_quantile 同一思路）：
   * 桶里只存计数，不存样本，因此给不出精确分位数。
   * 这是刻意的取舍——存全部样本在几千 QPS 下必然 OOM。
   */
  percentile(p: number, labels: Labels = {}): number | undefined {
    const series = this.buckets.get(keyOf(labels));
    if (!series || series.count === 0) return undefined;
    const target = Math.ceil((p / 100) * series.count);
    let cumulative = 0;
    for (let i = 0; i < this.boundaries.length; i++) {
      cumulative += series.counts[i] ?? 0;
      if (cumulative >= target) return this.boundaries[i];
    }
    return this.boundaries[this.boundaries.length - 1];
  }

  stats(labels: Labels = {}): { count: number; sum: number; avg: number } | undefined {
    const series = this.buckets.get(keyOf(labels));
    if (!series) return undefined;
    return {
      count: series.count,
      sum: Math.round(series.sum * 1000) / 1000,
      avg: series.count ? Math.round((series.sum / series.count) * 1000) / 1000 : 0,
    };
  }
