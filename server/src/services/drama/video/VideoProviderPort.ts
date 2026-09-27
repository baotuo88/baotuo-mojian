// 兼容出口：视频通道端口与注册表已迁到 server/src/modules/media，短剧侧继续从这里引用。
export type {
  VideoGenerationRequest,
  VideoGenerationResult,
  VideoProviderPort,
} from "../../../modules/media";
export {
  HttpVideoProvider,
  MockVideoProvider,
  videoProviderRegistry,
} from "../../../modules/media";
