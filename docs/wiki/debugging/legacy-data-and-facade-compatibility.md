# 旧数据兼容与门面委托排查路径

## 背景

自动导演、卷级方案和写作工作区是分批落地的。早期项目没有卷级方案、章节规划里也没有执行合约哈希，这些数据在新链路里若被误判为“过期”或“缺失”，会导致旧项目无法审校、无法继续创作。此外，`NovelService` 等兼容门面用“转发循环”把方法委托给真正的应用服务，委托写法错误会静默丢失 `this` 上下文，报错信息往往不明显。

## 决策

旧数据缺少新字段，优先按“旧数据本身有效”处理：复用现有方案、保留原始来源标记。门面委托一律用 `fn.apply(target, args)` 保留接收者上下文，避免 `this` 漂移。

## 当前规则

- `PlannerService.ensureChapterPlan` 遇到没有 `rawPlanJson.executionContractHash` 的旧章节计划时，直接复用，不判为 stale，不触发 LLM 重新规划。
- `NovelVolumeService.persistWorkspaceDocument` 回填卷级文档时，保留 `document.source === "legacy"` 的来源标记，只对新文档写 `"volume"`。
- 兼容门面把方法转发给真实服务时必须用 `method.apply(targetService, args)`，不写 `method(...args)`，否则目标方法内的 `this` 指向错误对象。
- 上下文装配链路（如 `GenerationContextAssembler.assemble`）会主动调用 `ensureChapterPlan`；旧项目因此可能在审校或继续时被强制拉起 LLM，排查“未配置模型 Key”类错误时先确认是否由旧计划被误判过期触发。

## 失败模式

- 把“缺字段”等同于“数据损坏”，对旧项目强制重规划或覆盖来源标记。
- 用 `method(...args)` 做门面委托，导致 `this.xxxService is undefined` 或方法调用错对象。
- 只在调用点 try/catch 掩盖，而不修正旧数据复用规则。

## 相关模块

- `server/src/services/novel/NovelService.ts`
- `server/src/services/novel/volume/NovelVolumeService.ts`
- `server/src/services/planner/PlannerService.ts`
- `server/src/services/novel/runtime/GenerationContextAssembler.ts`
