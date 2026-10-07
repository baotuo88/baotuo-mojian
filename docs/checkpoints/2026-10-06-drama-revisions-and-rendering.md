# 短剧台本版本与 MP4 成片验收

## 范围

从本地 `beta` 的 `3d8277b` 创建
`feature/drama-revision-render`。本阶段覆盖台本版本与历史稿、AI 迟到写入保护、事实重整、分镜/媒体失效传播、当前素材投影和持久 MP4 合成任务。未扩展多租户认证，也未运行真实付费模型。

## 验证

- 本机 `pnpm --filter @ai-novel/server build`
  成功，覆盖台本、事实、媒体和任务契约；最终渲染改动由下述 PostgreSQL
  Docker 构建覆盖。
- 前端 typecheck 与最终 Docker
  Web 构建成功，37 个短剧导航/草稿/制作/成片投影测试通过。没有浏览器、截图、Playwright 或手动 UI 验收，按项目约定留给用户。
- 真实临时 SQLite：版本保护 5、全制作链 1、规划保护 3、配音/首帧版本 6、视频生命周期 16、批量恢复 9、事实重整 7。
- 实际 SQLite
  SQL 迁移 5 条：保留旧台本与素材、日期默认值、外键/唯一键、双 schema 和三迁移链字段对齐。发现并修复非 Compose 历史链缺少角色图片字段的问题。
- Prompt 治理 9、短剧解耦 1、通道/注册契约 9 通过。通道测试中本机 HTTP 监听需要沙箱外执行；升级提示词版本后，只重跑受影响的注册断言，复用另外 8 条成功结果。
- Docker 中真实 FFmpeg 验收 15/15，0 跳过：合成 720×1280 两镜头视频，实际 1.4 秒配音纠正 0.8 秒元数据，成片 2.4 秒；确认中文字幕、配音覆盖首镜头原声、后续镜头保留原声、取消/恢复与受限输入。
- 合计 123 条相关测试通过。未重跑全仓测试。
- `check-prisma-schema-parity`、`git diff --check` 通过。

真实 FFmpeg 证据：`.codex-backups/drama-render-verification-pHZ2SK/`，包含
`tests.tap`、验证条件和源码 SHA256。测试容器无网络、无生产卷，只读挂载源码；未产生供应商费用。

## PostgreSQL 与镜像

独立无网络 PostgreSQL 容器执行完整 Compose 基线与全部增量迁移，在新迁移前插入旧台本和角色图片，升级后内容保留、默认版本与事实状态正常，新历史稿和成片任务可写入。测试数据库已备份并检查归档，再停止容器，未操作生产数据库。

- 报告：`/tmp/drama-postgres-migration-report.json`
- 测试备份：`/tmp/drama-revision-migration-dfa47dec.dump`（549903 bytes）
- 最终 API：`sha256:d2230d5be9d682270e0126b25d33b26d677b4fe6e3e19533589b4c3212c6e53f`
- Web：`sha256:45574350de257be1430fb0abc31c58c5a19bd2fe98947aeb140d55f467c006d8`
- API 镜像与工作树全部 `server/src`
  TS/Prisma/SQL 文件内容哈希一致：`03d0bf32705fdeff6fbbff8679f7f901a2aab78e2f2cd70ceb392a41cf2dc6fb`。最终成片源码与已通过的 FFmpeg 验收相同，复用该证据，未再次重复合成。

第一次镜像构建安装 FFmpeg 后，补充真实配音时长、内嵌音频导入和磁盘预算边界，因此仅增量重建 API；前端没有后续修改，不重复构建。构建仍有既有大体积前端 chunk 提示，构建成功。

## 运行边界

- 支持当前单 API Docker 自部署；多副本前需全局工作租约。
- 取消合成不等于取消供应商已接受的付费任务。服务重启不自动重发付费请求。
- 版本失效保留历史作品与文件。成片以真实音频时长确定最终时间轴，独立 SRT/剪辑草稿仍依据已记录的配音时长，可与最终视频时长不同。
- 模型生成内容质量、角色视觉一致性和真实通道计费仍需有明确费用范围的实测；不据本次 fixture 验证宣称全面稳定上线。

长期规则见
[台本版本与成片交付](../wiki/workflows/short-drama-revisions-and-rendering.md)。发布说明与 README 按 2026-10-06 日期维护。

## 本地 beta 与部署结果

功能提交 `c6ed6e5` 已快进合入本地
`beta`，文件树与上述验证一致，因此复用同一构建和测试证据。未推广
`main`、推送远端或发布桌面包。

现有 Docker API/Web 已切换为上述最终镜像，API、Web、PostgreSQL 均健康。实际地址
`http://localhost:8080/drama`
返回 200；健康接口、项目列表和历史稿接口正常，成片接口可识别不存在的集并返回 404。实际下发的短剧页面资源含版本保存及 MP4 界面代码；前端 API 为拆分资源，未把仅查找单个 bundle 的字符串当成整体接口验证。

更新前停止 API/Web 并生成完整备份，数据库归档可列出、媒体归档可读、SHA256 已记录：

- 备份目录：`.codex-backups/drama-revision-render-20261006-otn6dxzd/`
- 数据库：`database.dump`（5421380 bytes）
- 图片和媒体：`image-storage.tar.gz`、`media-storage.tar.gz`
- 更新后作品数量一致：1 部小说、80 章，漫画和短剧项目当时均为 0。
- 章节正文与短剧台本内容哈希更新前后一致，证明此次升级未改写既有作品。
- 完整记录：备份目录内
  `verification.json`，含运行镜像、健康状态、数量与内容哈希检查。

此节是部署验收记录，没有新增用户可见功能，因此不重复添加发布说明。长期契约已写入相关 Wiki。
