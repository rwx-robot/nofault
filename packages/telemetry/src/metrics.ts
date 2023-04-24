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