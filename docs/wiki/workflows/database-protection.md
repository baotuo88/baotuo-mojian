# 数据库备份与恢复边界

## 背景

小说正文、章节状态、任务检查点和规划资产共同构成生产现场。数据库恢复不能只验证备份文件存在，也不能把应用层快照恢复和数据库文件恢复混为同一件事。

## 当前规则

### SQLite 文件恢复

`db:restore` 面向开发数据库文件恢复，默认必须是 dry-run。执行模式先创建目标库备份，再执行源库与目标库的表结构检查。源库、目标库、目标备份和恢复后的目标库都必须通过 SQLite `quick_check`；仅有文件大小不能证明备份可用。

恢复操作在目标库事务中关闭外键约束，清空全部用户表，再按源库完整回灌，因此源库不存在的目标行不会残留。恢复完成后应对比关键表数量和业务抽样数据；如果恢复失败，必须保留执行前备份，不得继续覆盖原目标库。

备份产物应记录路径、文件大小和 SHA-256，便于排查复制不完整、路径错误和恢复对象不明等问题。运行中的服务不应同时写入目标库；正式生产环境应使用适配部署方式的在线备份，而不是复制正在写入的 SQLite 文件。

### 应用快照恢复

Novel Snapshot 是应用层资产恢复能力，只能恢复它明确定义并版本化保存的字段。它不等价于数据库文件备份，不能承诺恢复角色、RAG、任务、事件和所有关联表。任何需要整库回滚的场景必须使用经过校验的文件级备份。

### PostgreSQL

SQLite 运维脚本不得对 PostgreSQL 路径静默工作。PostgreSQL 生产恢复需要使用 `pg_dump` / `pg_restore` 或托管服务的 PITR/WAL 能力，并在隔离数据库执行恢复验收。Prisma migration deploy 负责 schema 版本推进，不替代数据备份。

CI 或开发机的 PostgreSQL 归档烟测默认必须跳过，只能在显式设置 `ENABLE_POSTGRES_BACKUP_SMOKE=1`、提供数据库名带 `test` 标识的 `TEST_POSTGRES_URL`，并同时检测到 `pg_dump` 与 `pg_restore` 后运行。基础烟测只允许执行只读 `pg_dump --format=custom` 与 `pg_restore --list`，不得使用 `--clean`、drop、truncate 或覆盖已有数据库。该烟测只能证明归档非空且工具链可解析，不能替代在隔离数据库中的真实 restore 和业务数据验收。

## 测试要求

恢复脚本至少要覆盖：

- dry-run 不修改目标库，也不创建目标备份；
- 执行恢复会清除目标库多余行并还原源库数据；
- 目标备份可重新打开并通过 `quick_check`；
- 源库或目标库损坏时在写入前失败；
- 恢复失败后执行前备份仍可使用。

## 相关模块

- `server/scripts/restore-dev-data.cjs`
- `server/scripts/inspect-db.cjs`
- `server/scripts/archive-state-snapshots.cjs`
- `server/scripts/prune-snapshots.cjs`
- `server/src/services/novel/novelCoreSnapshotService.ts`
- `server/tests/restoreDevData.test.js`
