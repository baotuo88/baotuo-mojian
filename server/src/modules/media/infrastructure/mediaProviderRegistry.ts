import type { MusicProviderPort, TTSProviderPort, VideoProviderPort } from "../domain/providerPorts";
import { readCostCurrency } from "./mediaHttp";

export type MediaProviderSource = "env" | "database";

interface RegistryEntry<T> {
  port: T;
  source: MediaProviderSource;
}

/**
 * 媒体通道注册表。
 * 环境变量预置通道优先级高于数据库通道：同名时保留环境变量配置并打印告警，
 * 避免用户在设置页误改运行环境已经固定的通道。
 */
export class MediaProviderRegistry<T extends { provider: string }> {
  private readonly entries = new Map<string, RegistryEntry<T>>();

  constructor(private readonly kindLabel: string) {}

  registerFromEnv(port: T): void {
    this.entries.set(port.provider, { port, source: "env" });
  }

  registerFromDatabase(port: T): boolean {
    const existing = this.entries.get(port.provider);
    if (existing?.source === "env") {
      console.warn(
        `[media] ${this.kindLabel}通道 ${port.provider} 已被环境变量预置通道占用，忽略同名的数据库通道。`,
      );
      return false;
    }
    this.entries.set(port.provider, { port, source: "database" });
    return true;
  }

  replaceDatabaseProviders(ports: T[]): void {
    for (const [key, entry] of [...this.entries]) {
      if (entry.source === "database") {
        this.entries.delete(key);
      }
    }
    for (const port of ports) {
      this.registerFromDatabase(port);
    }
  }

  resolve(provider: string): T {
    const found = this.entries.get(provider);
    if (!found) {
      throw new Error(`未注册的${this.kindLabel} provider：${provider}`);
    }
    return found.port;
  }

  has(provider: string): boolean {
    return this.entries.has(provider);
  }

  hasEnvProvider(provider: string): boolean {
    return this.entries.get(provider)?.source === "env";
  }

  list(): T[] {
    return [...this.entries.values()].map((entry) => entry.port);
  }
}

function readCurrency(provider: { currency?: string }): string {
  return provider.currency?.trim() || readCostCurrency();
}

export class TtsProviderRegistry extends MediaProviderRegistry<TTSProviderPort> {
  constructor() {
    super("配音");
  }

  listProviders(): Array<{
    provider: string;
    label: string;
    description?: string;
    costPerSecond: number;
    currency: string;
  }> {
    return this.list().map((provider) => ({
      provider: provider.provider,
      label: provider.label ?? provider.provider,
      description: provider.description,
      costPerSecond: provider.costPerSecond ?? 0,
      currency: readCurrency(provider),
    }));
  }
}

export class VideoProviderRegistry extends MediaProviderRegistry<VideoProviderPort> {
  constructor() {
    super("视频");
  }

  listProviders(): Array<{
    provider: string;
    label: string;
    description?: string;
    supportsRefImages: boolean;
    costPerSecond: number;
    currency: string;
  }> {
    return this.list().map((provider) => ({
      provider: provider.provider,
      label: provider.label ?? provider.provider,
      description: provider.description,
      supportsRefImages: provider.supportsRefImages ?? false,
      costPerSecond: provider.costPerSecond ?? 0,
      currency: readCurrency(provider),
    }));
  }
}

export class MusicProviderRegistry extends MediaProviderRegistry<MusicProviderPort> {
  constructor() {
    super("配乐");
  }

  listProviders(): Array<{
    provider: string;
    label: string;
    description?: string;
    costPerSecond: number;
    currency: string;
  }> {
    return this.list().map((provider) => ({
      provider: provider.provider,
      label: provider.label ?? provider.provider,
      description: provider.description,
      costPerSecond: provider.costPerSecond ?? 0,
      currency: readCurrency(provider),
    }));
  }
}

export const ttsProviderRegistry = new TtsProviderRegistry();
export const videoProviderRegistry = new VideoProviderRegistry();
export const musicProviderRegistry = new MusicProviderRegistry();
