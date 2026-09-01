# 2026-08-31 Beta 上线候选检查点

## 目标形态

当前候选面向 Windows 桌面本地创作：服务端只监听 loopback，SQLite 保存在桌面用户数据目录，前端由桌面壳加载。当前版本没有真实用户认证，不得把 Express API 直接绑定公网或局域网地址。服务器部署只能通过同机反向代理接入，并且在认证能力完成前不作为多用户公网服务发布。

## 已自动验证

- Prisma SQLite/PostgreSQL 双 schema 结构一致。
- 文档 manifest 完整。
- Shared、Server、Client、Desktop TypeScript 检查通过。
- Server fast 测试通过。
- Server integration 覆盖自动导演控制面、章节真实落库、Worker 中断恢复、双进程 claim、RAG、Prompt、runtime migration 与生产启动。
- Client 测试 78 项通过。
- Web production build 通过。
- Desktop-target client build 通过。
- 隔离 SQLite 下以 `NODE_ENV=production` 启动真实服务、访问 liveness、关闭后台服务通过。
- 生产缺失 `DATABASE_URL` 会拒绝启动；生产直接绑定非 loopback 地址会拒绝启动。
- SQLite 开发库恢复覆盖 dry-run、执行前备份、损坏保护、完整回灌与恢复后检查。
- 正式桌面发布只接受与 `desktop/package.json` 一致的 `vX.Y.Z`，且无 Windows 签名材料时失败。

## 外部环境必须完成

### Windows Beta 包

在 GitHub `windows-latest` 或等价 Windows 环境运行 `Desktop Beta Package Verification`，确认：

- stage desktop 成功；
- packaged layout 验证通过；
- NSIS installer 构建验证通过；
- 安装、首次启动、关闭、重启无白屏；
- 卸载不删除用户作品；
- 重装后原作品可读取；
- 老 Beta 到新 Beta 的更新检查、下载和重启安装通过。

### 模型与核心创作人工验收

使用计划支持的真实模型账号完成：

- 新建自动导演任务并确认方向；
- 等待规划完成并选择生产方式；
- 生成至少一章真实正文；
- 在章节边界关闭并重启应用，确认任务与正文可继续；
- 检查任务抽屉、AI 驾驶舱、小说工作区恢复位置一致；
- 检查简易与专业模式切换不丢正文和规划；
- 检查导出整本 Markdown/JSON。

### PostgreSQL（仅服务器部署需要）

当前默认归档烟测会安全跳过。服务器部署采用 PostgreSQL 时，必须在专用测试实例完成：

- 配置 `ENABLE_POSTGRES_BACKUP_SMOKE=1` 与数据库名带 `test` 的 `TEST_POSTGRES_URL`；
- `pg_dump --format=custom` 和 `pg_restore --list` 通过；
- 将归档恢复到另一个隔离测试数据库；
- 执行 migration/schema 验证；
- 对比关键表数量、小说正文、章节状态、任务 checkpoint 和角色数据抽样；
- 验证托管服务 PITR/WAL 恢复流程。

不得在开发库或生产库上执行 restore 验收。

## 当前非阻断性能项

- Web build 的 vendor chunk 约 1.58 MB，小说工作区 route chunk 约 640 KB；构建通过，但后续应继续按路由和编辑器依赖拆包。
- Browserslist 数据提示已陈旧；更新前需评估 lockfile 变化并在独立阶段验证，不在本稳定性候选中临时升级依赖。

## 推进规则

- `beta` 完成上述 Windows 与人工验收前，不合并到 `main`。
- 正式发布前更新 `desktop/package.json` 到目标稳定版本，保持 release notes 与 README 最新区块一致。
- 只从已经过 Beta 验证并合入 `main` 的 commit 创建匹配版本的 `vX.Y.Z` tag。
- 正式 Windows Release 必须提供代码签名材料；不允许通过 unsigned 开关绕过。
