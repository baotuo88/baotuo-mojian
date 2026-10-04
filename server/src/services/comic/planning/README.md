# 漫画内容映射与规划持久化

本模块负责将注册 AI 返回的漫画话序映射到源小说章节，并保护已有分话、分镜与事实。外部服务只从 `./planning` facade 引入能力。

- `sourceMapping.ts`：读取 `ComicEpisode.scriptConfig.sourceRange`，校验范围属于导入内容包；旧项目没有映射时调用 `comic.sourceMapping` 注册 Prompt，不能按话序猜章序。
- `planningPersistence.ts`：分话版本锁、活动生产任务检查、完整规划归档与回读校验。批量任务的租约规则从 `production` facade 获取，不在规划模块重新定义。
- `ComicEpisodePlanService` 与 `ComicPanelScriptService` 保留应用编排和公开入口。模型调用在事务外，提交前获取分话行锁并重新检查当前稿件、源资料和活动任务。

分话锁使用条件 no-op 写入 `updatedAt`，既获得数据库写锁，也保持原版本指纹。多个分话按 ID 排序加锁。分镜内容编辑、事实写入、规划替换使用相同分话锁序；事实在锁内复核分镜版本，不能写入被替换脚本的迟到结果。

替换已有规划必须由 HTTP 输入 `replaceExisting=true` 表示明确选择；不接受以重新点击生成隐式覆盖。备份保存至 `ComicBatchJob(type=planning_backup,status=completed)`，完整内容存 `progress`，回读一致后才能更新/删除原记录。图片文件由媒体模块保留，规划模块不删除磁盘原图。生产任务列表排除规划归档。

详细规则见 `docs/wiki/workflows/comic-source-planning-integrity.md`。
