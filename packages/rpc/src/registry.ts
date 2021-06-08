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