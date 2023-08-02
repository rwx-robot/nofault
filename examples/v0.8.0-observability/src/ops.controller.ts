/**
 * 运维端点：`/metrics`（Prometheus 抓取）与 `/debug/spans`（最近的上报）。
 *
 * 这两个端点**不参与业务指标统计**：否则"看监控"这个动作本身
 * 会污染监控数据（采集频率一高就全是它自己的记录）。
 */
import { Controller, Get, Ctx, type RestContext } from '@nofault/rest';
import { exporter, registry, tracer } from './telemetry.setup';

@Controller('/ops')
export class OpsController {
  @Get('/metrics')
  metrics(@Ctx() ctx: RestContext): void {
    ctx.response.status(200).header('content-type', 'text/plain; version=0.0.4; charset=utf-8');