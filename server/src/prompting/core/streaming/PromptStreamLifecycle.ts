import type { BaseMessageChunk } from "@langchain/core/messages";
import { toText } from "@ai-novel/shared/utils/jsonText";
import { guardStreamStall } from "../../../llm/streamStallGuard";
import { getExecutionAbortSignal, throwIfExecutionAborted } from "../../../platform/execution";
import {
  extractLlmTokenUsage,
  mergeStreamTokenUsage,
  type LlmTokenUsageSnapshot,
} from "../../../llm/usageTracking";
import type { PromptExecutionOptions, PromptStreamRunResult } from "../promptTypes";

export function withExecutionSignal(options: PromptExecutionOptions = {}): PromptExecutionOptions {
  throwIfExecutionAborted();
  const signals = [options.signal, getExecutionAbortSignal()].filter(
    (signal): signal is AbortSignal => Boolean(signal),
  );
  const signal = signals.length > 1 ? AbortSignal.any(signals) : signals[0];
  signal?.throwIfAborted();
  return { ...options, signal };
}

export function createPromptStreamControl(options?: PromptExecutionOptions) {
  const controller = new AbortController();
  const resolved = withExecutionSignal(options);
  const signal = resolved.signal
    ? AbortSignal.any([resolved.signal, controller.signal])
    : controller.signal;
  const cancel = (reason?: unknown) =>
    controller.abort(reason ?? new DOMException("Stream cancelled.", "AbortError"));
  return { options: { ...resolved, signal }, signal, cancel };
}

export function observeStreamCompletion<T>(
  result: PromptStreamRunResult<T>,
): PromptStreamRunResult<T> {
  // Consumers often stop reading after a stream error and never await complete.
  // Keep its rejection observable to awaiters without an unhandled rejection.
  void result.complete.catch(() => {});
  return result;
}

export function captureStreamOutput(
  rawStream: AsyncIterable<BaseMessageChunk>,
  control: ReturnType<typeof createPromptStreamControl>,
  onChunk?: (content: string) => void,
) {
  let resolveText!: (value: string) => void;
  let rejectText!: (reason?: unknown) => void;
  let resolveUsage!: (value: LlmTokenUsageSnapshot | null) => void;
  let rejectUsage!: (reason?: unknown) => void;
  const completedText = new Promise<string>((resolve, reject) => {
    resolveText = resolve;
    rejectText = reject;
  });
  const completedUsage = new Promise<LlmTokenUsageSnapshot | null>((resolve, reject) => {
    resolveUsage = resolve;
    rejectUsage = reject;
  });
  void completedText.catch(() => {});
  void completedUsage.catch(() => {});
  const aborted = () => {
    rejectText(control.signal.reason);
    rejectUsage(control.signal.reason);
  };
  control.signal.addEventListener("abort", aborted, { once: true });
  if (control.signal.aborted) aborted();
  const stream = {
    async *[Symbol.asyncIterator]() {
      const chunks: string[] = [];
      let usage: LlmTokenUsageSnapshot | null = null;
      let completed = false;
      try {
        for await (const chunk of guardStreamStall(rawStream, {
          signal: control.signal,
          onStall: control.cancel,
        })) {
          const content = toText(chunk.content);
          chunks.push(content);
          onChunk?.(content);
          usage = mergeStreamTokenUsage(usage, extractLlmTokenUsage(chunk));
          yield chunk;
        }
        control.signal.throwIfAborted();
        completed = true;
        resolveText(chunks.join(""));
        resolveUsage(usage);
      } catch (error) {
        rejectText(error);
        rejectUsage(error);
        throw error;
      } finally {
        if (!completed) control.cancel();
        control.signal.removeEventListener("abort", aborted);
      }
    },
  };
  return { stream, completedText, completedUsage };
}
