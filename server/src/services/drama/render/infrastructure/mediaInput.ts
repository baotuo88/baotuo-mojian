import { lookup } from "node:dns/promises";
import { createWriteStream, promises as fs } from "node:fs";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { resolveMediaAssetPath } from "../../../../modules/media";
import { resolveGeneratedMediaRoot } from "../../../../runtime/appPaths";
import { AppError } from "../../../../middleware/errorHandler";
import type { RenderLimits } from "../domain/renderContract";

/** Conservative public-address policy; IPv6 must be global unicast outside special ranges. */
export function isPublicMediaAddress(address: string): boolean {
  const ip = address.toLowerCase();
  if (isIP(ip) === 4) {
    const [a, b, c] = ip.split(".").map(Number);
    return a !== 0 && a !== 10 && a !== 127 && a < 224
      && !(a === 100 && b >= 64 && b <= 127) && !(a === 169 && b === 254)
      && !(a === 172 && b >= 16 && b <= 31) && !(a === 192 && b === 168)
      && !(a === 192 && b === 0) && !(a === 192 && b === 88 && c === 99)
      && !(a === 198 && (b === 18 || b === 19)) && !(a === 198 && b === 51 && c === 100)
      && !(a === 203 && b === 0 && c === 113);
  }
  if (isIP(ip) !== 6 || !/^[23][0-9a-f]{3}:/.test(ip)) return false;
  // 2001 contains transition/tunnelling, benchmarking and documentation space.
  return !ip.startsWith("2001:") && !ip.startsWith("2002:") && !ip.startsWith("3ffe:") && !ip.startsWith("3fff:");
}

export async function resolvePublicMediaUrl(raw: string): Promise<{ url: URL; address: string; family: number }> {
  let url: URL;
  try { url = new URL(raw); } catch { throw new AppError("媒体地址格式不正确。", 422); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password
    || (url.port && url.port !== (url.protocol === "https:" ? "443" : "80"))) {
    throw new AppError("成片仅支持标准 HTTP/HTTPS 媒体地址。", 422);
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(item => !isPublicMediaAddress(item.address))) {
    throw new AppError("远程媒体必须来自公网地址；内网素材请先保存为项目媒体。", 422);
  }
  return { url, ...addresses[0] };
}

async function withAbort<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const aborted = () => reject(signal.reason);
    signal.addEventListener("abort", aborted, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener("abort", aborted));
  });
}

export class MediaInputResolver {
  private consumed = 0;
  constructor(private readonly limits: RenderLimits, private readonly signal: AbortSignal) {}

  async materialize(raw: string, destination: string, kind: "audio" | "video" = "audio"): Promise<string> {
    this.signal.throwIfAborted();
    if (raw.startsWith("data:")) {
      if (kind !== "audio") throw new AppError("镜头视频请使用项目媒体文件或公网视频地址。", 422);
      await this.importInlineAudio(raw, destination);
      return destination;
    }
    const local = /^\/api\/media\/assets\/(tts|video|music)\/([a-z0-9][a-z0-9._-]{0,120})$/.exec(raw);
    if (local) {
      const source = resolveMediaAssetPath(local[1], local[2]);
      const [actual, root] = await Promise.all([fs.realpath(source), fs.realpath(resolveGeneratedMediaRoot())]);
      if (path.dirname(actual) !== path.join(root, local[1])) throw new AppError("媒体文件路径无效。", 422);
      const stat = await fs.stat(actual);
      if (!stat.isFile() || stat.size < 1) throw new AppError("媒体文件为空或不可读取。", 422);
      this.account(stat.size, 0);
      await fs.copyFile(actual, destination);
      this.signal.throwIfAborted();
      return destination;
    }
    if (raw.startsWith("/")) throw new AppError("只支持项目媒体资产路径。", 422);
    const signal = AbortSignal.any([this.signal, AbortSignal.timeout(this.limits.downloadTimeoutMs)]);
    await this.download(raw, destination, signal, 0);
    return destination;
  }

