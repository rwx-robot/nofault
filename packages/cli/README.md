# @nofault/cli

`nofaultctl` 命令行：脚手架、生成、校验、路由、OpenAPI、热重载、环境自检。

**引入版本**：v0.10.0

## 为什么这么设计

- 子命令刻意少而准，**不是一个什么都塞的瑞士军刀**
- `doctor` 会解析 tsconfig 的 `extends`：不解析会大面积误报"装饰器元数据没开"