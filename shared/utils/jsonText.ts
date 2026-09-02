/**
 * 纯文本 / JSON 提取工具。
 * 只依赖语言本身，不包含任何业务语义；服务端与客户端都可使用。
 */

export function toText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content.map((item) => {
      if (typeof item === "string") {
        return item;
      }
      if (item && typeof item === "object" && "text" in item && typeof item.text === "string") {
        return item.text;
      }
      return "";
    }).join("");
  }
  return JSON.stringify(content ?? "");
}

export function cleanJsonText(source: string): string {
  return source.replace(/```json|```/gi, "").trim();
}

export function extractJSONValue(source: string): string {
  const text = cleanJsonText(source);
  const objectStart = text.indexOf("{");
  const arrayStart = text.indexOf("[");
  const start = objectStart < 0
    ? arrayStart
    : arrayStart < 0
      ? objectStart
      : Math.min(objectStart, arrayStart);

  if (start < 0) {
    throw new Error("未检测到有效 JSON 值。");
  }

  const opener = text[start];
  const closer = opener === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "\"") {
      inString = !inString;
      continue;
    }
    if (char === opener) {
      depth += 1;
      continue;
    }
    if (char === closer) {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  throw new Error("未检测到完整 JSON 值。");
}

export function extractJSONObject(source: string): string {
  const extracted = extractJSONValue(source);
  if (!extracted.startsWith("{")) {
    throw new Error("未检测到有效 JSON 对象。");
  }
  return extracted;
}

export function parseJSONObject<T>(source: string): T {
  return JSON.parse(extractJSONObject(source)) as T;
}

export function safeParseJSON<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw?.trim()) {
    return fallback;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
