# 服务端测试进程隔离

## Background

服务端测试同时覆盖 Express 路由、Prisma、后台 Worker 和外部服务适配器。多个测试文件在同一个 Node 进程内加载时，全局单例、定时器、HTTP server 和 mock 状态会互相影响，测试结果也可能在断言完成后持续占用进程。

## Decision

`server/scripts/run-tests.cjs` 的 `fast` 模式按测试文件顺序启动独立的 `node --test` 子进程。每个文件在退出后释放自己的数据库连接、定时器和网络资源；任一文件失败时，运行器立即使用相同退出码停止后续测试。

## Current Rule

- 定向测试直接使用 `node --test <absolute-test-path>`。
- 服务端快速测试使用 `node scripts/run-tests.cjs fast`。
- 测试脚本依赖 `cwd: serverRoot`，测试文件路径由运行器生成绝对路径。
- 新增测试应自行关闭 HTTP server、Worker、Prisma client 和其他长期资源。
- 运行器负责进程隔离和失败传播，不负责替测试文件清理资源。
- 直接依赖 SQLite schema 的路由测试必须通过专用启动器先创建临时数据库，再启动 `node --test`；这样不会读取缺少最新表结构的开发库，也不会修改用户数据。
- 这类启动器应由 `run-tests.cjs fast` 按测试文件名路由到，保持单文件独立进程和统一的失败传播规则。
- 真实 SQLite/Prisma 集成测试统一使用 `server/tests/support/realSqliteHarness.cjs`。Prisma CLI 必须取自 `server/node_modules/.bin/prisma`，并以 `serverRoot` 为工作目录执行 `db push --config prisma.config.ts`；不要从工作区根目录通过 `pnpm --filter` 间接启动，否则 Prisma config、schema 与 SQLite 路径解析会随调用环境漂移。
- 设置隔离 `DATABASE_URL` 后，业务场景必须在新的 Node 子进程中首次加载 `dist/db/prisma.js`；不能在父进程已缓存 Prisma adapter 后再切换数据库 URL。

## Failure Modes

- 使用 `require(file)` 在同一进程加载全部测试，会放大全局 mock 和后台资源泄漏。
- 测试文件使用相对路径启动时，工作目录变化会导致 `Could not find`。
- 从工作区根目录间接执行 Prisma CLI 可能出现 `unable to open database file`；先核对 CLI 路径、`cwd`、`DATABASE_URL` 和 schema config，不要通过改随机数据库路径或操作开发库来掩盖问题。
- 进程能够及时退出但出现断言失败时，应按业务契约分类处理，不能将失败归因于 teardown。
- 测试结果与当前工作流规则发生冲突时，应先检查 Wiki 和运行时代码的结构化契约，再更新过期断言；例如软性章节义务应记录为 `continue_with_risk` 质量债务并继续生产链。

## Related Modules

- `server/scripts/run-tests.cjs`
- `server/scripts/run-chapter-runtime-route-tests.cjs`
- `server/tests/`
- `server/src/services/rag/RagWorker.ts`
- `server/src/app.ts`
