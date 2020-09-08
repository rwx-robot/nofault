/**
 * 根模块（**手写**）。
 *
 * 生成器不产出根模块，原因很实在：根模块要决定用哪个 DataSource、哪个缓存实现，
 * 这些是部署决策，契约里没有——生成器不该猜。
 *
 * 于是 `app.module.ts` 与 `data.module.ts` 都是手写的，
 * 而 controller / dto / entity / repository 由契约生成。