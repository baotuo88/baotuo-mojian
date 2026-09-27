export interface TTSGenerationRequest {
  text: string;
  voiceId?: string | null;
  speed?: number | null;
  emotion?: string | null;
}

export interface TTSGenerationResult {
  audioUrl: string;
  durationSec?: number;
  raw?: unknown;
}

export interface TTSProviderPort {
  readonly provider: string;
  readonly label?: string;
  readonly description?: string;
  readonly costPerSecond?: number;
  readonly currency?: string;
  synthesize(input: TTSGenerationRequest): Promise<TTSGenerationResult>;
}

export interface VideoGenerationRequest {
  prompt: string;
  negativePrompt?: string | null;
  aspectRatio: string;
  durationSec?: number | null;
  refImages?: string[];
}

export interface VideoGenerationResult {
  providerTaskId: string;
  status: "queued" | "running" | "succeeded" | "failed";
  resultUrl?: string;
  failureReason?: string;
  raw?: unknown;
}

export interface VideoProviderPort {
  readonly provider: string;
  readonly label?: string;
  readonly description?: string;
  readonly supportsRefImages?: boolean;
  readonly costPerSecond?: number;
  readonly currency?: string;
  createTask(input: VideoGenerationRequest): Promise<VideoGenerationResult>;
  getTask(providerTaskId: string): Promise<VideoGenerationResult>;
}

export interface MusicGenerationRequest {
  prompt: string;
  durationSec?: number | null;
  style?: string | null;
  instrumental?: boolean | null;
}

export interface MusicGenerationResult {
  providerTaskId: string;
  status: "queued" | "running" | "succeeded" | "failed";
  resultUrl?: string;
  failureReason?: string;
  raw?: unknown;
}

export interface MusicProviderPort {
  readonly provider: string;
  readonly label?: string;
  readonly description?: string;
  readonly costPerSecond?: number;
  readonly currency?: string;
  createTask(input: MusicGenerationRequest): Promise<MusicGenerationResult>;
  getTask(providerTaskId: string): Promise<MusicGenerationResult>;
}

export type MediaProviderPort = TTSProviderPort | VideoProviderPort | MusicProviderPort;
