# Docker Compose 部署边界

## Background

宝拓墨间服务端尚未提供完整的多用户认证，生产 API 不能直接发布到公网端口。容器部署还必须保证 PostgreSQL 迁移先于应用启动，并将作品数据库、图片资产和可选向量数据放在持久化卷中。

## Decision

根目录 `compose.yml` 是全栈容器部署入口，包含：

- `web`：唯一对外入口，提供前端并将 `/api` 同源代理到内部 API；
- `api`：仅加入内部网络，不发布宿主机端口；
- `postgres`：正式数据库，通过健康检查后 API 才启动；
- `qdrant`：可选 `rag` profile，默认不启动。

API 容器启动时先执行 Compose 专用 `migrations.compose` baseline。迁移失败时容器停止，不允许带着未知数据库结构继续启动。该 baseline 只允许全新 Compose PostgreSQL 卷使用；已有库必须沿用正式 `migrations` 链。

## Current Rule

- 生产 API 继续默认拒绝非回环监听。只有 Compose 这种 API 端口未发布、可信反向代理是唯一入口的环境，才允许设置 `TRUSTED_REVERSE_PROXY=true`。
- 不得给 `api`、`postgres` 或 `qdrant` 增加公网 `ports`。运维诊断使用 `docker compose exec`。
- 浏览器只访问 Web 同源 `/api`，不依赖容器名或宿主机 API 端口。
- `postgres_data`、`image_storage` 和 `qdrant_storage` 是持久化卷。`docker compose down` 不删除数据；执行 `down -v` 会删除卷，属于破坏性操作，必须先备份并取得明确批准。
- `AI_NOVEL_COMPOSE_BASELINE=true` 是 Compose 的显式新库标记，不是旧库升级开关。Compose 项目应使用独立的新卷名；已有 PostgreSQL 库不得复用该标记。
- Compose 项目名固定为 `baotuo-mojian-app`，与临时验证项目（`baotuo-mojian`、`baotuo-mojian-final` 等）隔离，避免部署意外复用遗留验证卷。
- `DATABASE_URL` 在 Compose 中由 `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB` 自动拼装，密码只需在 `.env` 维护一处；不要在 `.env` 里再手写容器内 `DATABASE_URL`，两处不一致会导致认证失败。
- 项目目录路径必须为纯 ASCII。中文路径会让 Compose/Buildx 构建会话在 `x-docker-expose-session-sharedkey` 头上报非 ASCII 字符错误；验证过的可用组合是 Compose v2.40.3 + Buildx 0.36.1。
- `.env.example` 同时作为 Compose 默认环境文件，保存密码和供应商密钥。部署时必须替换占位密码；真实环境建议通过部署系统注入等效变量，避免把真实密钥提交到仓库。
- RAG 默认关闭。只有 Embedding 配置完整时才使用 `--profile rag` 并设置 `RAG_ENABLED=true`。
- Compose 适用于单实例或受控内网 Beta。面向不可信公网用户前，仍需增加真实登录鉴权、HTTPS 入口、限流和备份监控。

## Failure Modes

- `.env` 中 `POSTGRES_PASSWORD` 与手写 `DATABASE_URL` 密码不一致：API 报 P1000 认证失败。Compose 场景下应删除手写 `DATABASE_URL`，由 `POSTGRES_*` 拼装。
- `.env` 修改密码后连接旧卷失败：PostgreSQL 首次初始化后密码固化在卷中，改 `.env` 不会改已有库密码；需要新密码时先备份再重建卷或用 `ALTER USER`。
- 项目路径含中文：Compose 构建报 `x-docker-expose-session-sharedkey ... non-printable ASCII`，改用纯英文路径即可。
- PostgreSQL 密码包含 URL 特殊字符但 `DATABASE_URL` 未进行百分号编码：API 无法连接数据库。
- 只设置 `RAG_ENABLED=true` 却未启用 `rag` profile 或未配置 Embedding：检索健康检查失败。
- 将 API 端口直接映射到宿主机：绕过 Web 入口并暴露无认证接口。
- 使用 `docker compose down -v` 清理环境：同时删除数据库和图片卷。
- 修改迁移后直接复用生产卷：应先备份，再在副本上验证 `prisma migrate deploy`。

## Related Modules

- `compose.yml`
- `Dockerfile.api`
- `Dockerfile.web`
- `infra/docker/api-entrypoint.sh`
- `infra/nginx/ai-novel-web.conf`
- `server/src/config/database.ts`
- `server/src/config/serverNetwork.ts`
