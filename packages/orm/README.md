# @nofault/orm

数据访问：实体映射、Repository、查询构造器、事务、迁移。

**引入版本**：v0.5.0

## 为什么这么设计

- **方言只生成字符串，数据源是唯一 IO 边界** → 两边的单测完全独立
- `MemoryDataSource` 开箱可跑（含迷你 SQL 引擎，供迁移用），`SqlDataSource` 不绑驱动
- `save()` 把自增主键上的 0 视为"未设置"：TS 里 `new User().id` 恒为 0
- 比较前归一化布尔——库里存 1/0，实体上是 true/false，否则"存得进取不出来"

## 最快上手

```ts
import { Entity, Column, PrimaryGeneratedColumn, Repository, InjectRepository } from '@nofault/orm';

@Entity({ table: 'users' })
class User {
  @PrimaryGeneratedColumn()
  id!: number;
  @Column({ name: 'email' })
  email!: string;
}

class UserService {
  constructor(@InjectRepository(User) private repo: Repository<User>) {}
  find(email: string) { return this.repo.findOne({ email }); }
}
```

## 注意

只给"被当作响应类型"的类型建表——请求 DTO 是传输对象，给它建表没意义。

## 相关文档

- 架构说明 → [`docs/v0.5.0/ARCHITECTURE.md`](../../docs/v0.5.0/ARCHITECTURE.md)
- 变更记录 → [`docs/v0.5.0/CHANGELOG.md`](../../docs/v0.5.0/CHANGELOG.md)
