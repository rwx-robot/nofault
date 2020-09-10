/**
 * UserModule —— 生成骨架 + **手工接线**（已删掉生成标记）。
 *
 * 手工加的是 `imports: [DataModule]`：service 依赖 Repository，
 * 而 Repository 由数据层模块提供。生成器不知道你有哪些基础设施模块，