# 漫画 Docker 自部署候选版验收

## 范围与基线

用户选择个人或团队 Docker 自部署。基于本地 `beta` 的 `1a3ac44`，开发分支为 `feat/comic-release-hardening`。本阶段补齐原创/文本资料整理、续话上下文、参考图片发布与传递、服务重启后的参考图恢复入口、导出租约、图片传输限制和独立 PostgreSQL 部署验证。

不新增多租户注册系统；不访问既有作品数据；未调用真实付费模型。数据库测试均使用新建临时 SQLite 或独立 Compose 项目的测试 PostgreSQL。没有为测试删除现有业务数据库、卷或图片。

## 代码验证

- 最终 `pnpm --filter @ai-novel/server build` 通过，包含最后的参考图总量预算与输出编码修复。证据：`/tmp/comic-release-server-build.log`。
- 前端 `pnpm --filter @ai-novel/client typecheck` 通过；随后只修改测试与文档，复用该证据。漫画引导/生产与参考图恢复的 21 条代码行为测试通过。
- 漫画规划、资料承接、图片/参考图发布、参考装配、导出租约与下载边界定向测试通过。先前 provider mock 不兼容 Prisma 代理的两项失败已修正测试隔离方式，并通过最终 provider 回归。
- Provider 最终 4/4：完整上传本地与 URL 参考图、图片编码标记、未接入通道与数量限制、取消传播、逐张下载剩余预算。证据：`/tmp/comic-release-provider-final.log`。
- 真实 HTTP 漫画边界 3/3：空请求与参数校验、两类图片上传限额、版本与排除参数传递。证据：`/tmp/comic-release-http.log`。
- 共享图片设置与小说封面 HTTP 4/4；执行围栏、图片存储、超时设置的 18 条独立回归通过。证据：`/tmp/comic-release-shared-http.log`、`/tmp/comic-release-image-final.log`。
- 批量生产、模块隔离、确认模型、Prompt Registry 与调用器回归通过，2 条既有条件跳过。证据：`/tmp/comic-release-integration.log`。本机端口测试首次受沙箱限制，提升权限后单独重跑通过。
- 文档 manifest 和 SQLite/PostgreSQL schema parity 通过，无数据库模型变更。

以上分组日志包含失败诊断和后续修复记录。最终证据优先使用对应 `final`、`http` 与 `shared-http` 日志；未重复已被相同代码树覆盖的全仓库检查。

## Docker 与 PostgreSQL 实测

- API、Web 最终镜像均构建成功。Node.js `22.23.3`、PostgreSQL `17.11`；服务启动、Compose 迁移及三项容器健康检查通过。
- 本机 Docker Hub 连续超时，Debian 工具链下载出现 502；最终使用 AWS 公共 Docker 镜像库的 `node:22-bookworm` 构建、`node:22-bookworm-slim` 运行。完整构建证据为 `/tmp/comic-release-docker-final.log`；仓库保留官方 Node 22 默认值，部署指南提供镜像源覆盖命令。
- 独立项目 `comic-release-smoke-av_bdxm0` 使用专用卷和 `comic_smoke_verified` 空测试库。先前样例数据留在原测试库，未清空数据库。
- `server/scripts/comic-postgres-smoke.cjs` 成功覆盖原创、文本及小说资料入口，小说第 2 章映射、参考图版本与迟到提交保护、10 格图片、中文植字及整话 2 张切片；8 次结构化 Prompt fixture、12 次图片 fixture，外部模型 HTTP 调用为 0。
- 经真实 Nginx 入口完成 7 项 HTTP 检查：首页、前端资源、健康接口、漫画列表、带 revision 的 JPEG 素材、两张可解码且尺寸匹配的导出文件。证据：`/tmp/comic-release-postgres-smoke.log`。
- 镜像内图片 provider 源码 SHA-256 与工作树一致：`41beb02e0b123fc8ff43474f7b1f3f09eabbd220201b9fa9ff374ebae9ce1359`。
- 最初字体断言错误地要求默认首选字体是 CJK，改为检查已安装的中文回退字体；样例也调整为满足 Prompt 至少 10 格的实际合同。这两项为验收脚本修正，最终使用新空库重跑通过，无需重复已构建的应用镜像。

测试容器在验收后停止，测试卷保留供诊断。用户现有生产容器和作品数据库保持原状。GitHub 工作流已配置相同验证，但本阶段未推送或触发远端 CI。

## 验收边界

容器停止补充检查：首次 API 直接作为 PID 1 时退出码为 137；独立修复分支加入 `api.init: true` 后，复用相同镜像和测试数据重新启动，既有 Compose 迁移记录被正确沿用，健康检查通过。再次停止 API 返回 143（SIGTERM），`OOMKilled=false`、`HostConfig.Init=true`。该配置修复未改变应用代码，因此复用上述完整流程结果，不重建镜像或重复业务流程测试。

按仓库规则，未进行浏览器、截图或人工 UI 验证，页面验收由用户完成。确定性 AI fixture 只能验证运行合同、存储与完整流程，不能证明实际图像模型的角色一致性、对白清晰度、供应商多图支持和计费行为。真实模型小批量试用仍是投入日常生产前的验收项。

本地 `beta` 若通过快进合入同一代码树，复用本阶段证据；不重复昂贵构建。不提升 `main`，不推送远端或发布公共镜像。

## 长期知识

- `docs/wiki/workflows/comic-source-planning-integrity.md`
- `docs/wiki/workflows/comic-image-export-consistency.md`
- `docs/wiki/workflows/comic-reference-recovery-projection.md`
- `docs/wiki/workflows/image-transfer-boundaries.md`
- `docs/wiki/architecture/docker-compose-deployment.md`
- `docs/deployment/docker-compose.md`
