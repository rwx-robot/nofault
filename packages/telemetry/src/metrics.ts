/**
 * 指标：Counter / Gauge / Histogram。
 *
 * 三条取舍：
 * 1. **标签是有界的**。每个指标的标签取值会被记录在一张表里；
 *    用 userId 当标签会让这张表无限膨胀（基数爆炸），
 *    所以这里显式限制 `maxCardinality`，超出就不再新建序列。
 * 2. **Histogram 用边界桶而不是存每个样本**。