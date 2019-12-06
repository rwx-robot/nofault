/**
 * UserService —— **手写**的业务实现。
 *
 * 生成器先给出一个全部 `throw new Error('not implemented')` 的骨架；
 * 我们把骨架填成真正的业务逻辑，并**删掉首行的生成标记**。
 *
 * 去掉标记是有意的：写盘策略默认只覆盖"自己也认领过"的文件（首行带生成标记），
 * 移除标记 = 显式宣告"这个文件归我管"，之后再跑 `nofaultctl generate` 就不会覆盖它。
 * 契约改动会重新生成 controller / dto，而这里的实现会原样保留——
 * 这正是代码生成能长期用下去的前提。
 *
 * 注意方法签名必须和 controller 生成出来的调用保持一致：
 * `ping()`、`getUser({ id })`、`createUser(dto)`，都是**同步返回**，
 * controller 那侧的 `Promise<…>` 由 async 自动包装。
 */
import { Injectable } from '@nofault/core';
import { ConflictException, NotFoundException } from '@nofault/rest';
import { CreateUserReq } from '../dto/create-user-req.dto';
import { DeleteUserReq } from '../dto/delete-user-req.dto';
import { GetUserReq } from '../dto/get-user-req.dto';
import { ListUsersReq } from '../dto/list-users-req.dto';
import { OkResp } from '../dto/ok-resp.dto';
import { UserPageResp } from '../dto/user-page-resp.dto';
import { UserResp } from '../dto/user-resp.dto';

interface StoredUser {
  id: number;
  name: string;
  email: string;
}

@Injectable()
export class UserService {
  private readonly users = new Map<number, StoredUser>();
  private seq = 0;

  ping(): OkResp {
    return { ok: 'pong' };
  }

  listUsers(req: ListUsersReq): UserPageResp {
    // 分页参数已由 DTO 的 @Min/@Max 校验过，这里可以放心用
    const start = (req.page - 1) * req.pageSize;
    const items = [...this.users.values()].slice(start, start + req.pageSize);
    return { total: this.users.size, page: items.length };
  }

  getUser(req: GetUserReq): UserResp {
    const user = this.users.get(req.id);
    if (!user) throw new NotFoundException(`user ${req.id} not found`);
    return { id: user.id, name: user.name, email: user.email };
  }

  createUser(req: CreateUserReq): UserResp {
    for (const existing of this.users.values()) {