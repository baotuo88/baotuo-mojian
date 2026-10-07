# 角色连续性与硬事实排查

## 背景

章节连贯性问题不全是时间线问题。时间线能约束事件顺序、章节钩子和故事内时间，但人物的身份、阵营、境界、当前位置和可行动状态属于角色事实源。如果这些事实没有在角色准备阶段稳定生成，并在正文生成前进入 writer 上下文，后置审计只能发现问题，不能阻止错误进入初稿。

典型表现包括：

- 角色完整设定里的 `personality / background / development`
  长期为空，导致角色只能以功能位或短描述进入后续规划。
- 角色阵营、身份标签缺失，正文把“阐教门下申公豹”误写成“截教外门弟子”。
- 角色境界或战力缺失，正文把“大罗金仙赵公明”误写成“真仙后期”。
- 已有角色状态没有进入生成前约束，正文需要靠审计或修复再兜底。

## 诊断结论

角色完整设定空字段的根因不是数据库缺列。`Character` 表已有
`personality / background / development`，但核心角色阵容的结构化输出和落库链路没有要求、保存这三项；补充角色链路已有类似字段，因此两条角色入口的结构不一致。

角色阵营和境界错误的根因也不应归到时间线。时间线只知道事件是否发生和钩子是否承接，无法天然判断“申公豹属于阐教还是截教”“赵公明当前境界是什么”。这些必须作为角色硬事实进入角色库和 writer
required context。

## 当前规则

- 核心角色阵容和补充角色应输出一致的角色档案字段：`personality / background / development`。
- 角色硬事实至少包括：`gender`、`identityLabel`、`factionLabel`、`stanceLabel`、`powerLevel`、`realm`、`currentLocation`、`availability`、`prohibitions`。
- 角色硬事实是写作约束，不替代
  `CharacterTimeline`、`CharacterDynamics`、`StoryStateSnapshot` 或时间线模块。
- `participant_subset`
  只承担软性人物简介和当前参与角色摘要，不承担不可违背事实约束。
- writer 前必须带 `character_hard_facts` required
  context。该块即使为空也要存在，空态要明确提示不得凭空改写角色身份、阵营、境界、所在地和行动可用性。
- 角色外显资料属于进入正文前应补齐的可视化角色资产，包括
  `appearance / physique / attireStyle / signatureDetail / voiceTexture / presenceImpression`。自动应用角色阵容时，如果这些字段为空，应使用当前任务或当前页面选择的 LLM 设置补齐，避免落回未配置或能力不稳定的默认模型路径。
- 旧角色已有人工编辑内容时，自动应用角色阵容只能补空字段，不覆盖用户已填写的人物档案和硬事实。
- 审计继续作为后置检测和修复输入，但不能成为角色事实的主要来源。

## 排查路径

1. 先检查角色库中 `personality / background / development`
   是否为空。如果核心角色为空而补充角色不为空，优先查角色阵容 schema 和
   `applyCharacterCastOption()`。
2. 再检查角色硬事实是否进入运行时上下文。重点看
   `GenerationContextPackage.characterHardFacts` 和 writer blocks 里的
   `character_hard_facts`。
3. 如果正文出现阵营或境界错误，先判断角色库是否有对应硬事实；没有就修角色准备链路，有但 writer 没收到就修上下文组装。
4. 如果 writer 收到了硬事实仍写错，再进入审计、修复 prompt 或模型遵循度排查。
5. 如果角色编辑页外显资料长期显示“待补全”，先用当前任务模型手动触发单角色或批量补齐验证 prompt 能力；手动可生成但自动应用后仍为空时，优先检查角色阵容应用链路是否把
   `provider / model / temperature` 传入外显资料补齐服务。

## 失败模式

- 只在审计阶段检测“阵营错误”，但 writer 输入里没有阵营事实：初稿会持续犯错。
- 只把阵营放在 `character_dynamics`：动态投影可能为空或被裁剪，不能承担硬约束。
- 只依赖时间线状态：时间线可发现事件顺序错乱，但不能稳定推断角色所属阵营和修为层级。
- 自动应用角色阵容时没有携带当前 LLM 设置：外显资料补齐会走默认模型路径，可能表现为任务长时间等待或落库后仍为空。
- 自动应用角色阵容覆盖人工编辑：会破坏用户已经修正过的人物设定。

## 相关模块

- `server/src/prompting/prompts/novel/characterPreparation.*`
- `server/src/services/novel/characterPrep/`
- `server/src/services/novel/characterProfile/CharacterVisibleProfileService.ts`
- `server/src/services/novel/characters/characterHardFacts.ts`
- `server/src/services/novel/runtime/GenerationContextAssembler.ts`
- `server/src/prompting/prompts/novel/chapterLayeredContext.ts`
- `server/src/prompting/prompts/novel/chapterWriter.prompts.ts`
- `server/src/modules/timeline/`

## 性别与当前状态的运行时合同

适用范围：章节首稿、增量续写、审校、局部修复及提示词工作台预览。

- `GenerationContextAssembler` 将角色已登记的 `gender` 透传到
  `characterRoster`；共享运行时 Schema 必须保留该字段。
- `buildRuntimeCharacterHardFactsList`
  将性别纳入硬事实。仅登记性别、尚未填写阵营或当前目标的角色也必须保留，不能因为其他硬事实为空而被过滤。
- `character_hard_facts`
  是必需且不可摘要的上下文块。性别在此显式呈现；模型负责结合叙事上下文正确使用人称，不能由姓名、外貌或主观性格推断性别。
- 性别缺失时保留未知，不在生成链中通过关键词或正则补猜。既有数据库值不在本链路迁移或改写。
- `local_state` 与 `timeline_context`
  同为必需且不可摘要的状态依据，防止预算压缩时丢掉“已启动后暂停”一类有顺序含义的事实。计划目标不是已经发生的事实，不能覆盖权威状态。
- 提示词预览使用同样的性别字段；否则预览中的硬事实与真实写作上下文不一致。

## 故障定位

1. 检查数据库中的性别与当前事实是否存在，并核对事实来源章节。
2. 使用 mock 的 assembler 测试验证数据库角色行经运行时映射后仍带有 `gender`。
3. 使用仅设置性别的最小角色，验证硬事实筛选与 full、incremental、review、repair 四类上下文块均保留该字段。
4. 检查最终上下文预算结果及自定义模板的必需上下文保护，而不是只检查原始上下文包。
5. 若信息完整而正文仍冲突，检查 AI 审校与修复是否消费同一约束；不能通过字符串替换统一改代词，因为引语、叙述对象和多角色指代有语义边界。

## 验证边界

### 同轮信息边界回写导致状态倒退

当同章既提交角色状态变化又更新角色知情边界时，注意两者都写入
`Character.currentState`。资产抽取前加载的角色行是旧快照；即使状态提交已写入“已突破”“已离开”等新事实，该旧对象也不会随数据库更新。

信息边界合并必须在事务中读取最新状态，使用原状态作为条件写入并在竞争失败后重新合并。排查时对比
`StateCommitService` 的提交值和随后 `applyKnowledgeStates`
的写入值；若后者恢复旧状态，优先修复合并边界，而不是扩大 writer 提示词或重写小说正文。

合同测试能证明事实没有在工程链路中静默丢失，不能证明模型永不写错。挑战状态倒退还可能来自事实提取、状态回灌、时间线覆盖范围或模型未遵循上下文，应凭对应证据继续定位。局部连续性问题应进入章节修复或质量债，不得自动升级为全书重规划。
