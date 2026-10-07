# 短剧任务恢复与素材保护

## Background

视频、配音和生图是可能计费的外部调用。HTTP 中断只能证明本地没有收到结果，不能证明供应商没有接单。Docker 重启、重复点击和历史版本切换都必须保护已有产物，不能靠自动重发掩盖未知状态。

## Decision

短剧采用“持久检查点、显式费用确认、按当前分镜生产”的恢复边界。故事规划和理解继续使用注册 PromptAsset；这里的分支仅判断结构化任务状态、版本和完整性。

## Current Rule

### 整集制作

- `DramaBatchJob`
  固定分镜 ID 和镜头集合。每次外部调用前重新确认当前分镜，禁止在新分镜出现后继续旧任务。
- 同一项目/集数/类型的并发创建复用已有任务，数据库事务串行化竞争；只允许一个调用通过条件更新领取 pending 任务。
- 暂停不承诺撤销供应商正在执行的镜头，只停止后续镜头。完成镜头 ID、复用数量、错误列表和费用在每镜结束后保存。
- `done` 包含 `skipped`，已处理量为
  `done + failed`。恢复保留完成集合和累计费用，不重新从零统计。
- `POST /projects/:id/batch-jobs/:jobId/resume` 需要
  `confirmAdditionalCost: true`，paused/failed 可恢复；缺失或变化的分镜返回冲突。旧分镜暂停记录不应阻断新分镜恢复。
- 项目详情包含最近任务和所有待处理任务，不能让历史分页隐藏恢复入口。

### 视频提交

- `prompted -> submitting`
  用数据库条件更新占用。同提示词的 queued/running/succeeded 任务复用已有记录，避免重复提交。
- 上游异常或重启遗留 submitting 转为 `submission_unknown`。只有用户明确确认
  `confirmResubmit: true` 才能重新提交，批任务不得自动确认。
- 新提交清空当前 taskId，把上次任务回执移入
  `providerResult.previousAttempt`。submitting/unknown 即使存在遗留旧 ID，也禁止刷新旧 ID 覆盖当前未知状态。
- 刷新按读到的状态、任务 ID、版本和回执作条件更新。历史 superseded 记录不能因轮询重新成为当前版本，迟到结果不能覆盖新的任务。
- 当前成功结果保留 URL；缺失 URL 的回执不应清空可用视频。
- provider 不允许默认为模拟服务。模拟通道只供显式测试使用，真实使用由设置中的媒体通道提供。

### 内容与资产

- 整理来源素材属于首次导入。重复调用拒绝覆盖；事务内再次校验，角色导入保留已有同名角色的人工设定、图片和声线。
- 续分集只补缺集。AI 必须返回请求范围内完整、不重复的集号，不完整时整个区间不落库；范围交叠时保留已有台本、质量状态和媒体上下文。
- 更改台本后的派生产物版本传播属于独立设计问题，不能把本规则误解为已经覆盖所有台本编辑/重生成路径。

## Failure Modes

- unknown 带旧 taskId 仍允许刷新，会丢掉未知提交保护并诱发重复计费。
- 把所有 paused 都当成恢复冲突，会让旧分镜任务永久阻止新分镜生产。
- 当前分镜以外的提示词进入下一步或导出进度，会误报完成。前端只消费当前分镜每镜最高有效版本。
- 12 集有大纲不代表 80 集项目规划完成。阶段数量使用目标集数，下一段从首个缺口开始。
- 批视频 done 不等于视频文件成功，更不等于完成 MP4。素材导出仍是独立可用入口。

## 部署与验证范围

启动恢复只适用于当前单 API 实例 Docker 部署。多副本或滚动发布必须先设计租约，不能启动即扫描全部任务。费用是估算，供应商账单是实际结算依据。

恢复测试使用独立临时数据库和可控供应商，不接触用户作品，也不做真实付费生成。UI 交互和真实媒体质量由用户验收。

## Related Modules

- `server/src/services/drama/production/`
- `server/src/services/drama/DramaVideoPromptService.ts`
- `server/src/services/drama/DramaProjectService.ts`
- `server/src/services/drama/DramaEpisodeOutlineService.ts`
- `client/src/pages/drama/production/`
- [工作台流程边界](short-drama-workspace.md)
