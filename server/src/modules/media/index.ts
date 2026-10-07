import "./infrastructure/envMediaProviders";

export {
  MEDIA_PROTOCOLS_BY_KIND,
  MEDIA_PROVIDER_KINDS,
  MEDIA_PROVIDER_KIND_LABELS,
  MEDIA_PROVIDER_PROTOCOL_LABELS,
  MEDIA_PROVIDER_PROTOCOLS,
  maskApiKey,
  normalizeMediaProviderKey,
  normalizeMediaProviderOptions,
  serializeMediaProviderOptions,
} from "./domain/mediaProviderContracts";
export type {
  CreateMediaProviderInput,
  MediaProviderKind,
  MediaProviderOptions,
  MediaProviderProtocol,
  MediaProviderView,
  UpdateMediaProviderInput,
} from "./domain/mediaProviderContracts";
export type {
  MusicGenerationRequest,
  MusicGenerationResult,
  MusicProviderPort,
  TTSGenerationRequest,
  TTSGenerationResult,
  TTSProviderPort,
  VideoGenerationRequest,
  VideoGenerationResult,
  VideoProviderPort,
} from "./domain/providerPorts";
export {
  buildMediaProviderPorts,
  mediaProviderService,
  syncMediaProviderRegistries,
  toMediaProviderView,
} from "./application/MediaProviderService";
export {
  musicProviderRegistry,
  ttsProviderRegistry,
  videoProviderRegistry,
} from "./infrastructure/mediaProviderRegistry";
export {
  HttpMusicProvider,
  HttpTTSProvider,
  HttpVideoProvider,
} from "./infrastructure/httpJsonProviders";
export {
  MockMusicProvider,
  MockTTSProvider,
  MockVideoProvider,
} from "./infrastructure/mockMediaProviders";
export { OpenAiSpeechProvider, OpenAiVideoProvider } from "./infrastructure/openAiProviders";
export { registerEnvMediaProviders } from "./infrastructure/envMediaProviders";
export {
  saveMediaAsset,
  publishMediaAssetFile,
  resolveMediaAssetPath,
  contentTypeForFileName,
} from "./infrastructure/mediaAssetStore";
