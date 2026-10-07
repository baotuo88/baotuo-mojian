# Docker Compose 部署边界

## Background

宝拓墨间服务端尚未提供完整的多用户认证，生产 API 不能直接发布到公网端口。容器部署还必须保证 PostgreSQL 迁移先于应用启动，并将作品数据库、通用图片、漫画/媒体文件和可选向量数据放在持久化卷中。

## Decision

根目录 `compose.yml` 是全栈容器部署入口，包含：

- `web`：唯一对外入口，提供前端并将 `/api` 同源代理到内部 API；
- `api`：通过内部网络连接数据库，另有供应商调用所需的出网网络，不发布宿主机端口；
- `postgres`：正式数据库，通过健康检查后 API 才启动；
- `qdrant`：可选 `rag` profile，默认不启动。

API 容器启动时先执行 Compose 专用 `migrations.compose`
链。首次 baseline 仅用于全新卷；同一部署创建的数据库在后续启动时依靠
`_prisma_migrations`
跳过 baseline、执行新增迁移。来自同一迁移链的完整备份可在独立新卷恢复验证，但必须保留迁移记录。正式
`migrations`
链、桌面 SQLite 或来源不明的数据库不能直接换成此入口。迁移失败时容器停止，不允许带着未知数据库结构继续启动。

## Current Rule

- 生产 API 继续默认拒绝非回环监听。只有 Compose 这种 API 端口未发布、可信反向代理是唯一入口的环境，才允许设置
  `TRUSTED_REVERSE_PROXY=true`。
- 不得给 `api`、`postgres` 或 `qdrant` 增加公网 `ports`。运维诊断使用
  `docker compose exec`。
- 浏览器只访问 Web 同源 `/api`，不依赖容器名或宿主机 API 端口。
- `postgres_data`、`image_storage`、`media_storage` 和可选 `qdrant_storage`
  是持久化卷。漫画原图、植字和导出位于 API
  `/app/server/storage/generated-images`，属于 `media_storage`；通用图片路径
  `/app/storage/generated-images` 属于
  `image_storage`。备份必须覆盖数据库和两份文件卷，不能根据卷名推断漫画已包含在通用图片备份中。
- 数据库与文件备份需要暂停应用写入，命令示例必须失败即停止，再检查归档可读性和校验和。`docker compose down`
  不删除卷；`down -v` 属于破坏性操作，必须先备份、验证并取得明确批准。
- `AI_NOVEL_COMPOSE_BASELINE=true`
  选择 Compose 迁移链，不表示每次启动都创建新库，也不授权重置已有数据。禁止将其他迁移来源的生产库强行接入此链。
- 默认生产项目名为 `baotuo-mojian-app`；验证必须显式使用独立
  `-p comic-smoke-...` 项目名、新数据库与新卷，避免复用任何生产资源。
- `DATABASE_URL` 在 Compose 中由
  `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB` 自动拼装，密码只需在 `.env`
  维护一处；不要在 `.env` 里再手写容器内
  `DATABASE_URL`，两处不一致会导致认证失败。
- 项目目录路径必须为纯 ASCII。中文路径会让 Compose/Buildx 构建会话在
  `x-docker-expose-session-sharedkey`
  头上报非 ASCII 字符错误；验证过的可用组合是 Compose v2.40.3 + Buildx 0.36.1。
- `.env.example` 仅为配置模板，复制为 `.env`
  后供 Compose 使用。部署时替换占位密码，避免把真实密钥提交到仓库。独立验证 override 清空
  `env_file`，只接受显式测试配置。
- API 和 Web 构建使用受支持的 Node.js
  22，与 CI 保持一致；API 镜像携带 CJK 字体和 fontconfig，否则中文漫画植字可能缺字。API 构建阶段使用带编译工具的官方 bookworm 镜像，运行阶段使用 slim 镜像；原生依赖复用镜像自带的 Node 头文件，避免重复下载工具链和头文件。
- API 使用 `init: true`
  转发停止信号并回收子进程。直接让无信号处理器的 Node 成为 PID
  1，会使容器停止依赖超时后的 SIGKILL。验收应在空闲状态停止 API，允许正常退出或 SIGTERM 退出，拒绝 SIGKILL/OOM；此规则不意味着上游模型会撤销已发出的计费请求，持久任务仍依靠租约恢复。
- RAG 默认关闭。只有 Embedding 配置完整时才使用 `--profile rag` 并设置
  `RAG_ENABLED=true`。
- Compose 适用于单实例或受控内网 Beta。面向不可信公网用户前，仍需增加真实登录鉴权、HTTPS 入口、限流和备份监控。

## Failure Modes

- `.env` 中 `POSTGRES_PASSWORD` 与手写 `DATABASE_URL`
  密码不一致：API 报 P1000 认证失败。Compose 场景下应删除手写 `DATABASE_URL`，由
  `POSTGRES_*` 拼装。
- `.env` 修改密码后连接旧卷失败：PostgreSQL 首次初始化后密码固化在卷中，改
  `.env` 不会改已有库密码；需要新密码时先备份再重建卷或用 `ALTER USER`。
- 项目路径含中文：Compose 构建报
  `x-docker-expose-session-sharedkey ... non-printable ASCII`，改用纯英文路径即可。
- PostgreSQL 密码包含 URL 特殊字符但 `DATABASE_URL`
  未进行百分号编码：API 无法连接数据库。
- 只设置 `RAG_ENABLED=true` 却未启用 `rag`
  profile 或未配置 Embedding：检索健康检查失败。
- 将 API 端口直接映射到宿主机：绕过 Web 入口并暴露无认证接口。
- 使用 `docker compose down -v` 清理环境：同时删除数据库和图片卷。
- 修改迁移后直接复用生产卷：应先备份，再在副本上验证 `prisma migrate deploy`。
- 只备份数据库或
  `image_storage`：恢复后漫画版本记录存在，但参考素材、原图或导出文件丢失。必须同时恢复
  `media_storage`。
- 中文字体验证：`fc-match :lang=zh`
  的首选字体仍可能是拉丁字体，不能单凭该输出判定缺少中文支持。先用
  `fc-list :lang=zh family`
  检查 CJK 回退字体，再用真实中文植字与导出流程验证渲染。
- 用 SQLite 单元测试通过代替 PostgreSQL 部署测试：关系过滤、事务隔离和迁移差异可能遗漏。`comic-compose.yml`
  CI 使用 Compose 的 PostgreSQL
  17、真实文件与假 AI 响应验证完整漫画服务流；`beta` 和 `main` 均触发。

## Related Modules

- `compose.yml`
- `Dockerfile.api`
- `Dockerfile.web`
- `infra/docker/api-entrypoint.sh`
- `infra/docker/compose.comic-smoke.yml`
- `server/scripts/comic-postgres-smoke.cjs`
- `.github/workflows/comic-compose.yml`
- `infra/nginx/ai-novel-web.conf`
- `server/src/config/database.ts`
- `server/src/config/serverNetwork.ts`
- [部署与完整备份操作](../../deployment/docker-compose.md)
