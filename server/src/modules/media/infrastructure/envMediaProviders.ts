import { HttpTTSProvider, HttpVideoProvider } from "./httpJsonProviders";
import { musicProviderRegistry, ttsProviderRegistry, videoProviderRegistry } from "./mediaProviderRegistry";
import { MockMusicProvider, MockTTSProvider, MockVideoProvider } from "./mockMediaProviders";
import { normalizeBooleanFlag, normalizeCostValue, normalizeTimeoutMs, readCostCurrency } from "./mediaHttp";

function readText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * 环境变量预置通道：与数据库通道并存，同名时优先使用环境变量。
 * 现有部署依赖这些变量，因此保留原有变量名与默认 provider 标识。
 */
export function registerEnvMediaProviders(): void {
  ttsProviderRegistry.registerFromEnv(new MockTTSProvider());
  videoProviderRegistry.registerFromEnv(new MockVideoProvider());
  musicProviderRegistry.registerFromEnv(new MockMusicProvider());

  const ttsSynthesizeUrl = readText(process.env.DRAMA_TTS_HTTP_SYNTHESIZE_URL);
  if (ttsSynthesizeUrl) {
    ttsProviderRegistry.registerFromEnv(new HttpTTSProvider({
      provider: readText(process.env.DRAMA_TTS_HTTP_PROVIDER_ID) ?? "http",
      label: readText(process.env.DRAMA_TTS_HTTP_PROVIDER_LABEL) ?? "HTTP 配音通道",
      description: readText(process.env.DRAMA_TTS_HTTP_PROVIDER_DESCRIPTION) ?? "通过环境变量配置的外部 TTS 服务。",
      synthesizeUrl: ttsSynthesizeUrl,
      apiKey: readText(process.env.DRAMA_TTS_HTTP_API_KEY),
      timeoutMs: normalizeTimeoutMs(process.env.DRAMA_TTS_HTTP_TIMEOUT_MS),
      costPerSecond: normalizeCostValue(process.env.DRAMA_TTS_HTTP_COST_PER_SECOND),
      currency: readText(process.env.DRAMA_TTS_HTTP_COST_CURRENCY) ?? readCostCurrency(),
    }));
  }

  const videoCreateUrl = readText(process.env.DRAMA_VIDEO_HTTP_CREATE_URL);
  if (videoCreateUrl) {
    videoProviderRegistry.registerFromEnv(new HttpVideoProvider({
      provider: readText(process.env.DRAMA_VIDEO_HTTP_PROVIDER_ID) ?? "http",
      label: readText(process.env.DRAMA_VIDEO_HTTP_PROVIDER_LABEL) ?? "HTTP 视频通道",
      description: readText(process.env.DRAMA_VIDEO_HTTP_PROVIDER_DESCRIPTION) ?? "通过环境变量配置的外部视频生成服务。",
      createUrl: videoCreateUrl,
      statusUrl: readText(process.env.DRAMA_VIDEO_HTTP_STATUS_URL),
      apiKey: readText(process.env.DRAMA_VIDEO_HTTP_API_KEY),
      timeoutMs: normalizeTimeoutMs(process.env.DRAMA_VIDEO_HTTP_TIMEOUT_MS),
      supportsRefImages: normalizeBooleanFlag(process.env.DRAMA_VIDEO_HTTP_SUPPORTS_REF_IMAGES),
      costPerSecond: normalizeCostValue(process.env.DRAMA_VIDEO_HTTP_COST_PER_SECOND),
      currency: readText(process.env.DRAMA_VIDEO_HTTP_COST_CURRENCY) ?? readCostCurrency(),
      kindLabel: "视频通道",
    }));
  }
}

registerEnvMediaProviders();
