# 示例：v0.5.0 data-user-api

**契约一份 → controller / service / module / dto / entity / repository**，
并且真的接上了 ORM（事务、迁移）与缓存（击穿保护）。

## 跑起来

```bash
pnpm example v0.5.0-data-user-api
pnpm example v0.5.0-data-user-api PORT=3350
```

## 试一试

```bash
# 建用户（自增 id）
curl -s -X POST http://127.0.0.1:3000/api/user/users \
  -H 'content-type: application/json' -d '{"name":"alice","email":"a@example.com"}'

# 邮箱重复 -> 409（唯一性检查在事务里）
curl -s -X POST http://127.0.0.1:3000/api/user/users \
  -H 'content-type: application/json' -d '{"name":"bob","email":"a@example.com"}'

# 读：第一次回源，之后走缓存；删除会同时失效缓存
curl -s http://127.0.0.1:3000/api/user/users/1
curl -s -X DELETE http://127.0.0.1:3000/api/user/users/1
curl -s http://127.0.0.1:3000/api/user/users/1     # 404（不是幽灵数据）

# 分页 + query 校验
curl -s "http://127.0.0.1:3000/api/user/users?page=1&pageSize=10"
curl -s "http://127.0.0.1:3000/api/user/users?page=0&pageSize=10"    # 422
```

## 文件说明