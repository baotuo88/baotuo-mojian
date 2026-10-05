# 漫画内容映射与规划持久化

本模块负责将注册 AI 返回的漫画话序映射到源小说章节，并保护已有分话、分镜与事实。外部服务只从 `./planning` facade 引入能力。

- `sourceMapping.ts`：读取 `ComicEpisode.scriptConfig.sourceRange`，校验范围属于导入内容包；旧项目没有映射时调用 `comic.sourceMapping` 注册 Prompt，不能按话序猜章序。
- `sourceBundle.ts`：原创灵感与导入文本经注册的 `comic.sourceBundle` 结构化 AI 整理为同一内容契约；小说仍通过 adaptation 端口读取。原文保留全文，不能调用短剧服务或用关键词拆故事。
- `planningPersistence.ts`：分话版本锁、活动生产任务检查、完整规划归档与回读校验。批量任务的租约规则从 `production` facade 获取，不在规划模块重新定义。
- `ComicEpisodePlanService` 与 `ComicPanelScriptService` 保留应用编排和公开入口。模型调用在事务外，提交前获取分话行锁并重新检查当前稿件、源资料和活动任务。

分话锁使用条件 no-op 写入 `updatedAt`，既获得数据库写锁，也保持原版本指纹。多个分话按 ID 排序加锁。分镜内容编辑、事实写入、规划替换使用相同分话锁序；事实在锁内复核分镜版本，不能写入被替换脚本的迟到结果。

手工编辑对白或画面也必须在同一锁内归档并移除本话旧事实，防止后话误信旧稿；手工保存不隐式调用付费模型。下一次显式 AI 分镜/事实生成根据动作、画面及对白重新提取事实，提取时区分已确认信息与角色未经证实的主张。

续话与区间重规划必须把范围外已确定的话数、大纲、结尾和源范围交给 AI。源节拍是背景，不能让每批续话从头重演。提交时复核这些前后话决策，邻话发生变化则拒绝过时结果；不因图片生产状态或更新时间变化误判大纲冲突。小说正文读取检查范围内每章存在且非空，标题不能代替正文。`loadBundle` 仍允许待写章节的规划节拍，保持短剧共用接口的规划能力。

替换已有规划必须由 HTTP 输入 `replaceExisting=true` 表示明确选择；不接受以重新点击生成隐式覆盖。备份保存至 `ComicBatchJob(type=planning_backup,status=completed)`，完整内容存 `progress`，回读一致后才能更新/删除原记录。图片文件由媒体模块保留，规划模块不删除磁盘原图。生产任务列表排除规划归档。

详细规则见 `docs/wiki/workflows/comic-source-planning-integrity.md`。
