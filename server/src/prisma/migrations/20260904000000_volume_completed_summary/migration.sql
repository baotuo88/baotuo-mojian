-- 为 VolumePlan 增加卷末滚动摘要列：存卷完成后生成的压缩结果摘要（JSON 文本，可空）。
-- 空值表示该卷尚未生成结果摘要，上下文装配阶段可用其触发惰性生成。
ALTER TABLE "VolumePlan" ADD COLUMN "completedSummaryJson" TEXT;