// 流式响应中途挂起守护：LLM provider 半开连接会让流停在"不再有新 chunk、
// 也不结束"的状态，lease 续约与调用方心跳都感知不到。此守护在连续
// stallTimeoutMs 没有新 chunk 时抛错，让上层重试/恢复机制接管。

export const DEFAULT_STREAM_STALL_TIMEOUT_MS = 8 * 60_000;

export function guardStreamStall<T>(
  stream: AsyncIterable<T>,
  options?: { stallTimeoutMs?: number; label?: string },
): AsyncIterable<T> {
  const stallTimeoutMs = typeof options?.stallTimeoutMs === "number" && options.stallTimeoutMs > 0
    ? options.stallTimeoutMs
    : DEFAULT_STREAM_STALL_TIMEOUT_MS;
  const label = options?.label?.trim() || "LLM stream";

  async function* guarded(): AsyncGenerator<T, void, void> {
    const iterator = stream[Symbol.asyncIterator]();
    try {
      while (true) {
        let release: (() => void) | null = null;
        const stalled = new Promise<never>((_resolve, reject) => {
          const handle = setTimeout(
            () => reject(new Error(`${label} stalled: no new chunk within ${Math.round(stallTimeoutMs / 1000)}s.`)),
            stallTimeoutMs,
          );
          release = () => clearTimeout(handle);
        });
        try {
          const result = await Promise.race([iterator.next(), stalled]);
          if (result.done) {
            return;
          }
          yield result.value;
        } catch (error) {
          if (error instanceof Error && error.message.includes("stalled")) {
            void iterator.return?.(undefined);
          }
          throw error;
        } finally {
          (release as (() => void) | null)?.();
        }
      }
    } finally {
      const maybeReturn = iterator.return as ((value?: unknown) => Promise<IteratorResult<T>>) | undefined;
      if (maybeReturn) {
        await maybeReturn.call(iterator, undefined).catch(() => undefined);
      }
    }
  }

  return guarded();
}
