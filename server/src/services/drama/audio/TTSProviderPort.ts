// 兼容出口：配音通道端口与注册表已迁到 server/src/modules/media，短剧侧继续从这里引用。
export type {
  TTSGenerationRequest,
  TTSGenerationResult,
  TTSProviderPort,
} from "../../../modules/media";
export {
  HttpTTSProvider,
  MockTTSProvider,
  ttsProviderRegistry,
} from "../../../modules/media";