  private async importInlineAudio(raw: string, destination: string): Promise<void> {
    const header = /^data:audio\/(?:mpeg|mp3|wav|x-wav|ogg|opus|aac|flac|mp4|webm);base64,/i.exec(raw);
    if (!header) throw new AppError("内嵌素材只支持标准 Base64 音频。", 422);
    const encoded = raw.slice(header[0].length);
    const limit = Math.min(this.limits.maxAssetBytes, 32 * 1024 * 1024);
    if (!encoded.length || encoded.length > Math.ceil(limit / 3) * 4) throw new AppError("内嵌音频超过大小上限或内容为空。", 422);
    const firstPadding = encoded.indexOf("=");
    const padding = firstPadding < 0 ? 0 : encoded.length - firstPadding;
    if (encoded.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(encoded)
      || padding > 2 || (padding && encoded.slice(firstPadding) !== "=".repeat(padding))) {
      throw new AppError("内嵌音频的 Base64 编码不完整。", 422);
    }
    const byteLength = encoded.length / 4 * 3 - padding;
    if (!byteLength || byteLength > limit) throw new AppError("内嵌音频超过大小上限或内容为空。", 422);
    this.account(byteLength, 0);
    const bytes = Buffer.from(encoded, "base64");
    // Check canonical padding bits without allocating another full Base64 string.
    const finalGroup = bytes.subarray(-(byteLength % 3 || 3)).toString("base64");
    if (bytes.length !== byteLength || finalGroup !== encoded.slice(-4)) throw new AppError("内嵌音频的 Base64 编码不合法。", 422);
    this.signal.throwIfAborted();
    await fs.writeFile(destination, bytes, { flag: "wx", signal: this.signal });
  }

  private account(bytes: number, fileBytes: number): void {
    if (fileBytes + bytes > this.limits.maxAssetBytes || this.consumed + bytes > this.limits.maxTotalBytes) {
      throw new AppError("媒体素材超过合成大小上限，请缩短视频或降低素材码率。", 422);
    }
    this.consumed += bytes;
  }

  private async download(raw: string, destination: string, signal: AbortSignal, redirects: number): Promise<void> {
    signal.throwIfAborted();
    // Pin the verified DNS result to this connection: validation and request cannot resolve differently.
    const { url, address, family } = await withAbort(resolvePublicMediaUrl(raw), signal);
    signal.throwIfAborted();
    const response = await new Promise<http.IncomingMessage>((resolve, reject) => {
      const request = (url.protocol === "https:" ? https : http).get(url, {
        signal,
        agent: false,
        family,
        lookup: (_hostname, _options, callback) => callback(null, address, family),
        headers: { Accept: "video/*,audio/*,application/octet-stream", "Accept-Encoding": "identity" },
      }, resolve);
      request.once("error", reject);
    });
    if ([301, 302, 303, 307, 308].includes(response.statusCode ?? 0)) {
      response.destroy();
      if (!response.headers.location || redirects >= 3) throw new AppError("媒体下载重定向过多。", 422);
      return this.download(new URL(response.headers.location, url).toString(), destination, signal, redirects + 1);
    }
    if (response.statusCode !== 200) {
      response.destroy();
      throw new AppError(`媒体下载失败（HTTP ${response.statusCode ?? "未知"}），请重新获取视频结果。`, 422);
    }
    if (response.headers["content-encoding"] && response.headers["content-encoding"] !== "identity") {
      response.destroy(); throw new AppError("媒体下载不支持压缩传输。", 422);
    }
    const length = Number(response.headers["content-length"] ?? 0);
    if (length > this.limits.maxAssetBytes || length + this.consumed > this.limits.maxTotalBytes) {
      response.destroy(); throw new AppError("媒体素材超过合成大小上限。", 422);
    }
    let received = 0;
    const limiter = new Transform({ transform: (chunk: Buffer, _encoding, callback) => {
      try { this.account(chunk.length, received); received += chunk.length; callback(null, chunk); }
      catch (error) { callback(error as Error); }
    } });
    await pipeline(response, limiter, createWriteStream(destination, { flags: "wx" }), { signal });
    if (!received) throw new AppError("媒体下载结果为空。", 422);
  }
}
