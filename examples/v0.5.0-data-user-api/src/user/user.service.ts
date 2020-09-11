/**
 * UserService —— **手写**的业务实现（已删掉生成标记，生成器不再覆盖它）。
 *
 * 这里演示 v0.5.0 的四个能力：
 * 1. **Repository**：类型化的增删改查与分页
 * 2. **事务**：创建用户时若邮箱重复，整段回滚
 * 3. **缓存**：`getOrSet` 挡住缓存击穿（并发同 key 只回源一次）
 * 4. **生成的数据层**：`UserRespRepository` 就是契约生成的骨架，直接拿来用
 */
import { Injectable } from '@nofault/core';
import { CACHE, type Cache } from '@nofault/cache';
import { Inject } from '@nofault/core';
import { NotFoundException, ConflictException } from '@nofault/rest';
import { CreateUserReq } from '../dto/create-user-req.dto';
import { GetUserReq } from '../dto/get-user-req.dto';
import { ListUsersReq } from '../dto/list-users-req.dto';
import { OkResp } from '../dto/ok-resp.dto';
import { UserPageResp } from '../dto/user-page-resp.dto';