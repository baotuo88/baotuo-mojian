# 小说版本恢复边界

此模块负责恢复正文版本及其运行资料，应用门面仅负责创建快照和返回小说详情。

- `infrastructure/NovelRuntimeArchive` 明确列出可归档的执行数据及依赖顺序。人物身份、性格、背景，世界和书级合同等创作设定不属于可清理表。
- `application/NovelSnapshotRestoreService` 负责备份校验、正文 CAS、恢复检查点、资料恢复与重试。禁止将正文写回成功当作整个版本恢复完成。
- 新完整快照保存同一事务视图下的正文、摘要、事实、状态、运行账本、审校和角色动态投影。定义或章节集合不兼容、以及只包含部分章节的原稿备份，都走按现有正文重新提取资料的路径。
- `ensureSnapshotRestoreReady` 是生产入口及章节上下文入口的安全检查。资料重建失败保留检查点，后续尝试会重新构建干净的资料层；不得绕过该检查继续使用部分恢复结果。
- 重建复用已注册的章节 artifact delta Prompt。它不是新写一章，不会修改现有章节正文。原始角色设定保留；`currentState/currentGoal/lastEvolvedAt` 是重新提取的运行投影，恢复前的值保存在完整备份内。
- RAG 独立异步完成。恢复检查点保存等待的任务 ID，索引未完成时不检索该小说旧向量，正文及 canonical 上下文仍可使用。

维护规则详见 `docs/wiki/workflows/novel-snapshot-restoration.md`。
