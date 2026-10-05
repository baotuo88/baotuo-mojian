import type { ApiResponse } from "@ai-novel/shared/types/api";
import { apiClient } from "./client";

// The client interceptor only rejects on HTTP error status; a 2xx envelope with
// {success:false} or an absent `data` field flows through untouched. The old
// `res.data.data!` non-null assertion turned that into a silent `undefined` that
// crashed downstream `.map`/property access with a misleading stack. Unwrap through
// this guard instead so a data-less success surfaces as one handled error.
function unwrapApiData<T>(res: ApiResponse<T>): T {
  if (!res.success || res.data == null) {
    throw new Error(res.error ?? res.message ?? "服务器未返回有效数据。");
  }
  return res.data;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type ComicSourceType = "novel_import" | "original" | "text_import" | "comic_import";

export interface ComicProject {
  id: string;
  title: string;
  sourceType: ComicSourceType;
  sourceRef?: string | null;
  sourceInput?: string | null;
  trackId?: string | null;
  stylePreset?: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  sourceBundle?: { id: string; importedAt: string } | null;
  _count?: { episodes: number; characters: number };
}

export interface ComicProjectDetail extends ComicProject {
  characters: ComicCharacter[];
  episodes: ComicEpisode[];
  batchJobs: ComicBatchJob[];
}

export type ComicCharacterGender = "male" | "female" | "other" | "unknown";

export interface ComicCharacter {
  id: string;
  projectId: string;
  name: string;
  gender?: ComicCharacterGender;
  persona?: string | null;
  visualAnchor?: string | null;
  sheetData?: string | null;
  sourceCharacterRef?: string | null;
  createdAt: string;
}

export interface ComicEpisode {
  id: string;
  projectId: string;
  order: number;
  title: string | null;
  hookType?: string | null;
  cliffhanger?: string | null;
  isPaywalled: boolean;
  outline?: string | null;
  sourceText?: string | null;
  status: string;
  scriptConfig?: string | null; // JSON of script generation settings
  _count?: { panels: number };
  panels?: ComicPanel[];
}

export interface ComicDialogue {
  speaker: string;
  text: string;
  bubbleType: "round" | "spike" | "cloud" | "caption";
  anchorHint?: string;
}

export interface ComicPanelCharacterRef {
  name: string;
  costume?: "default" | "combat" | "formal" | "casual";
  expression?: "neutral" | "happy" | "angry" | "sad" | "surprised" | "cold";
  lighting?: string;
}

export interface ComicPanel {
  id: string;
  episodeId: string;
  order: number;
  panelType: "establishing" | "close_up" | "action" | "reaction" | "transition";
  action: string;
  densityLevel?: "low" | "medium" | "high" | null;
  focus?: string | null;
  dialogues: string | null; // JSON string of ComicDialogue[]
  characterRefs: string | null; // JSON string of string[] or ComicPanelCharacterRef[]
  visualPrompt: string;
  layoutData: string | null; // JSON
  imageData: string | null; // JSON of PanelImageData
  letteredData: string | null; // JSON
  motionData: string | null; // JSON
  createdAt?: string;
  updatedAt?: string;
}

export interface PanelReferenceImageMeta {
  kind: "character_sheet" | "character_expression" | "character_face" | "asset" | "scene";
  label: string;
  url: string;
}

export interface PanelImageData {
  status: "idle" | "generating" | "done" | "error";
  version?: number;
  url?: string;
  prompt?: string;
  provider?: string;
  generatedAt?: string;
  error?: string;
  referenceImages?: PanelReferenceImageMeta[];
}

export interface ComicExportJob {
  id: string;
  projectId: string;
  episodeId?: string | null;
  format: string;
  spec?: string | null;
  status: string;
  artifacts?: string | null;
  createdAt: string;
}

export interface ComicBatchJob {
  id: string;
  projectId: string;
  type: string;
  status: string;
  progress: string;
  createdAt: string;
}

export interface CreateComicProjectPayload {
  title: string;
  sourceType: ComicSourceType;
  sourceRef?: string;
  trackId?: string;
  inspiration?: string;
  rawText?: string;
  comicFormat?: string;
  stylePreset?: string;
}

export interface GenerateOutlinePayload {
  replaceExisting?: boolean;
  startOrder?: number;
  count?: number;
  provider?: string;
}

export interface GenerateScriptPayload {
  replaceExisting?: boolean;
  targetPanelCount?: number;
  densityMode?: "relaxed" | "balanced" | "compact";
  scriptPromptInstruction?: string;
  refreshSourceText?: boolean;
  provider?: string;
}

export interface ExportEpisodePayload {
  format?: "long_image" | "sliced";
  spec?: {
    sliceWidth?: number;
    sliceMaxHeight?: number;
    outputFormat?: "png" | "jpg" | "webp";
    quality?: number;
  };
}

// ─── Projects ─────────────────────────────────────────────────────────────────

export async function listComicProjects(): Promise<ComicProject[]> {
  const res = await apiClient.get<ApiResponse<ComicProject[]>>("/comic/projects");
  return unwrapApiData(res.data);
}

export async function createComicProject(payload: CreateComicProjectPayload): Promise<ComicProject> {
  const res = await apiClient.post<ApiResponse<ComicProject>>("/comic/projects", payload);
  return unwrapApiData(res.data);
}

export async function getComicProject(projectId: string): Promise<ComicProjectDetail> {
  const res = await apiClient.get<ApiResponse<ComicProjectDetail>>(`/comic/projects/${projectId}`);
  return unwrapApiData(res.data);
}

export async function deleteComicProject(projectId: string): Promise<void> {
  await apiClient.delete(`/comic/projects/${projectId}`);
}

export async function importComicSourceBundle(projectId: string): Promise<ComicProjectDetail> {
  const res = await apiClient.post<ApiResponse<ComicProjectDetail>>(`/comic/projects/${projectId}/source-bundle`);
  return unwrapApiData(res.data);
}

export async function updateComicStyle(projectId: string, style: string): Promise<ComicProject> {
  const res = await apiClient.patch<ApiResponse<ComicProject>>(`/comic/projects/${projectId}/style`, { style });
  return unwrapApiData(res.data);
}

export interface UpdateComicPresetPayload {
  format?: string;
  style?: string;
  promptKeywords?: string;
  imageSize?: string;
}

export async function updateComicPreset(projectId: string, payload: UpdateComicPresetPayload): Promise<ComicProject> {
  const res = await apiClient.patch<ApiResponse<ComicProject>>(`/comic/projects/${projectId}/preset`, payload);
  return unwrapApiData(res.data);
}

// ─── Characters ───────────────────────────────────────────────────────────────

export interface CharacterSheetData {
  status: "idle" | "generating" | "done" | "error";
  version?: number;
  url?: string;
  prompt?: string;
  provider?: string;
  generatedAt?: string;
  error?: string;
  revision?: string;
  previousImage?: CharacterSheetData;
  assets?: {
    expression?: CharacterExpressionData;
  };
}

export interface CharacterExpressionData {
  status: "idle" | "generating" | "done" | "error";
  version?: number;
  url?: string;
  prompt?: string;
  provider?: string;
  generatedAt?: string;
  error?: string;
  revision?: string;
  previousImage?: CharacterExpressionData;
  referenceImages?: PanelReferenceImageMeta[];
}

export interface GenerateCharacterSheetOptions {
  prompt?: string;
  useCurrentImageAsReference?: boolean;
  lockAppearance?: boolean;
  appearanceOverride?: string;
}

export function characterSheetImageUrl(charId: string): string {
  return `/api/comic/character-images/${charId}/sheet`;
}

export function characterExpressionImageUrl(charId: string): string {
  return `/api/comic/character-images/${charId}/expressions`;
}

export function characterFaceImageUrl(charId: string): string {
  return `/api/comic/character-images/${charId}/face`;
}

export async function generateCharacterSheet(
  charId: string,
  provider?: string,
  options?: GenerateCharacterSheetOptions,
  overrides?: ImageGenerationOverrides,
): Promise<CharacterSheetData> {
  const res = await apiClient.post<ApiResponse<CharacterSheetData>>(
    `/comic/characters/${charId}/sheet/generate`,
    { ...(provider ? { provider } : {}), ...(options ?? {}), ...(overrides ?? {}) },
  );
  return unwrapApiData(res.data);
}

export async function prepareCharacterSheet(
  charId: string,
  provider?: string,
  options?: GenerateCharacterSheetOptions,
): Promise<ImageGenerationPreview> {
  const res = await apiClient.post<ApiResponse<ImageGenerationPreview>>(
    `/comic/characters/${charId}/sheet/prepare`,
    { ...(provider ? { provider } : {}), ...(options ?? {}) },
  );
  return unwrapApiData(res.data);
}

export async function getCharacterSheetData(charId: string): Promise<CharacterSheetData> {
  const res = await apiClient.get<ApiResponse<CharacterSheetData>>(`/comic/characters/${charId}/sheet`);
  return unwrapApiData(res.data);
}

export async function prepareCharacterExpressionSheet(charId: string, provider?: string): Promise<ImageGenerationPreview> {
  const res = await apiClient.post<ApiResponse<ImageGenerationPreview>>(
    `/comic/characters/${charId}/expressions/prepare`,
    provider ? { provider } : {},
  );
  return unwrapApiData(res.data);
}

export async function generateCharacterExpressionSheet(
  charId: string,
  provider?: string,
  overrides?: ImageGenerationOverrides,
): Promise<CharacterExpressionData> {
  const res = await apiClient.post<ApiResponse<CharacterExpressionData>>(
    `/comic/characters/${charId}/expressions/generate`,
    { ...(provider ? { provider } : {}), ...(overrides ?? {}) },
  );
  return unwrapApiData(res.data);
}

export async function getCharacterExpressionData(charId: string): Promise<CharacterExpressionData> {
  const res = await apiClient.get<ApiResponse<CharacterExpressionData>>(`/comic/characters/${charId}/expressions`);
  return unwrapApiData(res.data);
}

// ─── Episodes ─────────────────────────────────────────────────────────────────

export async function listComicEpisodes(projectId: string): Promise<ComicEpisode[]> {
  const res = await apiClient.get<ApiResponse<ComicEpisode[]>>(`/comic/projects/${projectId}/episodes`);
  return unwrapApiData(res.data);
}

export async function generateComicOutline(projectId: string, payload?: GenerateOutlinePayload): Promise<ComicEpisode[]> {
  const res = await apiClient.post<ApiResponse<ComicEpisode[]>>(
    `/comic/projects/${projectId}/episodes/generate-outline`,
    payload ?? {},
  );
  return unwrapApiData(res.data);
}

export async function getComicEpisode(episodeId: string): Promise<ComicEpisode> {
  const res = await apiClient.get<ApiResponse<ComicEpisode>>(`/comic/episodes/${episodeId}`);
  return unwrapApiData(res.data);
}

export async function updateEpisodeSourceText(episodeId: string, sourceText: string): Promise<ComicEpisode> {
  const res = await apiClient.patch<ApiResponse<ComicEpisode>>(`/comic/episodes/${episodeId}/source-text`, { sourceText });
  return unwrapApiData(res.data);
}

export interface UpdateEpisodePayload {
  title?: string;
  outline?: string;
  cliffhanger?: string;
  isPaywalled?: boolean;
}

export async function updateComicEpisode(episodeId: string, payload: UpdateEpisodePayload): Promise<ComicEpisode> {
  const res = await apiClient.patch<ApiResponse<ComicEpisode>>(`/comic/episodes/${episodeId}`, payload);
  return unwrapApiData(res.data);
}

// ─── Panels ───────────────────────────────────────────────────────────────────

export async function listComicPanels(episodeId: string): Promise<ComicPanel[]> {
  const res = await apiClient.get<ApiResponse<ComicPanel[]>>(`/comic/episodes/${episodeId}/panels`);
  return unwrapApiData(res.data);
}

export async function generateComicPanelScript(episodeId: string, payload?: GenerateScriptPayload): Promise<ComicEpisode> {
  const res = await apiClient.post<ApiResponse<ComicEpisode>>(
    `/comic/episodes/${episodeId}/generate-script`,
    payload ?? {},
  );
  return unwrapApiData(res.data);
}

export async function getComicPanel(panelId: string): Promise<ComicPanel> {
  const res = await apiClient.get<ApiResponse<ComicPanel>>(`/comic/panels/${panelId}`);
  return unwrapApiData(res.data);
}

export async function updatePanelVisualPrompt(panelId: string, visualPrompt: string): Promise<ComicPanel> {
  const res = await apiClient.patch<ApiResponse<ComicPanel>>(`/comic/panels/${panelId}/visual-prompt`, { visualPrompt });
  return unwrapApiData(res.data);
}

// ─── Panel images ─────────────────────────────────────────────────────────────

export async function preparePanelImage(panelId: string, provider?: string): Promise<ImageGenerationPreview> {
  const res = await apiClient.post<ApiResponse<ImageGenerationPreview>>(
    `/comic/panels/${panelId}/image/prepare`,
    provider ? { provider } : {},
  );
  return unwrapApiData(res.data);
}

export async function generatePanelImage(
  panelId: string,
  provider?: string,
  overrides?: ImageGenerationOverrides,
): Promise<PanelImageData> {
  const res = await apiClient.post<ApiResponse<PanelImageData>>(
    `/comic/panels/${panelId}/image/generate`,
    { ...(provider ? { provider } : {}), ...(overrides ?? {}) },
  );
  return unwrapApiData(res.data);
}

export function panelImageUrl(panelId: string, version?: string | number): string {
  const suffix = version == null ? "" : `?v=${encodeURIComponent(String(version))}`;
  return `/api/comic/panel-images/${panelId}/panel${suffix}`;
}

export function panelLetteredImageUrl(panelId: string): string {
  return `/api/comic/panel-images/${panelId}/lettered`;
}

// ─── Bubble lettering ─────────────────────────────────────────────────────────

export async function letterPanel(
  panelId: string,
  opts?: { bubbleOpacity?: number; maxBubbleWidthRatio?: number },
): Promise<{ url: string; width: number; height: number }> {
  const res = await apiClient.post<ApiResponse<{ url: string; width: number; height: number }>>(
    `/comic/panels/${panelId}/letter`,
    opts ?? {},
  );
  return unwrapApiData(res.data);
}

// ─── Export ───────────────────────────────────────────────────────────────────

export async function exportComicEpisode(
  episodeId: string,
  payload?: ExportEpisodePayload,
): Promise<{ jobId: string; artifacts: Array<{ index?: number; url: string; width: number; height: number }> }> {
  const res = await apiClient.post<
    ApiResponse<{ jobId: string; artifacts: Array<{ index?: number; url: string; width: number; height: number }> }>
  >(`/comic/episodes/${episodeId}/export`, payload ?? {});
  return unwrapApiData(res.data);
}

export async function listExportJobs(projectId: string): Promise<ComicExportJob[]> {
  const res = await apiClient.get<ApiResponse<ComicExportJob[]>>(`/comic/projects/${projectId}/export-jobs`);
  return unwrapApiData(res.data);
}

// ─── Batch jobs ───────────────────────────────────────────────────────────────

export interface BatchProgress {
  version?: 1;
  episodeId?: string;
  provider?: string;
  imageModel?: string;
  concurrency?: number;
  targetPanelIds?: string[];
  completedPanelIds?: string[];
  total: number;
  done: number;
  failed: number;
  failedPanelIds: string[];
  status: "running" | "completed" | "partial" | "interrupted" | "waiting_recovery" | "cancelled";
  errors?: Record<string, string>;
  recoverable?: boolean;
}

export interface StartBatchPayload {
  provider?: string;
  concurrency?: number;
  skipDone?: boolean;
  expectedScopeFingerprint?: string;
}

export interface BatchCostEstimate {
  imageModel: string;
  scopeFingerprint: string;
  totalPanels: number;
  pendingPanels: number;
  estimatedCentsCost: number | null;
  providerNote: string;
}

export async function startEpisodeBatch(
  episodeId: string,
  payload?: StartBatchPayload,
): Promise<{ jobId: string }> {
  const res = await apiClient.post<ApiResponse<{ jobId: string }>>(
    `/comic/episodes/${episodeId}/batch/start`,
    payload ?? {},
  );
  return unwrapApiData(res.data);
}

export async function retryBatchJob(jobId: string, provider?: string): Promise<{ jobId: string }> {
  const res = await apiClient.post<ApiResponse<{ jobId: string }>>(
    `/comic/batch-jobs/${jobId}/retry`,
    provider ? { provider } : {},
  );
  return unwrapApiData(res.data);
}

export async function cancelComicBatchJob(jobId: string): Promise<void> {
  await apiClient.post(`/comic/batch-jobs/${jobId}/cancel`);
}

export async function getBatchJob(jobId: string): Promise<ComicBatchJob> {
  const res = await apiClient.get<ApiResponse<ComicBatchJob>>(`/comic/batch-jobs/${jobId}`);
  return unwrapApiData(res.data);
}

export async function listBatchJobs(projectId: string): Promise<ComicBatchJob[]> {
  const res = await apiClient.get<ApiResponse<ComicBatchJob[]>>(`/comic/projects/${projectId}/batch-jobs`);
  return unwrapApiData(res.data);
}

export async function estimateBatchCost(episodeId: string, provider?: string): Promise<BatchCostEstimate> {
  const params = provider ? `?provider=${encodeURIComponent(provider)}` : "";
  const res = await apiClient.get<ApiResponse<BatchCostEstimate>>(
    `/comic/episodes/${episodeId}/batch/estimate${params}`,
  );
  return unwrapApiData(res.data);
}

// ─── Facts ────────────────────────────────────────────────────────────────────

export type ComicFactCategory = "completed" | "revealed" | "state_changed";

export interface ComicFact {
  id: string;
  projectId: string;
  episodeOrder: number;
  text: string;
  category: ComicFactCategory;
  createdAt: string;
}

export async function listComicFacts(projectId: string): Promise<ComicFact[]> {
  const res = await apiClient.get<ApiResponse<ComicFact[]>>(`/comic/projects/${projectId}/facts`);
  return unwrapApiData(res.data);
}

export async function deleteComicFact(factId: string): Promise<void> {
  await apiClient.delete(`/comic/facts/${factId}`);
}

// ─── Character Assets ──────────────────────────────────────────────────────────

export type CharacterAssetType = "costume" | "weapon" | "item" | "vehicle" | "ability" | "other";
export type AssetImageStatus = "idle" | "generating" | "done" | "error";

export interface AssetImageData {
  status: AssetImageStatus;
  url?: string;
  prompt?: string;
  provider?: string;
  generatedAt?: string;
  error?: string;
  revision?: string;
  previousImage?: AssetImageData;
  origin?: "generated" | "uploaded";
}

export interface ComicCharacterAsset {
  id: string;
  characterId: string;
  projectId: string;
  assetType: CharacterAssetType;
  name: string;
  description: string | null;
  imageData: string | null; // JSON AssetImageData
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAssetPayload {
  characterId: string;
  projectId: string;
  assetType: CharacterAssetType;
  name: string;
  description?: string;
  sortOrder?: number;
}

export interface UpdateAssetPayload {
  name?: string;
  description?: string;
  sortOrder?: number;
  assetType?: CharacterAssetType;
}

export async function listCharacterAssets(characterId: string): Promise<ComicCharacterAsset[]> {
  const res = await apiClient.get<ApiResponse<ComicCharacterAsset[]>>(`/comic/characters/${characterId}/assets`);
  return unwrapApiData(res.data);
}

export async function listProjectCharacterAssets(projectId: string): Promise<ComicCharacterAsset[]> {
  const res = await apiClient.get<ApiResponse<ComicCharacterAsset[]>>(`/comic/projects/${projectId}/character-assets`);
  return unwrapApiData(res.data);
}

export async function createCharacterAsset(payload: CreateAssetPayload): Promise<ComicCharacterAsset> {
  const res = await apiClient.post<ApiResponse<ComicCharacterAsset>>("/comic/character-assets", payload);
  return unwrapApiData(res.data);
}

export async function updateCharacterAsset(assetId: string, payload: UpdateAssetPayload): Promise<ComicCharacterAsset> {
  const res = await apiClient.patch<ApiResponse<ComicCharacterAsset>>(`/comic/character-assets/${assetId}`, payload);
  return unwrapApiData(res.data);
}

export async function deleteCharacterAsset(assetId: string): Promise<void> {
  await apiClient.delete(`/comic/character-assets/${assetId}`);
}

// ─── 生图前确认弹窗用 ─────────────────────────────────────────────────────────

export interface ImageGenerationPreview {
  kind: string;
  title: string;
  prompt: string;
  negativePrompt?: string;
  referenceImages: Array<{ kind: string; label: string; url: string; assetId?: string }>;
  provider: string;
  size: string;
  availableProviders?: Array<{ value: string; label: string }>;
  availableSizes?: string[];
}

export interface ImageGenerationOverrides {
  promptOverride?: string;
  providerOverride?: string;
  sizeOverride?: string;
  negativePromptOverride?: string;
  excludedReferenceImageUrls?: string[];
}

export async function prepareCharacterAssetImage(assetId: string, provider?: string): Promise<ImageGenerationPreview> {
  const res = await apiClient.post<ApiResponse<ImageGenerationPreview>>(
    `/comic/character-assets/${assetId}/prepare-image`,
    provider ? { provider } : {},
  );
  return unwrapApiData(res.data);
}

export async function generateCharacterAssetImage(
  assetId: string,
  provider?: string,
  overrides?: ImageGenerationOverrides,
): Promise<ComicCharacterAsset> {
  const res = await apiClient.post<ApiResponse<ComicCharacterAsset>>(
    `/comic/character-assets/${assetId}/generate-image`,
    { provider, ...overrides },
  );
  return unwrapApiData(res.data);
}

export async function uploadCharacterAssetImage(assetId: string, file: File): Promise<{ url: string }> {
  const res = await apiClient.post<ApiResponse<{ url: string }>>(
    `/comic/character-assets/${assetId}/upload-image`,
    file,
    { headers: { "Content-Type": file.type } },
  );
  return unwrapApiData(res.data);
}

export function characterAssetImageUrl(assetId: string): string {
  return `/api/comic/character-assets/${assetId}/image`;
}

/** 更新角色性别（所有生图链路的 GENDER LOCK 来源） */
export async function updateCharacterGender(
  charId: string,
  gender: ComicCharacterGender,
): Promise<ComicCharacter> {
  const res = await apiClient.patch<ApiResponse<ComicCharacter>>(
    `/comic/characters/${charId}/gender`,
    { gender },
  );
  return unwrapApiData(res.data);
}

export interface UpdateVisualAnchorPayload {
  /** 主外貌描述 */
  appearance?: string;
  /** 脸型强覆盖（FINAL OVERRIDE）；当 appearance 含"锐利/尖锐"等冲突词时用此字段强压脸型 */
  faceShapeOverride?: string;
}

export interface VisualAnchorRewriteResult {
  appearance: string;
  faceShapeOverride?: string;
  rationale: string;
}

export async function rewriteCharacterVisualAnchor(
  charId: string,
  payload: { userInstruction?: string; provider?: string },
): Promise<VisualAnchorRewriteResult> {
  const res = await apiClient.post<ApiResponse<VisualAnchorRewriteResult>>(
    `/comic/characters/${charId}/visual-anchor/rewrite`,
    payload,
  );
  return unwrapApiData(res.data);
}

/**
 * 更新角色"外貌锚点"（生图源头）。
 * 改一次，三视图/表情稿/资产/格子图后续生成都会读新版（已有图不会自动重绘）。
 */
export async function updateCharacterVisualAnchor(
  charId: string,
  payload: UpdateVisualAnchorPayload,
): Promise<ComicCharacter> {
  const res = await apiClient.patch<ApiResponse<ComicCharacter>>(
    `/comic/characters/${charId}/visual-anchor`,
    payload,
  );
  return unwrapApiData(res.data);
}

// ─── Scenes ────────────────────────────────────────────────────────────────────

export type SceneType = "interior" | "exterior" | "landscape" | "abstract" | "other";
export type SceneSheetStatus = "idle" | "generating" | "done" | "error";

export interface SceneBible {
  palette?: string;
  keyElements?: string;
  materials?: string;
  ambiance?: string;
  layout?: string;
}

export interface SceneSheetData {
  status: SceneSheetStatus;
  url?: string;
  prompt?: string;
  provider?: string;
  generatedAt?: string;
  error?: string;
  revision?: string;
  previousImage?: SceneSheetData;
  origin?: "generated" | "uploaded";
}

export interface ComicScene {
  id: string;
  projectId: string;
  name: string;
  sceneType: SceneType;
  bible: string | null; // JSON SceneBible
  sheetData: string | null; // JSON SceneSheetData
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateScenePayload {
  projectId: string;
  name: string;
  sceneType?: SceneType;
  bible?: SceneBible;
  sortOrder?: number;
}

export interface UpdateScenePayload {
  name?: string;
  sceneType?: SceneType;
  bible?: SceneBible;
  sortOrder?: number;
}

export async function listComicScenes(projectId: string): Promise<ComicScene[]> {
  const res = await apiClient.get<ApiResponse<ComicScene[]>>(`/comic/projects/${projectId}/scenes`);
  return unwrapApiData(res.data);
}

export async function createComicScene(payload: CreateScenePayload): Promise<ComicScene> {
  const res = await apiClient.post<ApiResponse<ComicScene>>("/comic/scenes", payload);
  return unwrapApiData(res.data);
}

export async function updateComicScene(sceneId: string, payload: UpdateScenePayload): Promise<ComicScene> {
  const res = await apiClient.patch<ApiResponse<ComicScene>>(`/comic/scenes/${sceneId}`, payload);
  return unwrapApiData(res.data);
}

export async function deleteComicScene(sceneId: string): Promise<void> {
  await apiClient.delete(`/comic/scenes/${sceneId}`);
}

export async function prepareComicSceneImage(sceneId: string, provider?: string): Promise<ImageGenerationPreview> {
  const res = await apiClient.post<ApiResponse<ImageGenerationPreview>>(
    `/comic/scenes/${sceneId}/prepare-image`,
    provider ? { provider } : {},
  );
  return unwrapApiData(res.data);
}

export async function generateComicSceneImage(
  sceneId: string,
  provider?: string,
  overrides?: ImageGenerationOverrides,
): Promise<ComicScene> {
  const res = await apiClient.post<ApiResponse<ComicScene>>(
    `/comic/scenes/${sceneId}/generate-image`,
    { ...(provider ? { provider } : {}), ...(overrides ?? {}) },
  );
  return unwrapApiData(res.data);
}

export async function uploadComicSceneImage(sceneId: string, file: File): Promise<{ url: string }> {
  const res = await apiClient.post<ApiResponse<{ url: string }>>(
    `/comic/scenes/${sceneId}/upload-image`,
    file,
    { headers: { "Content-Type": file.type } },
  );
  return unwrapApiData(res.data);
}

export function comicSceneImageUrl(sceneId: string): string {
  return `/api/comic/scenes/${sceneId}/image`;
}
