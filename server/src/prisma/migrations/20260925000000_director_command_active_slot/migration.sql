-- DirectorRunCommand 增加 activeSlot 哨兵列 + (taskId, activeSlot) 唯一索引。
-- 命令活跃(queued/leased/running)时写入排他类别("execution"/"cancel")，进入终态时清空为 NULL。
-- 借助唯一索引中 NULL 互不相等的语义，保证每个任务至多一个活跃执行命令(及一个取消命令)，
-- 从数据库层堵住 enqueueExecutionCommand 的 check-then-act 竞态。
-- 既有行 activeSlot 默认 NULL，由 enqueue 的 findFirst 预检查兜底，不参与新约束，故无需回填、迁移不会因历史重复而失败。
ALTER TABLE "DirectorRunCommand" ADD COLUMN "activeSlot" TEXT;
CREATE UNIQUE INDEX "DirectorRunCommand_taskId_activeSlot_key" ON "DirectorRunCommand"("taskId", "activeSlot");
