-- 为 VolumePlan 增加卷末滚动摘要列（JSON 文本，可空）。
-- Compose 部署基线已包含全表结构；此迁移在既有库上增量补充该列。
ALTER TABLE "VolumePlan" ADD COLUMN "completedSummaryJson" TEXT;