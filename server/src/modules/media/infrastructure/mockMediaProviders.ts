import type {
  MusicGenerationRequest,
  MusicGenerationResult,
  MusicProviderPort,
  TTSGenerationRequest,
  TTSGenerationResult,
  TTSProviderPort,
  VideoGenerationRequest,
  VideoGenerationResult,
  VideoProviderPort,
} from "../domain/providerPorts";
import { normalizeCostValue, readCostCurrency } from "./mediaHttp";

const SILENT_WAV_DATA_URL = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

export class MockTTSProvider implements TTSProviderPort {
  readonly provider = "mock";
  readonly label = "模拟配音通道";
  readonly description = "用于联调短剧配音链路的本地模拟 provider，不会生成真实语音。";
  readonly costPerSecond = normalizeCostValue(process.env.DRAMA_TTS_MOCK_COST_PER_SECOND);
  readonly currency = readCostCurrency();

  async synthesize(input: TTSGenerationRequest): Promise<TTSGenerationResult> {
    return {
      audioUrl: SILENT_WAV_DATA_URL,
      durationSec: Math.max(1, Math.ceil(input.text.length / 5)),
      raw: input,
    };
  }
}

export class MockVideoProvider implements VideoProviderPort {
  readonly provider = "mock";
  readonly label = "模拟视频通道";
  readonly description = "用于联调视频生成链路的本地模拟 provider，不会生成真实视频。";
  readonly supportsRefImages = true;
  readonly costPerSecond = normalizeCostValue(process.env.DRAMA_VIDEO_MOCK_COST_PER_SECOND);
  readonly currency = readCostCurrency();

  async createTask(input: VideoGenerationRequest): Promise<VideoGenerationResult> {
    return {
      providerTaskId: `mock_${Date.now()}`,
      status: "queued",
      raw: input,
    };
  }

  async getTask(providerTaskId: string): Promise<VideoGenerationResult> {
    return {
      providerTaskId,
      status: "queued",
    };
  }
}

export class MockMusicProvider implements MusicProviderPort {
  readonly provider = "mock";
  readonly label = "模拟配乐通道";
  readonly description = "用于联调配乐/音效链路的本地模拟 provider，不会生成真实音频。";
  readonly costPerSecond = normalizeCostValue(process.env.DRAMA_MUSIC_MOCK_COST_PER_SECOND);
  readonly currency = readCostCurrency();

  async createTask(input: MusicGenerationRequest): Promise<MusicGenerationResult> {
    return {
      providerTaskId: `mock_${Date.now()}`,
      status: "queued",
      raw: input,
    };
  }

  async getTask(providerTaskId: string): Promise<MusicGenerationResult> {
    return {
      providerTaskId,
      status: "queued",
    };
  }
}
