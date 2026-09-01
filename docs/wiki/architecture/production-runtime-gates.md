# 生产运行时门禁

## Background

生产部署需要区分“进程仍能响应”和“数据库、迁移、Worker、外部模型均可工作”。如果把两者混成一个健康接口，平台可能在外部依赖短暂故障时持续重启进程，或在关键依赖尚未就绪时过早接入流量。

## Current Rule

- `GET /api/health/live` 是公开的最小 liveness 探针，只证明 Node/Express 进程能够返回响应；它不访问数据库、LLM、RAG 或 Worker。
- 兼容入口 `GET /api/health` 保留，但部署平台应优先使用 `/api/health/live`。
- 不得把 liveness 的 200 响应解释为数据库迁移、自动导演 Worker 或模型提供商已经 ready。
- 在形成完整 readiness 判定前，不新增名称为 ready 的假探针。未来 readiness 必须至少明确检查数据库连接和 migration 状态，并区分必需依赖与可降级依赖。
- `NODE_ENV=production` 时必须显式提供 `DATABASE_URL`；生产启动不得退回开发 SQLite 默认路径。
- 当前 `authMiddleware` 尚未实现真实用户认证，因此生产进程只能监听 `127.0.0.1`、`localhost` 或 `::1`。需要服务器部署时由同机反向代理接入；在认证闭环完成前，应用不得直接绑定 `0.0.0.0` 或 LAN 地址。
- `startServer({ port: 0 })` 用于嵌入式进程和隔离启动验收时，返回的 `port`、`url` 与 ready 日志必须使用操作系统实际分配的监听端口，不能继续暴露请求值 `0`。

## Failure Modes

- 将 LLM 或 Qdrant 检查放进 liveness 会使外部服务抖动触发应用重启。
- 将 liveness 当 readiness 使用，会在运行时迁移或后台恢复尚未完成时过早导入流量。
- 给 liveness 返回连接串、模型配置或异常堆栈会泄露部署信息；探针响应只能包含最小状态和时间戳。

## Related Modules

- `server/src/routes/health.ts`
- `server/src/app.ts`
- `server/src/config/database.ts`
- `server/src/db/runtimeMigrations.ts`
