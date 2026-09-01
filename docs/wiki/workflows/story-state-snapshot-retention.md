# 故事状态快照归档规则

## Background

每个已完成章节都可能产生一个 `StoryStateSnapshot`，快照同时保存人物、关系、信息和伏笔状态。长篇小说达到数百章后，在线快照数量会持续增加，读取和 SQLite 写入成本也会随之上升。

## Decision

在线数据库默认保留每本小说最新 100 个状态快照。更早的快照迁移到 `StoryStateSnapshotArchive`，归档记录以完整 JSON 保存快照基础字段和关联状态，保证历史状态可以继续作为恢复依据。

归档命令为 `pnpm --filter @ai-novel/server db:archive-state-snapshots`，默认执行 dry-run。执行模式需要显式添加 `--execute`，命令会先创建并验证 SQLite 备份，再迁移归档记录和在线副本。

## Current Rule

- 归档按小说分别计算，保留每本小说最新 100 条快照。
- 排序优先使用来源章节序号，其次使用快照创建时间。
- `StateService` 查询章节快照和章节之前的最近快照时，会优先读取在线表，在线表没有结果时读取归档表。
- 数据库体检必须同时报告在线快照和归档快照数量。
- 归档执行前必须停止开发服务，避免 SQLite 写锁和并发写入。
- `StoryStateSnapshot`、子状态和快照关联记录的删除只允许通过显式执行命令完成；日常服务不会自动归档或删除历史快照。

## Failure Modes

- 备份文件不存在、大小为零或 `quick_check` 失败时，归档流程立即停止。
- 归档表缺失时先执行 SQLite migration，再运行归档脚本。
- 归档记录 JSON 损坏时，恢复路径应将其视为数据完整性故障并保留备份供人工恢复。
- 快照归档属于数据库维护操作，不能作为自动导演链路中的隐式副作用。

## Related Modules

- `server/src/services/state/StateService.ts`
- `server/scripts/archive-state-snapshots.cjs`
- `server/scripts/inspect-db.cjs`
- `server/src/prisma/schema.sqlite.prisma`
- `server/src/prisma/migrations.sqlite/20260825103000_story_state_snapshot_archive/migration.sql`
