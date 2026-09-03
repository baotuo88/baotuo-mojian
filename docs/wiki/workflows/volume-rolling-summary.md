# 卷级滚动摘要（Volume Outcome Summary）

## 背景

超长篇写作时，窗口策略（时间线钩子分窗、事实账本 30 章窗）解决了「列表型记忆」无限膨胀的问题，但还有一类记忆无法靠窗口解决：**每一卷「实际发生了什么事」的全局收束**。

- 章节正文、时间线事件、事实账本都是**粒度细、贴近当前章节**的记忆，它们只覆盖最近一小段，无法回答「上一卷主角完成了什么、角色关系怎么变了、哪些线索还欠着」。
- 跨卷续写（尤其是百万字、数百章、几十卷）时，如果没有每一卷的收束摘要，模型只能看到上一卷的「计划大纲」（`previousVolume.summary` 是开写前的计划，不是实际结果），会遗忘前卷真实剧情、重复已发生事件、或遗漏未解线索。
- 修复目标：在一卷写完后，压缩「实际发生的结果」为滚动摘要，注入下一卷的写章上下文，让跨卷承接有据可依。

## 决策

- **存储**：`VolumePlan.completedSummaryJson`（可空 TEXT）保存服务端内部 JSON，不直接注入提示词。注入的是渲染后的**文本**（`previousVolumeOutcome`）。
- **生成**：`VolumeOutcomeSummaryService.summarizeVolume(novelId, volumeId)` 幂等生成：
  - 先读 `completedSummaryJson`，已有则直接返回；
  - 内存级 `inFlight` Map 去重，同一卷并发生成复用同一 Promise，避免重复调用 LLM；
  - 收集该卷章节摘要、时间线事件、开放钩子、已完成事实，调用 `novel.volume.outcome_summary` PromptAsset；
  - 成功后将 JSON 写回 `completedSummaryJson`。
- **触发**：`GenerationContextAssembler` 惰性触发（fire-and-forget 非阻塞）。当某章属于第 N 卷（N≥2）且第 N-1 卷无摘要时，触发上一卷摘要生成。服务幂等 + 在途去重，已生成后仅剩一次轻量读取，不会重复调用 LLM。
- **注入**：卷窗口上下文 `VolumeWindowContext.previousVolumeOutcome`（渲染文本），由 `volume_window` 上下文块注入写章提示词。首卷或摘要未就绪时为空串，模型不回退到任何硬编码内容。
- **延迟可接受**：第一卷 → 第二卷交界处，第二卷第 1 章可能因为摘要尚在异步生成而缺席；第 2 章起缓存命中，后续章节稳定注入。这是 v1 为了「不改动管线收尾 + 非阻塞」而接受的折衷。

## 结构化输出

PromptAsset `novel.volume.outcome_summary@v1`（`taskType: summary_generation`，`mode: structured`）输出固定形状：

- `narrativeProgress`：本卷实际核心情节推进（80-200 字叙事）。
- `characterStateChanges[]`：角色状态/关系/能力变化。
- `unresolvedThreads[]`：本卷遗留、下一卷仍需推进的钩子与未解冲突。
- `irreversibleFacts[]`：本卷确立的不可逆事实，后续不得改写。
- `continuityMusts[]`：下一卷开篇必须承接的连续性要点。

渲染助手 `renderVolumeOutcomeSummary`（`bookAndVolumeRewardContext.ts`）把 JSON 转为紧凑多行文本，按「角色变化 / 未解线索 / 不可逆事实 / 续写要点」分组。

## 当前规则

- `completedSummaryJson` 是**服务端内部 JSON**，只有渲染后的文本才跨过 shared 边界进入 `VolumeWindowContext`，保持共享契约稳定。
- 摘要生成必须幂等、在途去重、失败不阻塞上下文装配（fire-and-forget + catch 日志）。
- 渲染必须保留换行结构——不要把结果摘要文本再过 `compactText`（该函数会把换行折叠成空格，破坏列表分组）。
- 新增跨卷「必须记住」的收束信息，优先沉淀到卷级摘要，而不是继续扩大最近 N 章的窗口。
- 触发点在上下文装配层（不在管线收尾层），这是 v1 刻意为之，改动生成链路时需先评估是否应迁移到卷收尾阶段。

## 示例

- 一部 30 卷的小说：第 3 卷起每个后续卷都能看到第 2 卷的「实际发生摘要」，模型写作时不会把第 2 卷已完成的翻盘、角色和解、已毁据点当作可再次发生的事。

## 失败模式

- 在 `buildVolumeWindowContext` 里对 `previousVolumeOutcome` 使用 `compactText` → 换行被折叠，列表分组变一团，模型解读信息熵下降。
- 把 JSON 原样注入写章提示词 → 泄露内部字段名，污染正文风格；应注入渲染后的文本。
- 忘记幂等/在途去重 → 每章上下文装配都触发一次 LLM 生成，成本失控。
- 把触发点放进热路径并 `await` → 每卷第 1 章上下文装配被 LLM 阻塞，生成延迟陡增；v1 选择非阻塞可接受延迟。

## 相关模块

- `server/src/services/novel/volume/VolumeOutcomeSummaryService.ts`（幂等生成、`listPriorVolumeSummaries`）
- `server/src/prompting/prompts/novel/volume/volumeOutcomeSummary.prompts.ts`（PromptAsset + outputSchema）
- `server/src/services/novel/runtime/context/bookAndVolumeRewardContext.ts`（`renderVolumeOutcomeSummary`、`buildRuntimeVolumeWindowSeed`）
- `server/src/prompting/prompts/novel/chapterLayeredContext.ts`（`buildVolumeWindowContext`）
- `server/src/prompting/prompts/novel/context/chapterContextBlocks.ts`（`volume_window` 块渲染 `previousVolumeOutcome`）
- `server/src/services/novel/runtime/GenerationContextAssembler.ts`（惰性触发）
- `shared/types/chapterRuntime.ts`（`volumeWindowContextSchema.previousVolumeOutcome`）

## 关联

- [超长篇记忆窗口策略](./longform-memory-windowing.md)：列表型记忆的窗口策略，与本页的卷级收束摘要互补。