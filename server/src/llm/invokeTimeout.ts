import { getExecutionAbortSignal, throwIfExecutionAborted } from "../platform/execution";

export function throwIfInvocationAborted(signal?: AbortSignal): void {
  throwIfExecutionAborted();
  signal?.throwIfAborted();
}

function createTimeoutError(timeoutMs: number, label?: string): Error {
  const error = new Error(
    label?.trim()
      ? `[${label}] Request timed out after ${timeoutMs}ms.`
      : `Request timed out after ${timeoutMs}ms.`,
  );
  error.name = "TimeoutError";
  return error;
}

function createAbortError(reason?: unknown): Error {
  if (reason instanceof Error) {
    return reason;
  }
  const message = typeof reason === "string" && reason.trim()
    ? reason.trim()
    : "Request aborted.";
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

export async function runWithEnforcedTimeout<T>(input: {
  label?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  run: (signal?: AbortSignal) => Promise<T>;
}): Promise<T> {
  throwIfExecutionAborted();
  const signals = [input.signal, getExecutionAbortSignal()].filter((signal): signal is AbortSignal => Boolean(signal));
  const upstreamSignal = signals.length > 1 ? AbortSignal.any(signals) : signals[0];
  upstreamSignal?.throwIfAborted();
  const timeoutMs = typeof input.timeoutMs === "number" && Number.isFinite(input.timeoutMs) && input.timeoutMs > 0
    ? Math.floor(input.timeoutMs)
    : null;

  if (!timeoutMs && !upstreamSignal) {
    return input.run(undefined);
  }

  const controller = new AbortController();
  let timedOut = false;
  let timeoutHandle: NodeJS.Timeout | null = null;
  let removeAbortListener: (() => void) | null = null;

  const raceCandidates: Array<Promise<T>> = [];
  const workPromise = input.run(controller.signal);
  raceCandidates.push(workPromise);

  if (timeoutMs) {
    raceCandidates.push(new Promise<T>((_resolve, reject) => {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        controller.abort(createTimeoutError(timeoutMs, input.label));
        reject(createTimeoutError(timeoutMs, input.label));
      }, timeoutMs);
    }));
  }

  if (upstreamSignal) {
    raceCandidates.push(new Promise<T>((_resolve, reject) => {
      const onAbort = () => {
        controller.abort(upstreamSignal.reason);
        reject(createAbortError(upstreamSignal.reason));
      };

      if (upstreamSignal.aborted) {
        onAbort();
        return;
      }

      upstreamSignal.addEventListener("abort", onAbort, { once: true });
      removeAbortListener = () => {
        upstreamSignal.removeEventListener("abort", onAbort);
      };
    }));
  }

  try {
    return await Promise.race(raceCandidates);
  } catch (error) {
    if (timedOut) {
      throw createTimeoutError(timeoutMs ?? 0, input.label);
    }
    if (upstreamSignal?.aborted) {
      throw createAbortError(upstreamSignal.reason);
    }
    throw error;
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
    const cleanupAbortListener = removeAbortListener as (() => void) | null;
    if (cleanupAbortListener) {
      cleanupAbortListener();
    }
  }
}
