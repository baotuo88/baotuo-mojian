import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getExecutionAbortSignal, throwIfExecutionAborted } from "../../../platform/execution";

const MAX_IMAGE_BYTES = 32 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 90_000;

/** Bound memory/disk usage and download lifetime independently of the generation request. */
export async function saveImageToDisk(imageUrl: string, destPath: string, options: {
  maxBytes?: number; timeoutMs?: number; signal?: AbortSignal;
} = {}): Promise<void> {
  throwIfExecutionAborted();
  const maxBytes = options.maxBytes ?? MAX_IMAGE_BYTES;
  const timeoutMs = options.timeoutMs ?? DOWNLOAD_TIMEOUT_MS;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    throw new Error("图片下载限制配置无效。");
  }
  const executionSignal = getExecutionAbortSignal();
  const deadline = AbortSignal.timeout(timeoutMs);
  const signal = AbortSignal.any([deadline, ...[executionSignal, options.signal].filter((value): value is AbortSignal => !!value)]);
  let data: Buffer | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  if (imageUrl.startsWith("data:")) {
    const match = /^data:image\/(?:png|jpeg|jpg|webp);base64,([\s\S]+)$/i.exec(imageUrl);
    if (!match) throw new Error("图片数据格式无效。");
    if (match[1].length > Math.ceil(maxBytes / 3) * 4 + 4) throw new Error("图片过大，无法保存。");
    data = Buffer.from(match[1], "base64");
    if (!data.length || data.length > maxBytes) throw new Error("图片为空或过大，无法保存。");
  } else {
    const url = new URL(imageUrl);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("图片下载地址无效。");
    const response = await fetch(url, { signal });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`图片下载失败 (${response.status})，请重新生成或稍后重试。`);
    }
    const length = Number(response.headers.get("content-length"));
    if (Number.isFinite(length) && length > maxBytes) {
      await response.body?.cancel();
      throw new Error("图片过大，无法保存。");
    }
    if (!response.body) throw new Error("图片下载结果为空。");
    reader = response.body.getReader();
  }
  const abortRead = () => { void reader?.cancel(signal.reason).catch(() => {}); };
  signal.addEventListener("abort", abortRead, { once: true });
  const temporary = `${destPath}.partial-${randomUUID()}`;
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
  try {
    signal.throwIfAborted();
    await fs.mkdir(path.dirname(destPath), { recursive: true });
    handle = await fs.open(temporary, "wx");
    if (data) await handle.writeFile(data, { signal });
    else {
      let received = 0;
      while (reader) {
        const chunk = await reader.read();
        signal.throwIfAborted();
        if (chunk.done) break;
        received += chunk.value.byteLength;
        if (received > maxBytes) throw new Error("图片过大，无法保存。");
        await handle.writeFile(chunk.value, { signal });
      }
      if (!received) throw new Error("图片下载结果为空。");
    }
    await handle.close(); handle = undefined;
    signal.throwIfAborted();
    throwIfExecutionAborted();
    await fs.rename(temporary, destPath);
  } finally {
    signal.removeEventListener("abort", abortRead);
    await reader?.cancel().catch(() => {});
    await handle?.close().catch(() => {});
    await fs.unlink(temporary).catch(() => {});
  }
}
