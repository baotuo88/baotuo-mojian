# 超长篇叙事上下文边界

## Background

超长篇不能把全部正文塞进每次模型调用。上下文必须由可追溯的结构化状态压缩而成，同时保留章节承接、时间顺序、开放钩子和禁止提前发生的未来事件。仅依赖向量检索容易找回相似内容，却无法保证事件顺序和揭示边界。

## Decision

章节生产使用分层上下文：

1. `CanonicalStateService` 提供当前书级事实、角色状态、冲突和伏笔账本；
2. `TimelineContextService` 提供章节时间锚点、前置事件、本章计划事件、开放钩子、未来禁止事件和已知状态变化；
3. `ContextAssemblyService` 决定当前章节应推进、保留、触碰或禁止揭示的叙事任务；
4. `chapterLayeredContext` 将这些状态转换为写作、审校和修复共享的章节合同。

时间线是结构化约束，不是全文回忆。它与 RAG 互补：RAG 负责补充相关资料，时间线负责事件顺序、因果边界和悬念揭示边界。

## Current Rule

- 正式章节规划、重规划、写作、审校和修复必须调用或消费 `TimelineContextService.buildForChapter()` 的同一份结构化上下文，不能只在质量检查阶段读取时间线，也不能把 `timelineContext` 永久置空。
- 默认只带有限的前置事件、开放钩子和未来禁止事件，避免上下文随作品长度线性膨胀。
- 时间线读取失败时允许降级继续，但必须记录诊断；质量门仍需识别上下文缺失，不能把降级伪装成完整一致性验证。
- `blocking` 且 `immediate` 的钩子是当前章节承接要求；`short_arc` 和 `long_arc` 钩子是可延后的叙事债，不应自动阻断整本生产。
- 未来事件仅用于防止提前发生，不能直接作为当前章节剧情内容泄露给模型之外的用户。
- 时间线质量问题必须遵守自动导演质量门：局部时间线问题记录为章节质量债，只有明确书级重规划或数据安全风险才停止全局链路。
- 状态变化必须保留来源事件和章节顺序；不能用最新文本字符串覆盖历史事实而丢失因果链。
- 角色认知快照属于角色主观状态，必须与客观 canonical 事实区分。章节上下文应保留角色当前解释、隐性意图、计划、信念、误判及其证据，但只向本章参与者下发，避免无关角色占用预算或产生全知视角泄漏。
- 关系阶段是有方向的状态（A 对 B 不等于 B 对 A），规划和正文必须保留阶段摘要与下一转折，不能仅用单一“好感度”覆盖复杂关系。
- 伏笔账本必须保留有章节定位的有限生命周期证据，而不是每次 AI 对账都用最新一句话覆盖旧证据。默认最多保留最近 4 个去重节点，用于覆盖铺垫、触碰、部分兑现和最终回收；最终 `paid_off` 仍必须有可验证的回收章节定位。
- 卷窗口必须给规划器明确的节奏阶段：前段建立承诺，中段升级并兑现阶段收益，后段收束支线并准备高潮，卷末完成高潮、回收承诺和建立下一卷接口。连续多个卷内节点冲突强度持平时应给出“安排可见变化”的规划提示，但该提示是局部节奏债，不能自动阻断整书执行。
- 章节执行合同中的 `targetWordCount` 是硬字数预算。生成场景卡时必须沿用章节目标；只有章节目标缺失时才允许使用按场景估算的默认值，不能用场景数量反向抬高用户已设置的章节字数。
- 长篇回归至少应覆盖跨卷章节窗口和跨数十章的伏笔证据链；固定样本应验证卷切换承接、节奏阶段、角色认知边界、伏笔首次铺垫锚点和最终回收定位，而不是只验证单章 Prompt 能否渲染。
- 伏笔的语义同一性由结构化 AI 输出的 `identityDecision` 决定：AI 必须在 `reuse`（引用输入的既有 canonical key）与 `create`（新建）之间明确选择。确定性层只能验证该 key 属于同一小说、未处于终态且不会被同一批输出重复占用；不得用关键词、相似度或标题匹配替代 AI 的语义判断。主账本同步和章节资产 delta 都必须使用这份合同，避免从旁路重新制造近义重复项。
- Prompt 可观测性以最终选入的上下文为准，记录选入/丢弃/摘要块数、按组聚合的块数和估算 token。`estimatedInputTokens` 是本地估算，必须与模型返回的实际 prompt token 分开看；日志和报告只保存 ID、分组与计数，不保存原始上下文。观测写入是旁路能力，失败不得阻断章节生产。

## Failure Modes

- 生成器不装配时间线：章节质量检查和禁止提前揭示能力失效。
- 把全部历史事件传入 Prompt：长篇越写上下文越膨胀，模型注意力反而下降。
- 把相似 RAG 结果当成最新事实：旧设定可能覆盖当前状态。
- 把所有开放钩子都设为 blocking：局部伏笔未回收会错误暂停整本自动导演。

## Related Modules

- `server/src/modules/timeline/timeline-context.service.ts`
- `server/src/modules/timeline/timeline.repository.ts`
- `server/src/services/novel/production/ContextAssemblyService.ts`
- `server/src/services/novel/runtime/GenerationContextAssembler.ts`
- `server/src/prompting/prompts/novel/chapterLayeredContext.ts`
- `shared/types/timeline.ts`
- `docs/wiki/workflows/auto-director-runtime.md`
