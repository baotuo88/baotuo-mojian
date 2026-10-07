# 服务端测试进程隔离

## Background

服务端测试同时覆盖 Express 路由、Prisma、后台 Worker 和外部服务适配器。多个测试文件在同一个 Node 进程内加载时，全局单例、定时器、HTTP
server 和 mock 状态会互相影响，测试结果也可能在断言完成后持续占用进程。

## Decision

`server/scripts/run-tests.cjs` 的 `fast` 模式按测试文件顺序启动独立的
`node --test`
子进程。每个文件在退出后释放自己的数据库连接、定时器和网络资源；任一文件失败时，运行器立即使用相同退出码停止后续测试。

## Current Rule

- 定向测试直接使用 `node --test <absolute-test-path>`。
- 服务端快速测试使用 `node scripts/run-tests.cjs fast`。
- 测试脚本依赖 `cwd: serverRoot`，测试文件路径由运行器生成绝对路径。
- 新增测试应自行关闭 HTTP server、Worker、Prisma client 和其他长期资源。
- 运行器负责进程隔离和失败传播，不负责替测试文件清理资源。
- 直接依赖 SQLite schema 的路由测试必须通过专用启动器先创建临时数据库，再启动
  `node --test`；这样不会读取缺少最新表结构的开发库，也不会修改用户数据。
- 这类启动器应由 `run-tests.cjs fast`
  按测试文件名路由到，保持单文件独立进程和统一的失败传播规则。
- 真实 SQLite/Prisma 集成测试统一使用
  `server/tests/support/realSqliteHarness.cjs`。Prisma CLI 必须取自
  `server/node_modules/.bin/prisma`，并以 `serverRoot` 为工作目录执行
  `db push --config prisma.config.ts`；不要从工作区根目录通过 `pnpm --filter`
  间接启动，否则 Prisma config、schema 与 SQLite 路径解析会随调用环境漂移。
- 设置隔离 `DATABASE_URL` 后，业务场景必须在新的 Node 子进程中首次加载
  `dist/db/prisma.js`；不能在父进程已缓存 Prisma adapter 后再切换数据库 URL。
- `pnpm-workspace.yaml` 开启了
  `injectWorkspacePackages: true`，workspace 包会被注入为独立副本（例如
  `node_modules/.pnpm/@ai-novel+shared@file+shared/node_modules/@ai-novel/shared`）。因此
  `require("@ai-novel/shared/...")` 与 `require("../../shared/dist/...")`
  是两个不同的模块实例；跨包契约测试只能断言行为契约（`safeParse`
  结果、字段、严格性），不得断言对象身份。
- 工作区使用 `syncInjectedDepsAfterScripts: [build]`，由 pnpm 在包的 `build`
  脚本成功结束后同步注入副本。必须通过 `pnpm --filter @ai-novel/shared build`
  等 pnpm 脚本入口构建共享包；直接调用 `tsc`
  不会触发该同步。这样全新检出先安装、再构建时，服务端也能读取刚生成的
  `shared/dist`，避免开发机已有构建产物掩盖 CI 缺少导出的问题。
- 保留
  `injectWorkspacePackages: true`，因为 Docker 部署依赖注入包打包契约。不要为了修复缺少构建产物而关闭注入或依赖再次安装。`dev`
  的持续编译不会在每次重编译后触发脚本结束钩子；若运行时加载旧共享契约，先执行一次共享包的 pnpm
  `build` 脚本并检查注入路径，不要在业务代码里增加兼容分支。

## Failure Modes

- 使用 `require(file)` 在同一进程加载全部测试，会放大全局 mock 和后台资源泄漏。
- CI 在完成 TypeScript 构建后仍报 `MODULE_NOT_FOUND`，路径包含
  `server/node_modules/@ai-novel/shared/dist/` 时，先分别检查 `shared/dist`
  与注入副本。前者存在、后者缺失说明构建产物未同步；核对 pnpm 版本支持同步选项（项目固定的 10.6.0 支持）、工作区配置和实际构建命令。最小复现应从无
  `dist`
  的临时工作区开始，先安装再构建，再从消费者包加载共享导出；不要复用本机已经安装过构建产物的环境来证明全新 CI 可用。
- 测试文件使用相对路径启动时，工作目录变化会导致 `Could not find`。
- 从工作区根目录间接执行 Prisma CLI 可能出现
  `unable to open database file`；先核对 CLI 路径、`cwd`、`DATABASE_URL`
  和 schema config，不要通过改随机数据库路径或操作开发库来掩盖问题。
- 进程能够及时退出但出现断言失败时，应按业务契约分类处理，不能将失败归因于 teardown。
- 测试结果与当前工作流规则发生冲突时，应先检查 Wiki 和运行时代码的结构化契约，再更新过期断言；例如软性章节义务应记录为
  `continue_with_risk` 质量债务并继续生产链。
- 严格相等断言在 schema 上失败（`operator: 'strictEqual'`，`actual/expected`
  都显示为 `[ZodObject]` 且结构看起来一致）时，用 `require.resolve`
  分别解析两条 import 路径：一条指向
  `node_modules/.pnpm/@ai-novel+shared@file+shared/...`、另一条指向
  `shared/dist/...`，即可确认是注入副本造成的双实例。不要把它放宽成 `deepEqual`
  掩盖问题，应改为契约断言或统一 import 路径。
- 2026-09-27 已按该规则处理
  `server/tests/directorRiskContracts.test.js`：跨包身份断言改为“注册资产与 shared 契约行为一致 + 严格性验证”，fast 套件恢复全绿。后续新增跨包契约测试直接按此写法，不要再引入对象身份比较。

## 客户端测试发现边界

客户端运行器递归收集 `src/` 与 `tests/` 下的 `.test.js` 和
`.test.mjs`。不要依赖 shell 对 `**` 的展开行为，否则深层编辑器测试与顶层 `.mjs`
回归可能没有执行却显示命令成功。

仅当当前检出根本没有桌面包时，桌面专属合同测试允许显式跳过；存在桌面包但缺少组件时仍须失败。报告测试结果时分别列出通过和跳过数量。

## Related Modules

- `server/scripts/run-tests.cjs`
- `server/scripts/run-chapter-runtime-route-tests.cjs`
- `server/tests/`
- `server/src/services/rag/RagWorker.ts`
- `server/src/app.ts`
- `pnpm-workspace.yaml`
- `server/tests/directorRiskContracts.test.js`
- `shared/`
