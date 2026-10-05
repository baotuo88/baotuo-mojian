# 短剧整集制作边界

## 职责

`DramaBatchOrchestrator` 编排整集首帧、视频任务提交和配音。图片、视频和配音供应商协议由对应服务及共享 media 模块拥有；编排层不写业务提示词，不推断故事意图。外部通过本目录 `index.ts` 使用编排能力。

## 状态与持久化

- 创建时固定 `storyboardId`、`targetShotIds`、provider、角色参考图选项和费用单价。
- PostgreSQL 上通过事务中的项目行更新串行化创建/恢复检查；工作领取通过 `pending -> running` 条件更新，不能仅依赖进程内 Set。
- `completedShotIds` 是恢复依据；`done` 包含复用镜头，`skipped` 是其子集，进度为 `done + failed`，不能重复加 skipped。
- 暂停只停止后续镜头，当前供应商请求可以结束并落盘。检查点更新必须合并并发到达的 `pauseRequested`。
- 恢复沿用原任务，保留完成镜头和费用累计，清空待重试的失败列表；需要 `confirmAdditionalCost: true`。
- 新分镜禁止恢复旧任务。新分镜可创建新任务，过期 paused 记录不得阻止新分镜恢复。
- `videos` 批任务完成仅代表视频任务提交完成，不能投影为成片成功。

## 启动与部署

当前 Docker 自部署采用单 API 实例。开始监听前将遗留 pending/running 转为 paused，将遗留视频 submitting 转为 submission_unknown；启动恢复绝不自动重发付费请求。数据库 CAS 防止并发请求重复领取，**不代表支持多实例滚动启动**：启动时扫描会把另一实例的工作视为中断。扩展部署必须先引入持久租约/实例归属和过期判定。

## 费用与错误

费用仅是依据配置单价和确认处理结果的估算，未知上游接单、失败请求、人工单镜操作可能产生账单差异。视频 submission_unknown 必须在单镜入口核对并确认重发，批处理不能替用户确认。外层异常必须落失败原因，避免任务长期显示运行中。

相关规则见 [短剧任务恢复与素材保护](../../../../../docs/wiki/workflows/short-drama-production-recovery.md)。
