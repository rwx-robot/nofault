/**
 * UserRespRepository —— 生成骨架 + **手工扩充**（已删掉生成标记，生成器不再覆盖）。
 *
 * 生成的部分：`findById` / `paginate` / `create` 三件套。
 * 手工补的部分：`findByEmail` / `remove` —— 业务查询千变万化，生成不出来，
 * 这层就该由人接管，而这正是"生成标记"机制存在的意义。
 */
import { Injectable } from '@nofault/core';
import { InjectRepository, Repository } from '@nofault/orm';
import { UserResp } from '../entities/user-resp.entity';

@Injectable()
export class UserRespRepository {
  constructor(@InjectRepository(UserResp) private readonly repo: Repository<UserResp>) {}

  findById(id: number): Promise<UserResp | undefined> {
    return this.repo.findById(id);
  }

  paginate(page: number, pageSize: number) {
    return this.repo.paginate(page, pageSize);
  }

  async create(entity: UserResp): Promise<UserResp> {
    return this.repo.save(entity);
  }

  /** 唯一性检查：创建用户前先按邮箱查一遍 */
  findByEmail(email: string): Promise<UserResp | undefined> {
    return this.repo.findOne({ email } as Partial<UserResp>);