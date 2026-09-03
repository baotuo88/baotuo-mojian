# 超长篇记忆窗口策略

## 背景

超长篇（数百章、百万字）写作时，写章上下文里有两块「记忆」会随章节累积而不受控增长，最终要么挤爆上下文，要么把最该记住的近期线索挤掉：

1. **时间线钩子**（`timelineHook`）：每章可能写入多条开放钩子（open）与已处理钩子（addressed）。旧实现按 `createdInChapterIndex asc` + `take 12` 从数据库取数——即**保留最旧的 12 条**再在 JS 内按优先级排序截 8 条。长篇小说一旦累计超过 12 条，**最新创建的钩子（当前连续性线索）会被静默丢弃**，反而保留早已过期的旧钩子，直接破坏跨章剧情承接。
2. **事实账本**（`completed`/`revealed` 事实）：`completedMilestones` 以 `required: true` 的上下文块注入写章提示词，绕过上下文预算；旧实现全量返回所有已完成/已揭示事实，随章数线性膨胀。

## 决策

- **时间线钩子窗口**（`timeline.repository.ts` 的 `selectHookContextWindow`）：不再在数据库层按最旧优先截断，改为先取最新一批（`HOOK_WINDOW_SCAN_LIMIT = 200`），再在内存按优先级分窗：
  - open 钩子：`blocking > resolveMode(immediate>short_arc>long_arc) > priority`，同等优先级下**最新优先**兜底，上限 `OPEN_HOOK_CONTEXT_LIMIT = 8`；
  - addressed 钩子：按最近处理章节降序，独立窗上限 `ADDRESSED_HOOK_CONTEXT_LIMIT = 5`，不再与 open 钩子竞争同一预算。
- **事实账本窗口**（`NovelFactService.listForChapter`）：`completed`/`revealed` 只返回最近 `milestoneChaptersWindow = 30` 章内的条目；`state_changed` 维持最近 15 章。更早的里程碑改由时间线事件与角色/世界状态承接，事实账本只兜底最近的重复风险。

## 当前规则

- 任何写章上下文里的「列表型记忆」都必须有确定性的窗口或优先级截断策略；禁止无限增长。
- 窗口选取的原则是**优先级优先 + 最近优先**，绝不「最旧优先」——最旧优先会在超长篇幅下静默丢弃当前连续性线索。
- open 与 addressed（已处理）钩子必须分窗，不得共享同一预算；已处理钩子的历史信息已沉淀在时间线事件与章节正文中。
- 新增「永久必须记住」的事实时，应先确认它是否已有承接载体（时间线事件 / 角色 canonical 状态 / 世界状态）；不要简单靠无限积累事实账本来保证记忆。
- 变更这些窗口边界（常量）时，需同步更新本页与相关测试（`timelineHookWindow.test.js`、`novelFactWindow.test.js`）。

## 示例

- 一部 200 章的小说，每章约写 3 条 completed 事实：旧实现第 200 章会注入约 600 条「已完成事项」；窗口化后稳定在最近 30 章 ≈ 90 条以内。
- 作家在第 180 章埋下一条跨章钩子：旧实现在钩子总量超过 12 条时可能把它丢掉；新实现按优先级排序且最新优先，最新钩子必被保留。

## 失败模式

- 把窗口设得过大 → 上下文仍会膨胀，回到原问题。
- 把窗口设得过小 → 近期「不得重复」的里程碑过早退出，模型可能重复老剧情；需配合时间线事件与 canonical 状态兜底。
- 直接改数据库 `take`/`orderBy` 而不动内存排序策略 → 表面上换了取数，实际上仍可能在错误的一侧截断。

## 相关模块

- `server/src/modules/timeline/timeline.repository.ts`（`selectHookContextWindow`、`listOpenHooks`）
- `server/src/modules/timeline/timeline-context.service.ts`（`buildForChapter` 消费 open/blocking/soft/addressed 分窗）
- `server/src/services/novel/fact/NovelFactService.ts`（`listForChapter` 窗口）
- `server/src/services/novel/runtime/GenerationContextAssembler.ts`（`completedMilestones` 注入点）
- `server/src/prompting/prompts/novel/context/chapterContextBlocks.ts`（`chapter_mission` 上下文块）