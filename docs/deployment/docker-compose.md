# Docker Compose 部署

## 准备

要求 Docker Engine 与 Docker Compose 插件可用：

```bash
docker --version
docker compose version
```

API 与 Web 构建使用 Node.js 22，保持与 CI 的受支持运行时一致。API 镜像包含中文字体，用于漫画对白植字与参考图标签；原生模块构建复用镜像内匹配的 Node 头文件，避免再次联网下载。

Compose 默认读取仓库根目录的 `.env`。首次部署请先复制示例文件：

```bash
cp .env.example .env
```

然后编辑 `.env`，设置数据库密码和 AI 服务密钥，再启动：

```bash
docker compose up -d --build
```

若 Docker Hub 拉取 Node 基础镜像超时，可先使用 AWS 公共 Docker 镜像库构建同一 Node 22 环境，再启动服务：

```bash
docker compose build \
  --build-arg NODE_IMAGE=public.ecr.aws/docker/library/node:22-bookworm-slim \
  --build-arg NODE_BUILD_IMAGE=public.ecr.aws/docker/library/node:22-bookworm api web
docker compose up -d --no-build
```

1. 将 `POSTGRES_PASSWORD` 换成长随机密码；
2. `DATABASE_URL` 无需手动填写，Compose 会根据 `POSTGRES_*` 自动生成；
3. 配置至少一个模型供应商密钥；
4. 使用域名时将 `CORS_ORIGIN` 与 `APP_BASE_URL` 改为最终 HTTPS 地址。

默认配置直接把数据库密码放入连接 URL，建议使用至少 32 位随机十六进制密码。若必须使用 `@`、`:`、`/`、`#` 等特殊字符，请通过 Compose override 显式设置 `api.environment.DATABASE_URL` 并对密码百分号编码；仅修改 `.env` 的 `DATABASE_URL` 不会覆盖默认配置生成的地址。

项目所在目录路径必须只包含英文和数字（例如 `/srv/baotuo-mojian`）。在包含中文的路径下执行 Compose 构建时，Docker Buildx 会话会报 `x-docker-expose-session-sharedkey ... non-printable ASCII characters` 并中断构建；将项目放在纯英文路径后即可正常构建。

如宿主机 Compose 版本过旧导致构建异常，可临时使用 `./scripts/docker-compose-up.sh up -d --build`（内部会自动 unset `SSH_AUTH_SOCK`），根治方案仍是升级 Compose 插件。

## 启动

默认启动 Web、API 和 PostgreSQL，RAG 保持关闭：

```bash
docker compose up -d --build
```

查看状态：

```bash
docker compose ps
docker compose logs -f api
```

默认访问地址：

```text
http://localhost:8080
```

健康检查：

```bash
curl -fsS http://localhost:8080/api/health/live
```

## 启用 RAG

先在 `.env` 中设置：

```dotenv
RAG_ENABLED=true
EMBEDDING_PROVIDER=openai
EMBEDDING_MODEL=text-embedding-3-small
OPENAI_API_KEY=your-key
```

然后启用 `rag` profile：

```bash
docker compose --profile rag up -d --build
```

## 更新

拉取或替换源码后执行：

```bash
docker compose up -d --build
```

API 容器启动前执行 Compose 专用 PostgreSQL 迁移。首次 baseline 只应用于全新卷；使用本部署方式初始化的数据库会通过 `_prisma_migrations` 记录跳过 baseline，并应用后续迁移。不要将来源不明、桌面 SQLite 转换而来或缺少迁移记录的数据库直接接入此入口。恢复相同部署的备份时必须连同迁移记录恢复，并先在独立环境验证。迁移失败时 API 不会启动：

```bash
docker compose logs api postgres
```

## 数据与备份

默认项目名为 `baotuo-mojian-app`，使用 `-p` 或 `COMPOSE_PROJECT_NAME` 时卷名前缀随之改变。数据库与两份文件存储属于同一份完整备份：

| 卷 | 容器路径 | 内容 |
| --- | --- | --- |
| `baotuo-mojian-app_postgres_data` | PostgreSQL `/var/lib/postgresql/data` | 小说、漫画资料、任务、图片版本、导出登记和配置 |
| `baotuo-mojian-app_image_storage` | API `/app/storage/generated-images` | 通用图片存储 |
| `baotuo-mojian-app_media_storage` | API `/app/server/storage` | 漫画角色/格子/植字/导出等 `generated-images`，以及 `generated-media` 和其他文件素材 |
| `baotuo-mojian-app_qdrant_storage` | Qdrant `/qdrant/storage` | 启用 RAG 时的向量索引 |

只备份数据库会保留图片 URL，却丢失实际漫画图片和导出文件。不要合并或更换现有卷的挂载路径来“整理目录”，否则会隐藏旧素材。

停止服务但保留数据：

