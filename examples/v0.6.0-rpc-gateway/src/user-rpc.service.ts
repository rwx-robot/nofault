/**
 * 后端服务：一个普通的类，方法就是 RPC 方法。
 *
 * 没有装饰器、没有继承——`registerService()` 直接读原型上的方法名。
 * 这样业务代码对框架零依赖，单测时可以当普通对象直接调。
 */
import { RpcError } from '@nofault/rpc';

/** 业务错误码：4xx 段留给调用方看得懂的错误，网关据此翻译成 HTTP 状态 */
export const USER_NOT_FOUND = 404;

export interface UserDto {
  id: number;
  name: string;
}

export class UserRpcService {
  private readonly users = new Map<number, UserDto>();
  private seq = 0;

  async ping(): Promise<{ pong: boolean }> {
    return { pong: true };
  }

  async create(input: { name: string }): Promise<UserDto> {
    this.seq += 1;
    const user: UserDto = { id: this.seq, name: input.name };
    this.users.set(user.id, user);