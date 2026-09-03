# LLM 调用守护与正文输出预算

## 背景

超长篇（数百章）全本自动导演会连续运行数小时。此前的调用链有三个静默风险：

1. LLM 调用无默认超时（`runWithEnforcedTimeout` 在无 `timeoutMs` 且无 signal 时直接裸跑），provider 半开连接会让流停在"不再有新 chunk、也不结束"的状态；而 worker lease 续约与 pipeline 心跳都在等待期间照常跳动，stale 恢复与心跳 watchdog 全部失效——任务表现为"假运行"。
2. 正文 writer 调用点传 `maxTokens: undefined`，Anthropic 协议缺省硬落回 4096（约 3000 汉字），大字数章节被 `max_tokens` 中途截断。
3. 流式响应中途挂起没有任何检测手段。

## 决策

- `server/src/llm/factory.ts`：调用方未配置超时时，统一兜底 **10 分钟**强制超时（`DEFAULT_LLM_TIMEOUT_MS`），两个协议客户端（openai_compatible 的 langchain `timeout`、anthropic 的 AbortController）都已接住该值。
- `server/src/llm/outputBudget.ts`：`deriveWriterOutputTokens(targetWordCount)` 按章节目标字数推导输出预算（`ceil(words×2.2)+512`，下限 8192、上限 16384）。调用点：`chapterWritingGraph`（writer 草稿，取 chapterMission → context.chapter → chapter 三级目标字数）、`chapterRepairRuntime`（重修复，从 runtimePackage 上下文解析）。factory 对内置 provider 按 `PROVIDERS[provider].maxTokens` 钳制（如 deepseek 8192）。
- `server/src/llm/streamStallGuard.ts`：`guardStreamStall(stream)` 包装异步流，连续 **8 分钟**（`DEFAULT_STREAM_STALL_TIMEOUT_MS`）无新 chunk 即抛错并释放底层流。接入点：writer 草稿流与重修复流。挂起从"静默假运行"变为"显式错误"，从而进入既有的章级重试与恢复链路。

## 当前规则

- 新增 LLM 流式调用时，若该流可能长时间无 chunk 产出，必须用 `guardStreamStall` 包装。
- 新增正文类流式生成（按目标字数产出长文本）时，必须用 `deriveWriterOutputTokens` 联动输出预算，不要传 `undefined`。
- 内置 provider 的输出上限以 `PROVIDERS` 表为准；新增 provider 时必须声明 `maxTokens`。
- 结构化调用已有 `runWithEnforcedTimeout` 机制，缺省超时兜底后同样受保护；调用方仍可为特定任务配置更短的 `timeoutMs`。

## 失败模式

- 调用点绕过 factory 直接构造客户端（如手工 `fetch` provider API）不会获得缺省超时——必须显式设置。
- 流守护的超时是"无新 chunk"语义，不是"总时长"语义：慢但持续产出的长章节不会被误杀。

## 相关模块

- `server/src/llm/factory.ts`（缺省超时 + provider 钳制）
- `server/src/llm/outputBudget.ts`（输出预算推导）
- `server/src/llm/streamStallGuard.ts`（流挂起守护）
- `server/src/services/novel/chapterWritingGraph.ts`（writer 草稿调用点）
- `server/src/services/novel/runtime/repair/chapterRepairRuntime.ts`（重修复调用点）