```bash
docker compose down
```

`docker compose down -v` 会删除卷。任何删卷、重置数据库、覆盖恢复前，都必须取得明确授权，保存具体备份路径并验证备份可读取。

以下示例通过暂停 API/Web 写入，取得相互一致的数据库与文件快照。若另有后台写入者，先一并暂停。数据库用户/库名若不同，请替换命令中的默认值：

```bash
(
set -eu
comic_backup_dir="./backups/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$comic_backup_dir"
docker compose stop api web
docker compose exec -T postgres \
  pg_dump -U baotuo -d baotuo_mojian -Fc > "$comic_backup_dir/database.dump"
docker compose run --rm --no-deps --entrypoint tar api \
  -C /app/storage/generated-images -czf - . > "$comic_backup_dir/image-storage.tar.gz"
docker compose run --rm --no-deps --entrypoint tar api \
  -C /app/server/storage -czf - . > "$comic_backup_dir/media-storage.tar.gz"

test -s "$comic_backup_dir/database.dump"
test -s "$comic_backup_dir/image-storage.tar.gz"
test -s "$comic_backup_dir/media-storage.tar.gz"
docker compose exec -T postgres pg_restore --list \
  < "$comic_backup_dir/database.dump" > "$comic_backup_dir/database.contents.txt"
tar -tzf "$comic_backup_dir/image-storage.tar.gz" > "$comic_backup_dir/image-files.txt"
tar -tzf "$comic_backup_dir/media-storage.tar.gz" > "$comic_backup_dir/media-files.txt"
sha256sum "$comic_backup_dir/database.dump" "$comic_backup_dir/image-storage.tar.gz" \
  "$comic_backup_dir/media-storage.tar.gz" > "$comic_backup_dir/SHA256SUMS"
docker compose start api web
)
```

任何命令失败时保留现有数据库和卷，先处理备份错误，不执行覆盖或清理。将备份移到不同磁盘或受控远程存储，并另行保护 `.env` 和外部加密密钥；不要把密钥提交 Git。启用 RAG 时也要保存 Qdrant 官方 snapshot，或暂停 Qdrant 后取得其卷快照，并记录版本。

恢复演练使用独立 Compose 项目、新 PostgreSQL 数据库和新文件卷，先恢复逻辑数据库备份及两份文件归档，再启动相同代码版本。检查小说章节数、漫画格子数、抽样原图/植字、整话全部导出切片和模型配置可读性；成功后才能制定生产切换步骤。不要在唯一生产卷上做恢复演练。

## 独立漫画部署验证

`infra/docker/compose.comic-smoke.yml` 只用于全新测试项目，要求 Compose 2.24.4 或更新版本。它清空服务 `env_file`，不会向测试容器传入用户的 `.env` 或模型密钥；数据库和文件卷由唯一项目名隔离。

创建独立配置，不复用生产项目名：

```bash
comic_smoke_dir="$(mktemp -d)"
comic_smoke_project="comic-smoke-$(date +%Y%m%d%H%M%S)"
cat > "$comic_smoke_dir/smoke.env" <<'ENV'
POSTGRES_USER=comic_smoke
POSTGRES_PASSWORD=local-disposable-smoke-password
POSTGRES_DB=comic_smoke
SMOKE_WEB_PORT=18089
ENV
comic_compose() {
  docker compose --env-file "$comic_smoke_dir/smoke.env" -p "$comic_smoke_project" \
    -f compose.yml -f infra/docker/compose.comic-smoke.yml "$@"
}
comic_compose config --quiet
comic_compose build api web
comic_compose up -d --no-build --wait --wait-timeout 180 postgres api web
comic_compose exec -T api node /app/server/scripts/comic-postgres-smoke.cjs
curl -fsS http://127.0.0.1:18089/api/health/live
comic_compose stop
```

测试使用真实 PostgreSQL 17、Prisma 事务、图片上传、生图落盘、中文植字和整话切片；AI 输出由内存 fixture 提供，脚本禁止外部 HTTP，不调用付费模型。它覆盖原创/文本/小说资料入口、章节映射、参考图 CAS 和导出快照。脚本只接受 `comic_smoke` 前缀库名和明确测试开关，并拒绝已有小说或漫画数据的库。再次运行完整测试应创建新项目，不清空上一次数据库。

停止后保留测试卷用于诊断。GitHub 的 `Comic Compose PostgreSQL Smoke` 工作流在 `beta`、`main` 和相关 PR 上执行相同部署链路；通用单元测试使用独立 SQLite，不能替代 PostgreSQL 部署验证。

## 公网部署边界

当前 Compose 只发布 Web 端口，API 和数据库不发布端口。对外提供服务时，还应在 Web 前增加 HTTPS 反向代理、防火墙、访问控制和备份监控。当前服务端没有完整多用户认证，不适合直接向不可信公网开放。
