// 流式响应中途挂起守护：LLM provider 半开连接会让流停在"不再有新 chunk、
// 也不结束"的状态，lease 续约与调用方心跳都感知不到。此守护在连续
// stallTimeoutMs 没有新 chunk 时抛错，让上层重试/恢复机制接管。

export const DEFAULT_STREAM_STALL_TIMEOUT_MS = 8 * 60_000;

export function guardStreamStall<T>(
  stream: AsyncIterable<T>,
  options?: { stallTimeoutMs?: number; label?: string; signal?: AbortSignal; onStall?: (error: Error) => void },
): AsyncIterable<T> {
  const stallTimeoutMs = typeof options?.stallTimeoutMs === "number" && options.stallTimeoutMs > 0
    ? options.stallTimeoutMs
    : DEFAULT_STREAM_STALL_TIMEOUT_MS;
  const label = options?.label?.trim() || "LLM stream";
  const signal = options?.signal;

  async function* guarded(): AsyncGenerator<T, void, void> {
    signal?.throwIfAborted();
    const iterator = stream[Symbol.asyncIterator]();
    let completed = false;
    try {
      while (true) {
        signal?.throwIfAborted();
        let release: (() => void) | null = null;
        const stalled = new Promise<never>((_resolve, reject) => {
          const onAbort = () => reject(signal?.reason ?? new Error("Stream cancelled."));
          signal?.addEventListener("abort", onAbort, { once: true });
          const handle = setTimeout(
            () => {
              const error = new Error(`${label} stalled: no new chunk within ${Math.round(stallTimeoutMs / 1000)}s.`);
              error.name = "StreamStallError";
              try { options?.onStall?.(error); } catch { /* Preserve the timeout failure. */ }
              reject(error);
            },
            stallTimeoutMs,
          );
          release = () => {
            clearTimeout(handle);
            signal?.removeEventListener("abort", onAbort);
          };
        });
        let result: IteratorResult<T>;
        try {
          result = await Promise.race([iterator.next(), stalled]);
        } finally {
          (release as (() => void) | null)?.();
        }
        if (result.done) { completed = true; return; }
        signal?.throwIfAborted();
        yield result.value;
      }
    } finally {
      // return() queues behind a pending async-generator next(). Timeout and
      // cancellation must not wait for that same hung read. The owner aborts the
      // request through onStall/signal; iterator cleanup remains best effort.
      if (!completed) void Promise.resolve().then(() => iterator.return?.()).catch(() => {});
    }
  }

  return guarded();
}
