/**
 * ORM 的依赖注入装配。
 *
 * `OrmModule.forRoot({ dataSource })` 提供全局 DataSource；
 * `OrmModule.forFeature([User])` 为每个实体注册一个 Repository Provider，