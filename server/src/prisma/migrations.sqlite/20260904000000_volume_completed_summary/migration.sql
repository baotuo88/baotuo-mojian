-- 为 VolumePlan 增加卷末滚动摘要列（JSON 文本，可空）。
ALTER TABLE "VolumePlan" ADD COLUMN "completedSummaryJson" TEXT;