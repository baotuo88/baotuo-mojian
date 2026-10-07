# 章节生产的前端边界

`application/rewriteChapter.ts`
负责先确认可恢复快照，再调用现有生成入口；它不清空正文，不实现第二套生成链。

`domain/chapterReviewIdentity.ts`
将审校结果绑定到小说、章节和原始正文。工作台展示和修复入口都通过该身份判断使用结果，不能仅因为某次审校请求成功就把结果套用到当前选择。

外部通过 `index.ts` 消费。工作台的临时生产表单集中在
`hooks/workspace/useChapterProductionState.ts`，后台任务状态仍由既有 query/projection 维护。

维护合同见 `docs/wiki/workflows/chapter-editing-consistency.md`。
