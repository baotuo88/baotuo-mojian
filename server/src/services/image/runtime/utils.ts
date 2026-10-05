/**
 * 图像生成 runtime 工具函数（单一来源）
 *
 * 替代散落在 4 个 comic service + 2 个 drama service 中的同名重复实现。
 */
import path from "path";
export { saveImageToDisk } from "../infrastructure";

/** 安全 JSON 解析（解析失败返回 fallback） */
export function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** 根据 URL 推断扩展名（png/jpg/webp）；无法识别时默认 png */
export function inferExtension(imageUrl: string): string {
  if (imageUrl.startsWith("data:image/jpeg")) return "jpg";
  if (imageUrl.startsWith("data:image/webp")) return "webp";
  try {
    const ext = path.extname(new URL(imageUrl).pathname).replace(".", "").toLowerCase();
    return ext || "png";
  } catch {
    return "png";
  }
}

/** 标准化错误信息为字符串 */
export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}
