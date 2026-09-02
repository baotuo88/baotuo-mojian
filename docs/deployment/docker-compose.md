# Docker Compose 部署

## 准备

要求 Docker Engine 与 Docker Compose 插件可用：

```bash
docker --version
docker compose version
```

Compose 默认读取仓库根目录的 `.env`。首次部署请先复制示例文件：

```bash
cp .env.example .env
```

然后编辑 `.env`，设置数据库密码和 AI 服务密钥，再启动：

```bash
./scripts/docker-compose-up.sh up -d --build
```

1. 将 `POSTGRES_PASSWORD` 换成长随机密码；
2. `DATABASE_URL` 无需手动填写，Compose 会根据 `POSTGRES_*` 自动生成；
3. 配置至少一个模型供应商密钥；
4. 使用域名时将 `CORS_ORIGIN` 与 `APP_BASE_URL` 改为最终 HTTPS 地址。

数据库密码若含 `@`、`:`、`/`、`#` 等 URL 特殊字符，必须在 `DATABASE_URL` 中进行百分号编码。

项目所在目录路径必须只包含英文和数字（例如 `/srv/baotuo-mojian`）。在包含中文的路径下执行 Compose 构建时，Docker Buildx 会话会报 `x-docker-expose-session-sharedkey ... non-printable ASCII characters` 并中断构建；将项目放在纯英文路径后即可正常构建。

## 启动

默认启动 Web、API 和 PostgreSQL，RAG 保持关闭：

```bash
./scripts/docker-compose-up.sh up -d --build
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
./scripts/docker-compose-up.sh up -d --build
```

API 容器会在启动前执行 Compose 专用 PostgreSQL baseline。该 baseline 只适用于明确全新的 Compose PostgreSQL 卷；不要把它用于已有库、恢复卷或来源不明的卷。迁移失败时 API 不会启动，应查看日志并停止继续写入：

```bash
docker compose logs api postgres
```

## 数据与备份

持久化数据位于 Docker volumes：

- `baotuo-mojian-app_postgres_data`
- `baotuo-mojian-app_image_storage`
- `baotuo-mojian-app_qdrant_storage`（启用 RAG 时）

停止服务但保留数据：

```bash
docker compose down
```

不要在没有备份和明确数据删除意图时执行：

```bash
docker compose down -v
```

PostgreSQL 逻辑备份示例：

```bash
docker compose exec -T postgres \
  pg_dump -U baotuo -d baotuo_mojian -Fc > baotuo-mojian.dump

test -s baotuo-mojian.dump
```

如果修改过默认数据库用户或库名，请同步替换命令参数。

## 公网部署边界

当前 Compose 只发布 Web 端口，API 和数据库不发布端口。对外提供服务时，还应在 Web 前增加 HTTPS 反向代理、防火墙、访问控制和备份监控。当前服务端没有完整多用户认证，不适合直接向不可信公网开放。
