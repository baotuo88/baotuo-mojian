-- 同 postgres：DirectorRunCommand 增加 activeSlot 哨兵列 + (taskId, activeSlot) 唯一索引。
-- 命令活跃时写入排他类别("execution"/"cancel")，终态清空为 NULL；唯一索引中 NULL 互不相等，
-- 从而保证每任务至多一个活跃执行命令。既有行 activeSlot 默认 NULL，不参与约束，无需回填。
ALTER TABLE "DirectorRunCommand" ADD COLUMN "activeSlot" TEXT;
CREATE UNIQUE INDEX "DirectorRunCommand_taskId_activeSlot_key" ON "DirectorRunCommand"("taskId", "activeSlot");
