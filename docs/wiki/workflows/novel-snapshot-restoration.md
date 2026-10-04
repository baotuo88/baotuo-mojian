# 小说版本恢复与运行资料一致性

## Background

正文、章节摘要、已发生事实、角色动态状态和检索索引共同构成续写依据。只回滚正文会让 AI 在旧正文上继续引用后来的剧情。版本恢复必须同时处理这些资料，而不能依靠用户逐一修正。

## Decision

恢复由小说 `snapshots` 模块统一负责。人物身份、性格、背景等创作设定保留；角色 `currentState/currentGoal/lastEvolvedAt` 属于运行投影，必须与恢复后的正文对应。

新快照在同一可串行化事务中捕获正文和运行资料。恢复前另建完整备份并读取校验。所有章节写回使用原正文和更新时间进行条件更新；任一章节存在并发编辑，整笔正文和资料替换回滚。

## Current Rule

1. 完整且与现存章节、人物和卷定义兼容的运行资料归档可直接恢复。摘要、事实、状态快照、资源/伏笔账本、审校、时间线、角色动态，以及卷完成摘要和章节计划状态属于该合同。
2. 历史快照、局部生成前原稿备份、定义不兼容的快照，需要根据恢复后的现有章节按顺序重新分析。未列入局部快照的章节正文保留，也参与资料重建。
3. 清理资料前，旧运行记录已存在验证通过的完整备份中。原始人物设定及作者对角色的对话/引导内容不删除；运行投影、已应用引导的状态和章节执行计划需要失效或恢复。
4. 资料重建复用注册的章节 artifact delta Prompt。不得用关键词规则推断历史状态，也不得把已有的未来状态作为重建起点。
5. `snapshot_restore` 检查点记录恢复来源、备份、目标正文和执行状态。失败重试先清理半成品资料，再重新提取，避免重复追加事实或提案。
6. 统一生产入口与章节上下文装配均检查 `ensureSnapshotRestoreReady`。资料重建尚未完成时不能继续使用部分恢复数据；这是运行资料完整性检查，不是章节质量门禁。
7. 原文发生并发变化或恢复任务失去执行权时，停止本次恢复。不得用旧提取结果覆盖用户刚编辑的正文或资料。
8. RAG 建索引属于异步任务。检查点记录必须完成的索引任务，完成前跳过该小说的检索资料，避免恢复后的下一章读到旧向量。正文和已恢复的 canonical 状态无需等待索引服务。

## Failure Modes

- **旧快照缺少状态资料**：需要调用 AI 按章重建，可能比直接恢复正文耗时更多；AI 不可用时检查点保留，后续生成尝试会重试。
- **完整快照引用已删除定义**：不能直接插入带失效外键的资料，使用正文重建路径。原始创作设定不从运行归档中删除或凭空重建。
- **重建时正文被编辑**：原文比较失败，阻止旧资料继续提交；重新发起恢复以确定新的正文基线。
- **索引失败或被取消**：原文和 canonical 状态仍可使用，但不应重新启用未完成的旧检索结果。

## Related Modules

- `server/src/services/novel/snapshots/`
- `server/src/services/novel/application/NovelApplicationServices.ts`
- `server/src/services/novel/production/NovelProductionOrchestrator.ts`
- `server/src/services/novel/runtime/GenerationContextAssembler.ts`
- `server/src/services/rag/retrieval/RestoredNovelIndexBarrier.ts`
