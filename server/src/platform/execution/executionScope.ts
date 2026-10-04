import { AsyncLocalStorage } from "node:async_hooks";

export type ExecutionFence =
  | { kind: "comic_batch"; jobId: string; leaseOwner: string }
  | { kind: "director"; commandId: string; leaseOwner: string; attempt?: number; controlAction?: "cancel" }
  | { kind: "agent"; runId: string }
  | { kind: "chapter_content"; novelId: string; chapterId: string; content: string | null }
  | { kind: "snapshot_restore"; checkpointId: string; metadataJson: string };

export interface ExecutionScope {
  signal?: AbortSignal;
  fences: readonly ExecutionFence[];
  /** A short transaction already holds every fence row until commit. */
  writeFenceHeld?: boolean;
}

const executionStorage = new AsyncLocalStorage<ExecutionScope>();

export class ExecutionStoppedError extends Error {
  readonly code = "EXECUTION_STOPPED";
  constructor(message = "执行已取消或失去执行权。") {
    super(message);
    this.name = "ExecutionStoppedError";
  }
}

export function getExecutionScope(): ExecutionScope | undefined {
  return executionStorage.getStore();
}

/** Attach the run identity after this invocation creates its persisted run. */
export function attachExecutionFence(fence: ExecutionFence): void {
  const scope = getExecutionScope();
  if (!scope) throw new Error("Cannot attach an execution fence outside its invocation.");
  if (scope.writeFenceHeld) throw new ExecutionStoppedError("不能在持有执行围栏的事务中追加执行身份。");
  scope.fences = [...scope.fences, fence];
}

export function getExecutionAbortSignal(): AbortSignal | undefined {
  return getExecutionScope()?.signal;
}

export function throwIfExecutionAborted(): void {
  const signal = getExecutionAbortSignal();
  if (signal?.aborted) {
    throw signal.reason instanceof Error ? signal.reason : new ExecutionStoppedError();
  }
}

export function runWithExecutionScope<T>(
  input: { signal?: AbortSignal; fence?: ExecutionFence; writeFenceHeld?: boolean },
  runner: () => T | Promise<T>,
): Promise<T> {
  const parent = getExecutionScope();
  const signals = [parent?.signal, input.signal].filter((value): value is AbortSignal => Boolean(value));
  const signal = signals.length > 1 ? AbortSignal.any(signals) : signals[0];
  const fences = [...(parent?.fences ?? [])];
  if (input.fence && !fences.some((fence) => JSON.stringify(fence) === JSON.stringify(input.fence))) {
    if (parent?.writeFenceHeld) {
      return Promise.reject(new ExecutionStoppedError("请在开始持久化事务前绑定全部执行围栏。"));
    }
    fences.push(input.fence);
  }
  return executionStorage.run({
    signal,
    fences,
    writeFenceHeld: input.writeFenceHeld ?? parent?.writeFenceHeld,
  }, async () => await runner());
}

/** Only terminal cleanup/control-plane work may escape a stopped execution. */
export function withoutExecutionScope<T>(runner: () => T): T {
  return executionStorage.exit(runner);
}

export function isExecutionStoppedError(error: unknown): boolean {
  return error instanceof ExecutionStoppedError
    || (error instanceof Error && error.name === "AbortError")
    || Boolean(getExecutionAbortSignal()?.aborted);
}
