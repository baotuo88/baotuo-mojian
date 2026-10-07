# 漫画首话引导、任务恢复与完整导出

## Background

漫画已有独立的内容源、角色设计、分话、分镜和图片服务，但新手不应依靠理解这些内部模块才能完成一话。页面刷新也不能让后台任务变成无法查找的孤立执行；导出缺格的图片会使用户误以为作品完整。

## Decision

工作台使用已落库的产物展示首话下一步：准备故事资料 → 规划第一话 → 准备分镜 → 角色设计稿 → 生成与审阅图片 → 导出。前端仅对结构化状态做确定性投影，剧情、分镜和形象描述的创作判断由既有注册 AI
Prompt 承担。

首话指引是现有能力的入口，不另建一套前端自动导演。图片生成必须遵守单张确认与批量范围确认合同；打开工作台、切换标签或恢复查询不得触发生图。

## Current Rule

- 默认从“我的小说”创建项目。小说列表支持搜索，用户可保留原小说标题作为漫画标题。
- 首话规划默认只生成一话，先帮助用户完成样稿，再通过分话工作区扩展连载。
- 首话按钮调用生成前应重读正式产物；已有内容源和分镜不得因为旧页面的陈旧状态被再次导入或覆盖。服务端仍负责最终并发保护，前端检查不能代替写入互斥。
- 项目页面在 URL 中保存 `tab` 与
  `episodeId`，刷新后回到同一话。单话批量组件以 episode 为实例边界，切话时丢弃上一话未提交的确认。

## Task State Contract

- 批量任务查询是进度事实来源，组件本地 state 不保存唯一可恢复的任务 ID。
- `progress.episodeId`
  标识所属话，`provider`、`imageModel`、`concurrency`、`targetPanelIds`
  保留执行范围与设置，`completedPanelIds`、`failedPanelIds`、计数与错误支持最小范围恢复。
- 前端不能仅按 `projectId`
  把最新任务挂到当前话数；旧记录缺少话数标识时不能猜测关联。
- `running` 持续轮询，创建和重试完成后立即重新读取；重试可以沿用同一个 job
  ID，不能依赖 ID 改变才能重开轮询。
- `partial` 提供失败格重试，`interrupted` 提供中断继续，`cancelled`
  提供显式继续入口。状态转换由服务端裁决；进入页面不会自动重试或续费。
- 恢复沿用任务保存的图片服务和模型；模型配置变化时需重新确认创建。用户修改项目顶部的当前选择，不得隐式改变既有任务设置。
- 批量提交需要同步互斥，不能只靠下一帧渲染的按钮 disabled 状态阻止双击。
- 停止生成不能撤回已发送的 provider 请求；页面应解释这个边界，并保留已经成功的图片。

## Image Confirmation And Cost

单张生图复用统一
`prepare → 确认 → generate(overrides)`。批量生图只需在任务创建前确认目标数量、图片服务和实际模型，不逐格弹窗。价格缺少可靠配置时显示费用无法预估及平台账单说明，不能用旧模型固定单价伪造本次预算。

## Export Contract

- 完整导出包括完整长图与分段图片，不能默默跳过缺失格子后返回成功。
- 前端按每格图片状态提供缺失话数内序号和返回生图入口；后端还必须验证真实图片文件，处理数据库状态与磁盘不一致。
- 分段导出的每个产物都应有独立下载链接。产物链接来自服务端导出历史，不能只在异步回调中弹出一个新窗口，让浏览器拦截后失去下载入口。
- 页面不自动执行植字。普通漫画生图已包含对白，重复植字会覆盖画面并叠加文字；植字应作为用户显式选择的能力。
- 可变格图链接带图片版本或生成时间，重新生图不能继续展示同一缓存地址的旧图。

## Failure Modes

- 刷新后看不到任务：检查是否仍只使用本地 `jobId`，而没有查询持久任务。
- 切换话数后展示另一话重试按钮：检查 episode 绑定、组件 key 和 URL 参数。
- 同任务重试后不刷新：检查轮询是否错误依赖 `jobId` 变化。
- 已完成任务仍显示旧待生成数量：检查进度变化是否刷新图片与估算查询。
- 下载缺格：检查是否把缺失图片当成可跳过的素材，而不是完整导出的前置条件。
- 只下载到首张切片：检查是否完整展示 `artifacts` 数组并持久展示导出历史。

## Related Modules

- `client/src/pages/comic/project/production/`
- `client/src/pages/comic/project/export/`
- `client/src/pages/comic/ComicProjectPage.tsx`
- `client/src/pages/comic/ComicWorkspacePage.tsx`
- `server/src/services/comic/ComicBatchOrchestrator.ts`
- `server/src/services/comic/ComicExportService.ts`
- [图片生成确认与统一运行时](./image-generation-confirmation-runtime.md)
- [漫画分格生产与 Prompt 治理](./comic-panel-production-prompt-governance.md)
