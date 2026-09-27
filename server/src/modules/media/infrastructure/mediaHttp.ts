import type { MediaProviderOptions } from "../domain/mediaProviderContracts";

export function readCostCurrency(): string {
  return process.env.DRAMA_COST_CURRENCY?.trim() || "CNY";
}

export function normalizeCostValue(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
}

export function normalizeTimeoutMs(value: unknown, fallback = 120_000): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : fallback;
}

export function normalizeBooleanFlag(value: unknown): boolean {
  const raw = String(value ?? "").trim().toLowerCase();
  return ["1", "true", "yes", "y", "on"].includes(raw);
}

export function joinUrl(baseURL: string, pathOrUrl: string): string {
  const target = pathOrUrl.trim();
  if (/^https?:\/\//i.test(target)) {
    return target;
  }
  const base = baseURL.trim().replace(/\/+$/, "");
  const path = target.startsWith("/") ? target : `/${target}`;
  return `${base}${path}`;
}

/** 支持 a.b.0.c 形式的路径读取，用于适配不同供应商的响应结构。 */
export function readPathField(source: unknown, path: string): unknown {
  const segments = path.split(".").map((segment) => segment.trim()).filter(Boolean);
  let current: unknown = source;
  for (const segment of segments) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return undefined;
      }
      current = current[index];
      continue;
    }
    if (!current || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

export function readStringFieldDeep(source: unknown, paths: string[]): string | undefined {
  for (const path of paths) {
    const value = readPathField(source, path);
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

export function readNumberField(source: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = Number(source[key]);
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
  }
  return undefined;
}

export async function readJsonResponse(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text.trim()) {
    return {};
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : { rawText: text };
  } catch {
    return { rawText: text };
  }
}

export function buildHeaders(apiKey?: string | null, extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(extra ?? {}) };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

export type MediaTaskStatus = "queued" | "running" | "succeeded" | "failed";

const STATUS_ALIASES: Record<string, MediaTaskStatus> = {
  success: "succeeded",
  succeeded: "succeeded",
  completed: "succeeded",
  complete: "succeeded",
  done: "succeeded",
  finished: "succeeded",
  fail: "failed",
  failed: "failed",
  error: "failed",
  cancelled: "failed",
  canceled: "failed",
  running: "running",
  processing: "running",
  generating: "running",
  in_progress: "running",
  pending: "queued",
  queued: "queued",
  submitted: "queued",
  created: "queued",
};

export function normalizeTaskStatus(value: unknown, statusMap?: Record<string, string>): MediaTaskStatus {
  const raw = String(value ?? "").trim().toLowerCase();
  const mapped = statusMap?.[raw];
  if (mapped && STATUS_ALIASES[mapped]) {
    return STATUS_ALIASES[mapped];
  }
  return STATUS_ALIASES[raw] ?? "queued";
}

/**
 * 用请求字段渲染 options.payload 模板。单独成段的 ${key} 会保留原始类型（数组/数字），
 * 嵌在字符串里的 ${key} 会按文本替换。未提供的字段替换为空串。
 */
export function resolvePayloadTemplate(
  template: Record<string, unknown>,
  context: Record<string, unknown>,
): Record<string, unknown> {
  const resolveValue = (value: unknown): unknown => {
    if (typeof value === "string") {
      const exact = /^\$\{([a-zA-Z0-9_]+)\}$/.exec(value.trim());
      if (exact) {
        return context[exact[1]] ?? "";
      }
      return value.replace(/\$\{([a-zA-Z0-9_]+)\}/g, (_match, key: string) => {
        const replacement = context[key];
        return replacement === undefined || replacement === null ? "" : String(replacement);
      });
    }
    if (Array.isArray(value)) {
      return value.map(resolveValue);
    }
    if (value && typeof value === "object") {
      return resolvePayloadTemplate(value as Record<string, unknown>, context);
    }
    return value;
  };
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(template)) {
    output[key] = resolveValue(value);
  }
  return output;
}

export function mergeProviderHeaders(options: MediaProviderOptions): Record<string, string> | undefined {
  return options.headers;
}
