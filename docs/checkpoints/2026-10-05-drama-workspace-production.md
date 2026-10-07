# 短剧工作台：制作恢复阶段验收

## 范围

从 `beta` 的 `8f15315` 创建
`feat/drama-workspace-production`。本阶段覆盖整集首帧/视频/配音任务恢复、视频付费提交保护、当前分镜状态投影、目标集数续规划和初次素材导入保护。

可导出项目 Markdown/JSON、单集字幕和剪辑草稿。MP4 拼接、混音、配乐和最终成片输出不属于本阶段交付，不应据此标记短剧平台全面上线。

## 验证结果

- `pnpm --filter @ai-novel/server build`
  通过，最终构建输出晚于全部本阶段服务端源文件修改。
- `pnpm --filter @ai-novel/client typecheck` 在最终轮询和门禁修改后通过。
- `node --experimental-strip-types --test client/tests/drama/productionProjection.test.mjs`：20/20。
- `node --test tests/dramaBatchRecovery.test.js tests/dramaPlanningProtection.test.js tests/dramaPipelineContract.test.js`（server 目录）：10/10；前两项自建独立临时 SQLite，台本到字幕/剪辑草稿流程使用可控测试依赖。
- `dramaVideoTaskLifecycle.test.js`：14/14，含真实临时 SQLite 的提交 CAS 竞争和提示词版本事务；最终日志
  `/tmp/drama-video-lifecycle-final.log`。
- `dramaForge.test.js`：9/9，含本机模拟 HTTP 视频和配音服务，未调用真实付费服务。
- `dramaDecoupling.test.js`：1/1，短剧业务不依赖小说业务实现。
- 合计 54 条定向用例通过；`git diff --check` 通过。

未重跑全仓测试、完整 Docker 镜像构建或 PostgreSQL 验证。本阶段无依赖、数据库 schema、迁移和 Docker 配置改动；新增任务状态语义仍需在真实通道和目标部署进行验收。

## 重要运行边界

- 支持当前单 API 实例 Docker 自部署。启动时扫描遗留任务，多 API 副本必须先引入持久租约，不能直接扩容。
- 暂停等待当前镜头完成，不能保证取消供应商已经接受的请求。
- 服务重启不自动重新发起付费任务；未知视频结果必须确认后重发。费用显示为估算，不替代供应商账单。
- 台本重生成后的全部派生产物失效传播、端到端成片输出仍是后续独立阶段，不能把任务恢复保护当作这些链路的完整验证。

## 用户验收

按仓库约定未运行浏览器、截图、Playwright 或手动 UI 验收。建议在测试项目中验收：创建项目与续分集、整集暂停/刷新/继续、视频真实生成与结果查询、SRT/剪辑草稿下载。

工作通过独立功能分支进入本地 beta；若以快进方式合入，测试对应相同文件树，可复用本记录，无需重复同一构建。未推广 main、推送远端或更新现有生产容器。

长期契约见
[短剧任务恢复与素材保护](../wiki/workflows/short-drama-production-recovery.md)。用户说明和日期发布记录同步维护，Wiki 不用作变更清单。
