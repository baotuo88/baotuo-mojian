import type { Request, Response } from "express";
import type { BaseMessageChunk } from "@langchain/core/messages";
import type { SSEFrame } from "@ai-novel/shared/types/api";
import { guardStreamStall } from "./streamStallGuard";
import { runWithExecutionScope } from "../platform/execution";

export type WritableSSEFrame = Extract<
  SSEFrame,
  {
    type:
      | "chunk"
      | "done"
      | "error"
      | "ping"
      | "reasoning"
      | "runtime_package"
      | "tool_call"
      | "tool_result"
      | "approval_required"
      | "approval_resolved"
      | "run_status";
  }
>;

export interface StreamDonePayload {
  fullContent?: string;
  frames?: WritableSSEFrame[];
}

export interface StreamDoneHelpers {
  writeFrame: (payload: WritableSSEFrame) => void;
}

export function writeSSEFrame(res: Response, payload: WritableSSEFrame): void {
  if (res.writableEnded || res.destroyed) {
    return;
  }
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function normalizeChunkContent(content: BaseMessageChunk["content"]): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        if (typeof part === "object" && part && "text" in part && typeof part.text === "string") {
          return part.text;
        }
        return "";
      })
      .join("");
  }

  return "";
}

export function initSSE(res: Response): () => void {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const heartbeat = setInterval(() => {
    writeSSEFrame(res, { type: "ping" });
  }, 15000);

  return () => clearInterval(heartbeat);
}

export interface ClientAbort {
  signal: AbortSignal;
  dispose: () => void;
}

// Fires `abort` when the HTTP client disconnects before the response has finished,
// so in-flight LLM work that reads the signal (LangChain `.stream`/`.invoke`, LangGraph
// `.invoke`) stops burning provider tokens instead of running to completion into a dead
// socket. A normal end (response already finished) does NOT abort. Always call dispose()
// in a finally to detach listeners. Request close denotes completed POST input;
// response close denotes the lifetime of the output connection.
export function attachClientAbort(req: Request, res: Response): ClientAbort {
  const controller = new AbortController();
  const onClose = () => {
    if (!res.writableEnded) {
      controller.abort();
    }
  };
  res.on("close", onClose);
  req.on("aborted", onClose);
  if (res.destroyed || req.aborted) onClose();
  return {
    signal: controller.signal,
    dispose: () => {
      res.off("close", onClose);
      req.off("aborted", onClose);
    },
  };
}

/** Keep model setup, streaming, and final persistence under the HTTP lifetime. */
export async function runClientSSE(
  req: Request,
  res: Response,
  prepare: () => Promise<{
    stream: AsyncIterable<BaseMessageChunk>;
    onDone?: Parameters<typeof streamToSSE>[2];
  }>,
): Promise<void> {
  const client = attachClientAbort(req, res);
  try {
    await runWithExecutionScope({ signal: client.signal }, async () => {
      client.signal.throwIfAborted();
      const { stream, onDone } = await prepare();
      await streamToSSE(res, stream, onDone, client.signal);
    });
  } finally {
    client.dispose();
  }
}

export async function streamToSSE(
  res: Response,
  stream: AsyncIterable<BaseMessageChunk>,
  onDone?: (
    fullContent: string,
    helpers: StreamDoneHelpers,
  ) => void | StreamDonePayload | Promise<void | StreamDonePayload>,
  signal?: AbortSignal,
): Promise<void> {
  if (res.destroyed || signal?.aborted) return;
  const disposeHeartbeat = initSSE(res);
  let fullContent = "";

  try {
    for await (const chunk of guardStreamStall(stream, { signal })) {
      if (res.writableEnded || res.destroyed || signal?.aborted) {
        break;
      }
      const text = normalizeChunkContent(chunk.content);
      if (!text) {
        continue;
      }
      fullContent += text;
      writeSSEFrame(res, { type: "chunk", content: text });
    }

    if (signal?.aborted || res.destroyed || res.writableEnded) return;
    const donePayload = await onDone?.(fullContent, {
      writeFrame: (payload) => writeSSEFrame(res, payload),
    });
    if (donePayload?.frames?.length) {
      for (const frame of donePayload.frames) {
        writeSSEFrame(res, frame);
      }
    }
    if (donePayload?.fullContent) {
      fullContent = donePayload.fullContent;
    }
    writeSSEFrame(res, { type: "done", fullContent });
  } catch (error) {
    writeSSEFrame(res, {
      type: "error",
      error: error instanceof Error ? error.message : "流式输出失败。",
    });
  } finally {
    disposeHeartbeat();
    if (!res.writableEnded && !res.destroyed) {
      res.end();
    }
  }
}
