# RAG 队列观测与任务认领

## Background

RAG 索引任务由数据库队列驱动。长篇项目会同时产生多个索引任务，服务重启、轮询重叠或多实例运行都可能让同一任务被重复处理。队列缺少概览数据时，用户也难以判断索引积压、失败和恢复状态。

## Decision

RAG
Worker 使用数据库条件更新完成任务认领：先读取最早可运行的排队任务，再仅在任务仍处于
`queued` 且 `runAfter` 已到期时更新为
`running`。更新结果为零时，当前 Worker 放弃本轮任务，另一个成功认领的 Worker 继续处理。

Worker 并发度通过 `RAG_WORKER_CONCURRENCY`
配置，范围为 1 到 8，默认值为 1。每个活动槽独立处理一个已认领任务，任务结束后释放槽位。

## Current Rule

- 认领动作必须包含 `status = queued` 和 `runAfter <= now` 条件。
- 认领时原子递增 `attempts`，失败重试使用认领后的尝试次数计算退避和最终失败。
- 任务状态仍沿用 `queued`、`running`、`succeeded`、`failed`、`cancelled`
  生命周期。
- 任务处理失败且仍有重试额度时，Worker 按认领后的 `attempts`
  计算指数退避并重新排队；达到 `maxAttempts` 时写入 `failed` 和错误信息。
- Worker 启动恢复会把遗留的 `running` 任务改回 `queued`，设置当前时间为
  `runAfter`，让任务进入正常处理链。
- `/rag/queue-overview`
  仅允许已认证请求访问，返回按状态统计、最早排队时间、最近失败任务和当前 Worker 并发度。
- 队列概览用于监控和用户引导，局部积压或失败记录不会自动阻断全局小说生产链。

## Failure Modes

- Worker 在任务处理期间退出时，启动流程会把遗留的 `running` 任务重新排回队列。
- 两个 Worker 同时读取同一候选任务时，只有一个条件更新可以成功，避免重复执行。
- `RAG_WORKER_CONCURRENCY`
  设置过高会增加 SQLite 写入竞争和嵌入服务压力，应结合部署资源逐步调高。

## Related Modules

- `server/src/services/rag/RagIndexService.ts`
- `server/src/services/rag/RagWorker.ts`
- `server/src/config/rag.ts`
- `server/src/routes/rag.ts`

## 同一来源的更新、删除和恢复

同一 `(tenantId, ownerType, ownerId)`
的任务必须串行执行；不同来源可以并行。入队与认领由 `rag/queue`
模块通过可串行化事务完成，数据库写竞争使用既有重试机制。

- 只有尚未认领的 `queued` 任务可合并。`running`
  任务可能已读完来源，后来的修改必须创建持久化后继任务。
- 合并按最新请求更新操作类型，包含 `upsert` 与 `delete`
  的相互覆盖。删除不能越过正在运行的旧写入，否则旧任务可能重新写回已删除资料。
- 同一来源的较早重试仍占据顺序，即使退避时间未到，也不能先执行后面的删除；其他来源不受该等待影响。
- 章节事实和角色时间线删除重建时，旧来源 ID 的删除任务与来源记录删除属于同一个事务。队列写入失败则不删除来源，向量服务失败则由任务正常重试。
- 必须等待索引请求持久化后才结束其所属执行命令，不能用未等待的 Promise 掩盖排队失败。
- 版本恢复的索引屏障见 `docs/wiki/workflows/novel-snapshot-restoration.md`。
