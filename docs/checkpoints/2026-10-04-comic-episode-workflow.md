# 漫画单话生产阶段验收记录

## 范围

基于 `0d5797e` 的小说可靠性修复，开发分支 `feat/comic-episode-workflow` 完成小说到一话漫画的引导、源章节映射、规划替换保护、持久批量任务、图片版本、完整导出和下载历史。未增加数据库迁移；未调用用户配置的真实模型或修改现有作品数据库。

## 验证证据

- 小说基线复用 `0d5797e` 完成后的 fast 1441/1441、前端 224 通过/1 条件跳过、Prompt 48 通过/2 条件跳过、生产启动 3/3、shared/server build、client typecheck、Schema parity。基线检查后工作区干净，漫画从该提交建立分支。
- 漫画最终服务端构建：`pnpm --filter @ai-novel/server build` 通过。
- 最终前端类型检查：`pnpm --filter @ai-novel/client typecheck` 通过。
- 后端定向 122 项：120 通过、2 条既有条件跳过。包括漫画 planning/publication/batch/export、adaptation 边界、execution fence、agent cancellation、图片配置/确认模型、Prompt Registry 与 runner。测试在新建临时 SQLite 和临时图片目录运行，HTTP 用本机临时端口。
- 前端 18 项：确认请求竞争、重复提交、失败显式重试、按话恢复、同任务续跑、确认范围/模型、旧任务新开入口、原稿替换确认、保留旧图、完整导出与下载列表，通过。
- docs manifest 与 `git diff --check` 通过。

本地日志：`/tmp/comic-server-build-final.log`、`/tmp/comic-client-typecheck-final.log`、`/tmp/comic-integration-final.log`、`/tmp/comic-client-behavior-final.log`。日志是本次会话证据，不作为长期运行依赖。

## 验收边界

按仓库规则不运行浏览器、Playwright、截图或人工 UI 验证，页面验收交给用户。没有以用户额度调用真实图像模型，因此角色一致性、对白清晰度与模型实际成功率需要使用真实项目验收。未运行 Docker 镜像构建、PostgreSQL 环境或公开部署；SQLite 验证不能替代部署环境验证。

本地 `beta` 合入采用已验证提交，若为快进且没有代码改动，复用上述证据，不重复相同构建/测试。`main` 保留稳定状态，用户验收和部署环境检查通过前不作发布提升。

## 稳定知识

规划、生产恢复、图片发布和工作台合同分别见 `docs/wiki/workflows/comic-{source-planning-integrity,batch-recovery,image-export-consistency,workspace-completion}.md`；更新记录集中在 release notes 与 README 最新日期块。
