# 执行安全边界

本模块拥有执行作用域、取消信号传播和数据库写权限检查。外部通过 `index.ts` 使用能力。

- `executionScope.ts`：进程内异步调用的信号与执行身份，不依赖数据库实例或业务服务。
- `persistenceFence.ts`：持久执行权与章节正文版本合同及短事务入口；只通过传入的 Prisma 客户端访问执行行或正文行。
- `prismaExecutionGuard.ts`：共享 Prisma 的适配器。保护独立写、交互式事务及惰性数组事务，避免在模型调用期间持有锁。

Worker/Agent/Creative Hub 负责绑定执行身份；LLM 入口消费信号；数据库适配器最终拒绝过期结果。清理代码只能在确有控制面职责时使用 `withoutExecutionScope`，不能借此恢复业务写入权限。

详细规则见 [执行取消与持久化围栏](../../../../docs/wiki/workflows/execution-cancellation-and-fencing.md)。
