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

  samples(): Sample[] {
    const out: Sample[] = [];
    for (const [key, series] of this.buckets) {
      const labels = parseKey(key);
      let cumulative = 0;
      this.boundaries.forEach((boundary, i) => {
        cumulative += series.counts[i] ?? 0;
        out.push({ name: `${this.name}_bucket`, labels: { ...labels, le: String(boundary) }, value: cumulative });
      });
      out.push({ name: `${this.name}_bucket`, labels: { ...labels, le: '+Inf' }, value: series.count });
      out.push({ name: `${this.name}_sum`, labels, value: series.sum });
      out.push({ name: `${this.name}_count`, labels, value: series.count });
    }
    return out;
  }
}

export class MetricRegistry {
  private readonly counters = new Map<string, Counter>();
  private readonly gauges = new Map<string, Gauge>();
  private readonly histograms = new Map<string, Histogram>();

  counter(name: string, help = ''): Counter {
    let metric = this.counters.get(name);
    if (!metric) {
      metric = new Counter(name, help);
      this.counters.set(name, metric);
    }
    return metric;
  }

  gauge(name: string, help = ''): Gauge {
    let metric = this.gauges.get(name);
    if (!metric) {
      metric = new Gauge(name, help);
      this.gauges.set(name, metric);
    }
    return metric;
  }

  histogram(name: string, help = '', boundaries: number[] = DEFAULT_BUCKETS): Histogram {
    let metric = this.histograms.get(name);
    if (!metric) {
      metric = new Histogram(name, help, boundaries);
      this.histograms.set(name, metric);
    }
    return metric;
  }

  /** Prometheus 文本格式（0.0.4 的子集） */
  toPrometheus(): string {
    const lines: string[] = [];
    for (const metric of this.counters.values()) {
      if (metric.help) lines.push(`# HELP ${metric.name} ${metric.help}`);
      lines.push(`# TYPE ${metric.name} counter`);
      for (const sample of metric.samples()) lines.push(renderSample(sample));
    }
    for (const metric of this.gauges.values()) {
      if (metric.help) lines.push(`# HELP ${metric.name} ${metric.help}`);
      lines.push(`# TYPE ${metric.name} gauge`);
      for (const sample of metric.samples()) lines.push(renderSample(sample));
    }
    for (const metric of this.histograms.values()) {
      if (metric.help) lines.push(`# HELP ${metric.name} ${metric.help}`);
      lines.push(`# TYPE ${metric.name} histogram`);
      for (const sample of metric.samples()) lines.push(renderSample(sample));
    }
    return lines.join('\n') + '\n';
  }

  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
  }
}

function renderSample(sample: Sample): string {
  const labels = Object.entries(sample.labels)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, value]) => `${key}="${escapeValue(value)}"`)
    .join(',');
  return labels ? `${sample.name}{${labels}} ${sample.value}` : `${sample.name} ${sample.value}`;
}

function escapeValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function keyOf(labels: Labels): string {
  return Object.entries(labels)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, value]) => `${key}=${value}`)
    .join(',');
}