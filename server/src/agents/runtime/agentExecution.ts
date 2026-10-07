import {
  ExecutionStoppedError,
  runWithExecutionScope,
  throwIfExecutionAborted,
} from "../../platform/execution";

const executions = new Map<string, Set<AbortController>>();

export function registerAgentExecution(runId: string, controller: AbortController): () => void {
  let controllers = executions.get(runId);
  if (!controllers) {
    controllers = new Set();
    executions.set(runId, controllers);
  }
  controllers.add(controller);
  return () => {
    controllers?.delete(controller);
    if (controllers?.size === 0) executions.delete(runId);
  };
}

export function cancelAgentExecution(runId: string): void {
  for (const controller of executions.get(runId) ?? []) {
    controller.abort(new ExecutionStoppedError("任务已取消。"));
  }
}

export async function runWithAgentExecution<T>(
  runId: string,
  runner: () => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const unregister = registerAgentExecution(runId, controller);
  try {
    return await runWithExecutionScope(
      { signal: controller.signal, fence: { kind: "agent", runId } },
      async () => {
        throwIfExecutionAborted();
        return runner();
      },
    );
  } finally {
    controller.abort(new ExecutionStoppedError("本次任务执行已结束。"));
    unregister();
  }
}
