/**
 * 数据层装配（**手写**）。
 *
 * `OrmModule.forFeature([UserResp])` 为每个实体注册 Repository Provider，
 * 生成的 `UserRespRepository` 再用 `@InjectRepository` 把它注入进来。