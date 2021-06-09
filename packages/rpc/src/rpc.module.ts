/**
 * RPC 的 DI 装配。
 *
 * `RpcModule.forClient()` 提供一个**已配置好的客户端**；
 * 服务端的注册通常直接手写（要决定暴露哪些服务、用不用拦截器），
 * 所以没有 forServer——框架不该替业务决定暴露面。
 */
import { Inject, type DynamicModule, type Provider } from '@nofault/core';
import { RpcClient, type RpcClientOptions } from './client';

export const RpcClientToken = Symbol('NOFAULT_RPC_CLIENT');

export function InjectRpcClient(): ParameterDecorator {
  return Inject(RpcClientToken as never);
}

export class RpcModule {
  static forClient(options: RpcClientOptions = {}): DynamicModule {
    const providers: Provider[] = [