import { StructuredOutputError, extractStructuredOutputErrorCategory } from "./structuredOutput";

/**
 * 模型通道瞬时故障的识别与重试。
 *
 * 背景：第三方 OpenAI 兼容网关（NewAPI / One-API 等）在限流、上游账号耗尽或
 * 网络抖动时会返回 429/5xx，或直接断开连接。这类失败与"模型能力不足、输出结构
 * 不合法"性质不同，属于可恢复的传输问题，不应该让整条生产链停下来等人恢复。
 *
 * 这里只做传输层安全兜底判定，不参与任何 AI 语义判断。
 */

const RETRYABLE_HTTP_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

const RETRYABLE_ERROR_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EPIPE",
  "EAI_AGAIN",
  "ERR_STREAM_PREMATURE_CLOSE",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
  "UND_ERR_HEADERS_TIMEOUT",
]);

const RETRYABLE_MESSAGE_PATTERN = /\b(429|500|502|503|504)\b|rate limit|too many requests|no available account|temporarily unavailable|service unavailable|socket hang up|premature close/i;

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 800;
const DEFAULT_MAX_DELAY_MS = 8_000;
const MAX_RETRY_AFTER_MS = 30_000;

function readNumericField(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function extractHttpStatus(error: unknown): number | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (typeof current !== "object") {
      return undefined;
    }
    const record = current as Record<string, unknown>;
    const response = record.response as Record<string, unknown> | undefined;
    const status = readNumericField(record.status)
      ?? readNumericField(record.statusCode)
      ?? (response ? readNumericField(response.status) ?? readNumericField(response.statusCode) : undefined);
    if (typeof status === "number") {
      return status;
    }
    current = record.cause;
  }
  return undefined;
}

function extractErrorCode(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (typeof current !== "object") {
      return undefined;
    }
    const record = current as Record<string, unknown>;
    const code = record.code ?? record.errno ?? (current instanceof Error ? undefined : record.name);
    if (typeof code === "string" && code.trim()) {
      return code.trim().toUpperCase();
    }
    current = record.cause;
  }
  return undefined;
}

function extractMessage(error: unknown): string {
  if (error instanceof Error) {
    return `${error.message} ${error.cause instanceof Error ? error.cause.message : ""}`.trim();
  }
  return typeof error === "string" ? error : "";
}

/** 判断错误是否属于可重试的通道/传输故障。 */
export function isRetryableLlmError(error: unknown): boolean {
  const status = extractHttpStatus(error);
  if (typeof status === "number") {
    return RETRYABLE_HTTP_STATUS.has(status);
  }
  const code = extractErrorCode(error);
  if (code && RETRYABLE_ERROR_CODES.has(code)) {
    return true;
  }
  return RETRYABLE_MESSAGE_PATTERN.test(extractMessage(error));
}

/**
 * 判断失败是否属于"可以稍后自动重试"的传输类问题。
 * 结构化输出的 transport_error 说明模型没交付可用内容，也可能是通道瞬时异常，
 * 因此和通道限流一起归类为可重试；schema/内容类问题不在此列。
 */
export function isTransientStructuredFailure(error: unknown): boolean {
  if (error instanceof StructuredOutputError) {
    return error.category === "transport_error";
  }
  if (extractStructuredOutputErrorCategory(extractMessage(error)) === "transport_error") {
    return true;
  }
  return isRetryableLlmError(error);
}

function readRetryAfterMs(error: unknown): number | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }
  const record = error as Record<string, unknown>;
  const headers = (record.headers
    ?? (record.response as Record<string, unknown> | undefined)?.headers) as Record<string, unknown> | undefined;
  if (!headers) {
    return undefined;
  }
  const raw = headers["retry-after"] ?? headers["Retry-After"];
  if (typeof raw !== "string" && typeof raw !== "number") {
    return undefined;
  }
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) {
    const ms = seconds * 1000;
    return ms <= MAX_RETRY_AFTER_MS ? ms : undefined;
  }
  const date = Date.parse(String(raw));
  if (Number.isNaN(date)) {
    return undefined;
  }
  const ms = date - Date.now();
  return ms > 0 && ms <= MAX_RETRY_AFTER_MS ? ms : undefined;
}

/** 按指数退避计算下一次重试的等待时间。 */
export function resolveTransientRetryDelayMs(
  completedAttempt: number,
  error?: unknown,
  options: { baseDelayMs?: number; maxDelayMs?: number } = {},
): number {
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const retryAfterMs = readRetryAfterMs(error);
  if (typeof retryAfterMs === "number") {
    return retryAfterMs;
  }
  const exponential = Math.min(maxDelayMs, baseDelayMs * 2 ** Math.max(0, completedAttempt - 1));
  const jitter = exponential * 0.2 * Math.random();
  return Math.round(Math.min(maxDelayMs, exponential + jitter));
}

export interface TransientRetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  signal?: AbortSignal;
  onRetry?: (info: { attempt: number; nextAttempt: number; delayMs: number; error: unknown }) => void;
}

/**
 * 执行一次可重试的调用。
 * 只在确认是瞬时故障且调用方没有取消时重试；其余错误原样抛出。
 */
export async function runWithTransientRetry<T>(
  run: (attempt: number) => Promise<T>,
  options: TransientRetryOptions = {},
): Promise<T> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await run(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || options.signal?.aborted || !isRetryableLlmError(error)) {
        throw error;
      }
      const delayMs = resolveTransientRetryDelayMs(attempt, error, options);
      options.onRetry?.({ attempt, nextAttempt: attempt + 1, delayMs, error });
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      if (options.signal?.aborted) {
        throw error;
      }
    }
  }
  throw lastError;
}
