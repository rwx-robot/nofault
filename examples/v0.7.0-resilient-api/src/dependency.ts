/**
 * 一个会"按指令生病"的下游服务。
 *
 * 演示熔断必须能**人为制造故障**，否则只能靠运气等线上出事。
 * 通过 `GET /faulty/break?mode=down` 可以把它切成持续失败模式。
 */
class Dependency {