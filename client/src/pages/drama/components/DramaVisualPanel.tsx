import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Film, ImageIcon, RefreshCw, Sparkles, Video } from "lucide-react";
import {
  estimateDramaEpisodeBatchJob,
  prepareDramaShotKeyframe,
  type DramaBatchCostBreakdown,
  type DramaBatchJob,
  type DramaBatchJobType,
  type DramaEpisode,
  type DramaProjectDetail,
  type DramaShot,
  type DramaShotKeyframeData,
  type DramaVideoPrompt,
  type DramaVideoProvider,
} from "@/api/drama";
import type { ImageGenerationOverrides } from "@/api/comic";
import { getAPIKeySettings } from "@/api/settings";
import { ImageGenerationConfirmDialog } from "@/components/image/ImageGenerationConfirmDialog";
import { useImageGenerationFlow } from "@/components/image/useImageGenerationFlow";
import { Link } from "react-router-dom";
import {
  DramaBatchJobCard,
  canRefreshVideoTask,
  currentStoryboard,
  currentVideoPrompts,
  hasEpisodeProduction,
  isBatchStoryboardCurrent,
  latestEpisodeBatch,
  videoStatusLabel,
} from "../production";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import SelectControl from "@/components/common/SelectControl";

export function DramaVisualPanel(props: {
  project: DramaProjectDetail;
  selectedOrder: number | null;
  onSelectOrder: (order: number) => void;
  onStoryboard: (order: number) => void;
  onBatchJob: (
    order: number,
    input: {
      type: DramaBatchJobType;
      provider?: string;
      failedShotIds?: string[];
      useCharacterRefImages?: boolean;
    },
  ) => void;
  onKeyframe: (
    shot: DramaShot,
    provider?: string,
    useCharacterRefImages?: boolean,
    overrides?: ImageGenerationOverrides,
  ) => Promise<unknown>;
  onVideoPrompt: (shot: DramaShot) => void;
  videoProviders: DramaVideoProvider[];
  selectedProvider: string;
  onSelectProvider: (provider: string) => void;
  onProviderTask: (prompt: DramaVideoPrompt, provider: string) => void;
  onPause: (job: DramaBatchJob) => void;
  onResume: (job: DramaBatchJob) => void;
  onRefreshProviderTask: (prompt: DramaVideoPrompt) => void;
  busy: boolean;
}) {
  const episodes = props.project.episodes ?? [];
  const selectedEpisode: DramaEpisode | undefined =
    episodes.find((episode) => episode.order === props.selectedOrder) ?? episodes[0];
  const storyboards = selectedEpisode?.storyboards ?? [];
  const storyboard = currentStoryboard(selectedEpisode);
  const videoPrompts = props.project.videoPrompts ?? [];
  const activeVideoPrompts = currentVideoPrompts(props.project);
  const promptsByShot = buildLatestPromptsByShot(activeVideoPrompts);
  const latestKeyframeBatch = selectedEpisode
    ? latestEpisodeBatch(props.project.batchJobs, selectedEpisode.id, "keyframes")
    : undefined;
  const latestVideoBatch = selectedEpisode
    ? latestEpisodeBatch(props.project.batchJobs, selectedEpisode.id, "videos")
    : undefined;
  const [selectedImageProvider, setSelectedImageProvider] = useState("");
  const [useCharacterRefImages, setUseCharacterRefImages] = useState(false);
  const keyframeFlow = useImageGenerationFlow();
  const apiKeyQuery = useQuery({
    queryKey: ["api-key-settings"],
    queryFn: getAPIKeySettings,
    staleTime: 60_000,
  });
  const imageProviders = useMemo(
    () =>
      (apiKeyQuery.data?.data ?? []).filter(
        (item) =>
          item.isActive &&
          item.isConfigured &&
          item.supportsImageGeneration &&
          item.currentImageModel,
      ),
    [apiKeyQuery.data?.data],
  );
  useEffect(() => {
    if (imageProviders.length > 0 && !selectedImageProvider) {
      setSelectedImageProvider(imageProviders[0]!.provider);
    }
  }, [imageProviders, selectedImageProvider]);
  const activeImageProvider = imageProviders.some(
    (provider) => provider.provider === selectedImageProvider,
  )
    ? selectedImageProvider
    : (imageProviders[0]?.provider ?? "");
  const promptStats = {
    prompted: activeVideoPrompts.length,
    withTask: activeVideoPrompts.filter((prompt) => Boolean(prompt.providerTaskId)).length,
    queued: activeVideoPrompts.filter(
      (prompt) => prompt.status === "queued" || prompt.status === "running",
    ).length,
    succeeded: activeVideoPrompts.filter((prompt) => prompt.status === "succeeded").length,
    failed: activeVideoPrompts.filter((prompt) => prompt.status === "failed").length,
    history: videoPrompts.length - activeVideoPrompts.length,
  };

  const startKeyframeGeneration = (shot: DramaShot) => {
    keyframeFlow.start({
      prepare: async () => {
        const result = await prepareDramaShotKeyframe(
          props.project.id,
          shot.id,
          activeImageProvider || undefined,
          useCharacterRefImages,
        );
        return result.data!;
      },
      generate: (overrides) =>
        props.onKeyframe(shot, activeImageProvider || undefined, useCharacterRefImages, overrides),
    });
  };
  const hasStoryboardShots = Boolean(storyboard?.shots?.length);
  const keyframeBatchActive = Boolean(
    selectedEpisode && hasEpisodeProduction(props.project.batchJobs, selectedEpisode, "keyframes"),
  );
  const videoBatchActive = Boolean(
    selectedEpisode && hasEpisodeProduction(props.project.batchJobs, selectedEpisode, "videos"),
  );
  const episodeProductionActive = Boolean(
    selectedEpisode && hasEpisodeProduction(props.project.batchJobs, selectedEpisode),
  );
  const canUseVideoProvider = Boolean(
    props.selectedProvider &&
    props.videoProviders.some((provider) => provider.provider === props.selectedProvider),
  );
  const keyframeEstimateQuery = useQuery({
    queryKey: [
      "drama",
      "batch-estimate",
      props.project.id,
      selectedEpisode?.order,
      storyboard?.id,
      selectedEpisode?.revision,
      "keyframes",
      activeImageProvider,
      useCharacterRefImages,
    ],
    queryFn: () =>
      estimateDramaEpisodeBatchJob(props.project.id, selectedEpisode!.order, {
        type: "keyframes",
        provider: activeImageProvider || undefined,
        useCharacterRefImages,
      }),
    enabled: Boolean(selectedEpisode && hasStoryboardShots && activeImageProvider),
    staleTime: 30_000,
  });
  const videoEstimateQuery = useQuery({
    queryKey: [
      "drama",
      "batch-estimate",
      props.project.id,
      selectedEpisode?.order,
      storyboard?.id,
      selectedEpisode?.revision,
      "videos",
      props.selectedProvider,
    ],
    queryFn: () =>
      estimateDramaEpisodeBatchJob(props.project.id, selectedEpisode!.order, {
        type: "videos",
        provider: props.selectedProvider,
      }),
    enabled: Boolean(selectedEpisode && hasStoryboardShots && canUseVideoProvider),
    staleTime: 30_000,
  });

  if (!selectedEpisode) {
    return (
      <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
        先生成分集和台本，再进入分镜与视频提示词。
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ImageGenerationConfirmDialog {...keyframeFlow.dialogProps} />
      <div className="grid gap-3 md:grid-cols-6">
        <div className="rounded-md border p-3 text-sm">
          <div className="text-xs text-muted-foreground">当前提示词</div>
          <div className="mt-1 text-lg font-semibold">{promptStats.prompted}</div>
        </div>
        <div className="rounded-md border p-3 text-sm">
          <div className="text-xs text-muted-foreground">已创建任务</div>
          <div className="mt-1 text-lg font-semibold">{promptStats.withTask}</div>
        </div>
        <div className="rounded-md border p-3 text-sm">
          <div className="text-xs text-muted-foreground">生成中</div>
          <div className="mt-1 text-lg font-semibold">{promptStats.queued}</div>
        </div>
        <div className="rounded-md border p-3 text-sm">
          <div className="text-xs text-muted-foreground">已完成</div>
          <div className="mt-1 text-lg font-semibold">{promptStats.succeeded}</div>
        </div>
        <div className="rounded-md border p-3 text-sm">
          <div className="text-xs text-muted-foreground">失败</div>
          <div className="mt-1 text-lg font-semibold">{promptStats.failed}</div>
        </div>
        <div className="rounded-md border p-3 text-sm">
          <div className="text-xs text-muted-foreground">历史版本</div>
          <div className="mt-1 text-lg font-semibold">{promptStats.history}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <SelectControl
            className="h-10 rounded-md border bg-background px-3 text-sm"
            value={selectedEpisode.order}
            onChange={(event) => props.onSelectOrder(Number(event.target.value))}
          >
            {episodes.map((episode) => (
              <option key={episode.id} value={episode.order}>
                第 {episode.order} 集 {episode.title}
              </option>
            ))}
          </SelectControl>
          <SelectControl
            className="h-10 rounded-md border bg-background px-3 text-sm"
            value={props.selectedProvider}
            onChange={(event) => props.onSelectProvider(event.target.value)}
            aria-label="视频通道"
          >
            {props.videoProviders.length > 0 ? (
              props.videoProviders.map((provider) => (
                <option key={provider.provider} value={provider.provider}>
                  {provider.label}
                </option>
              ))
            ) : (
              <option value="">请配置视频通道</option>
            )}
          </SelectControl>
          <SelectControl
            className="h-10 rounded-md border bg-background px-3 text-sm"
            value={activeImageProvider}
            disabled={imageProviders.length === 0}
            onChange={(event) => setSelectedImageProvider(event.target.value)}
            aria-label="首帧图片通道"
          >
            {imageProviders.length > 0 ? (
              imageProviders.map((provider) => (
                <option key={provider.provider} value={provider.provider}>
                  {provider.name} · {provider.currentImageModel}
                </option>
              ))
            ) : (
              <option value="">请配置图片通道</option>
            )}
          </SelectControl>
          <label className="flex h-10 cursor-pointer items-center gap-2 rounded-md border bg-background px-3 text-sm">
            <input
              type="checkbox"
              checked={useCharacterRefImages}
              onChange={(event) => setUseCharacterRefImages(event.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            <span>角色参考图</span>
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={props.busy || episodeProductionActive || !selectedEpisode.content?.trim()}
            onClick={() => props.onStoryboard(selectedEpisode.order)}
          >
            <Film className="h-4 w-4" />
            生成分镜
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={
              props.busy ||
              !hasStoryboardShots ||
              imageProviders.length === 0 ||
              keyframeBatchActive
            }
            onClick={() =>
              props.onBatchJob(selectedEpisode.order, {
                type: "keyframes",
                provider: activeImageProvider || undefined,
                useCharacterRefImages,
              })
            }
          >
            <ImageIcon className="h-4 w-4" />
            生成本集首帧
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={props.busy || !hasStoryboardShots || videoBatchActive || !canUseVideoProvider}
            onClick={() =>
              props.onBatchJob(selectedEpisode.order, {
                type: "videos",
                provider: props.selectedProvider,
              })
            }
          >
            <Sparkles className="h-4 w-4" />
            创建本集视频任务
          </Button>
        </div>
      </div>
      {hasStoryboardShots ? (
        <div className="grid gap-3 md:grid-cols-2">
          <CostEstimate
            title="首帧预计费用"
            cost={keyframeEstimateQuery.data?.data?.cost}
            loading={keyframeEstimateQuery.isFetching}
          />
          <CostEstimate
            title="视频预计费用"
            cost={videoEstimateQuery.data?.data?.cost}
            loading={videoEstimateQuery.isFetching}
          />
        </div>
      ) : null}
      {latestKeyframeBatch || latestVideoBatch ? (
        <div className="grid gap-3 md:grid-cols-2">
          {latestKeyframeBatch ? (
            <DramaBatchJobCard
              job={latestKeyframeBatch}
              title="本集首帧任务"
              busy={props.busy}
              storyboardCurrent={isBatchStoryboardCurrent(latestKeyframeBatch, selectedEpisode)}
              onPause={props.onPause}
              onResume={props.onResume}
            />
          ) : null}
          {latestVideoBatch ? (
            <DramaBatchJobCard
              job={latestVideoBatch}
              title="本集视频任务"
              busy={props.busy}
              storyboardCurrent={isBatchStoryboardCurrent(latestVideoBatch, selectedEpisode)}
              onPause={props.onPause}
              onResume={props.onResume}
            />
          ) : null}
        </div>
      ) : null}
      {!canUseVideoProvider ? (
        <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          添加并启用视频通道后，可生成本集视频。
          <Button asChild variant="ghost" size="sm">
            <Link to="/settings/media">设置视频通道</Link>
          </Button>
        </div>
      ) : null}
      {imageProviders.length === 0 ? (
        <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          配置支持生图的模型后，可生成镜头首帧。
          <Button asChild variant="ghost" size="sm">
            <Link to="/settings/models">设置图片通道</Link>
          </Button>
        </div>
      ) : null}
      {props.videoProviders.length > 0 ? (
        <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          当前视频通道：
          {props.videoProviders.find((provider) => provider.provider === props.selectedProvider)
            ?.description || props.selectedProvider}
        </div>
      ) : null}
      {!storyboard ? (
        <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
          {storyboards.length
            ? "台本与分镜的版本不同，请生成分镜后继续制作。历史素材会保留。"
            : "当前集还没有分镜。"}
        </div>
      ) : (
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="text-lg">分镜</CardTitle>
            <CardDescription>{storyboard.summary || "已生成镜头序列。"}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(storyboard.shots ?? []).map((shot) => {
              const prompt = promptsByShot.get(shot.id);
              const keyframe = parseKeyframe(shot.keyframeData);
              return (
                <div key={shot.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="font-medium">
                        镜头 {shot.order} · {shot.shotSize || "景别待定"}
                      </div>
                      <div className="text-sm text-muted-foreground">{shot.action}</div>
                      <div className="flex flex-wrap gap-2">
                        {keyframe.status === "done" ? (
                          <Badge variant="outline">首帧 v{keyframe.version ?? 1}</Badge>
                        ) : null}
                        {keyframe.history?.length ? (
                          <Badge variant="secondary">{keyframe.history.length} 个首帧历史</Badge>
                        ) : null}
                        {prompt ? (
                          <Badge variant="outline">提示词 v{prompt.version ?? 1}</Badge>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        type="button"
                        variant={keyframe.status === "done" ? "outline" : "default"}
                        disabled={
                          props.busy ||
                          keyframeBatchActive ||
                          keyframeFlow.dialogProps.loading ||
                          keyframeFlow.dialogProps.submitting ||
                          imageProviders.length === 0 ||
                          keyframe.status === "generating"
                        }
                        onClick={() => startKeyframeGeneration(shot)}
                      >
                        <ImageIcon className="h-4 w-4" />
                        {keyframe.status === "done" ? "重生成首帧" : "生成首帧"}
                      </Button>
                      <Button
                        size="sm"
                        type="button"
                        variant="outline"
                        disabled={
                          props.busy ||
                          videoBatchActive ||
                          Boolean(
                            prompt &&
                            ["queued", "running", "submitting", "submission_unknown"].includes(
                              prompt.status,
                            ),
                          )
                        }
                        onClick={() => props.onVideoPrompt(shot)}
                      >
                        <Video className="h-4 w-4" />
                        视频提示词
                      </Button>
                      {prompt ? (
                        <>
                          <Button
                            size="sm"
                            type="button"
                            disabled={
                              props.busy ||
                              videoBatchActive ||
                              !canUseVideoProvider ||
                              !canSubmitVideo(prompt)
                            }
                            onClick={() =>
                              props.onProviderTask(
                                prompt,
                                ["failed", "submission_unknown"].includes(prompt.status)
                                  ? prompt.provider
                                  : props.selectedProvider,
                              )
                            }
                          >
                            <Sparkles className="h-4 w-4" />
                            {videoTaskButtonLabel(prompt)}
                          </Button>
                          {prompt.providerTaskId ? (
                            <Button
                              size="sm"
                              type="button"
                              variant="outline"
                              disabled={
                                props.busy ||
                                !canRefreshVideoTask(prompt) ||
                                !activeVideoPrompts.some((active) => active.id === prompt.id)
                              }
                              onClick={() => props.onRefreshProviderTask(prompt)}
                            >
                              <RefreshCw className="h-4 w-4" />
                              刷新状态
                            </Button>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  </div>
                  <KeyframePreview shot={shot} keyframe={keyframe} />
                  {prompt ? <VideoPromptDetails prompt={prompt} /> : null}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {videoPrompts.length > 0 ? (
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="text-lg">视频任务</CardTitle>
            <CardDescription>
              查看各镜头的视频结果和未完成任务，提交结果待确认时请先核对生成通道。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {videoPrompts.map((prompt) => (
              <div key={prompt.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <Badge variant="secondary">{prompt.provider}</Badge>
                      <Badge variant="outline">v{prompt.version ?? 1}</Badge>
                      <Badge variant={prompt.status === "failed" ? "destructive" : "outline"}>
                        {videoStatusLabel(prompt.status)}
                      </Badge>
                      {!activeVideoPrompts.some((active) => active.id === prompt.id) ? (
                        <Badge variant="secondary">历史版本</Badge>
                      ) : null}
                      {prompt.providerTaskId ? (
                        <span className="text-muted-foreground">任务：{prompt.providerTaskId}</span>
                      ) : null}
                    </div>
                    <p className="line-clamp-2 text-sm text-muted-foreground">{prompt.prompt}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {canSubmitVideo(prompt) ? (
                      <Button
                        size="sm"
                        type="button"
                        disabled={
                          props.busy ||
                          videoBatchActive ||
                          !canUseVideoProvider ||
                          !activeVideoPrompts.some((active) => active.id === prompt.id)
                        }
                        onClick={() =>
                          props.onProviderTask(
                            prompt,
                            ["failed", "submission_unknown"].includes(prompt.status)
                              ? prompt.provider
                              : props.selectedProvider,
                          )
                        }
                      >
                        <Sparkles className="h-4 w-4" />
                        {videoTaskButtonLabel(prompt)}
                      </Button>
                    ) : prompt.providerTaskId ? (
                      <Button
                        size="sm"
                        type="button"
                        variant="outline"
                        disabled={
                          props.busy ||
                          !canRefreshVideoTask(prompt) ||
                          !activeVideoPrompts.some((active) => active.id === prompt.id)
                        }
                        onClick={() => props.onRefreshProviderTask(prompt)}
                      >
                        <RefreshCw className="h-4 w-4" />
                        刷新状态
                      </Button>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        {videoTaskButtonLabel(prompt)}
                      </span>
                    )}
                  </div>
                </div>
                <VideoPromptDetails prompt={prompt} compact />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function safeJson<T>(input: string | null | undefined, fallback: T): T {
  if (!input) {
    return fallback;
  }
  try {
    return JSON.parse(input) as T;
  } catch {
    return fallback;
  }
}

function parseKeyframe(raw: string | null | undefined): DramaShotKeyframeData {
  return safeJson<DramaShotKeyframeData>(raw, { status: "idle" });
}

function canSubmitVideo(prompt: DramaVideoPrompt): boolean {
  return (
    ["failed", "submission_unknown"].includes(prompt.status) ||
    (!prompt.providerTaskId &&
      !["queued", "running", "submitting", "succeeded", "superseded"].includes(prompt.status))
  );
}

function videoTaskButtonLabel(prompt: DramaVideoPrompt): string {
  if (prompt.status === "submission_unknown") return "核对并确认重发";
  if (prompt.status === "failed") return "确认重试视频";
  if (prompt.status === "submitting") return "正在提交视频";
  return prompt.providerTaskId ? "任务已创建" : "创建视频任务";
}

function buildLatestPromptsByShot(prompts: DramaVideoPrompt[]): Map<string, DramaVideoPrompt> {
  const result = new Map<string, DramaVideoPrompt>();
  for (const prompt of prompts) {
    if (prompt.shotId && !result.has(prompt.shotId)) {
      result.set(prompt.shotId, prompt);
    }
  }
  return result;
}

function KeyframePreview({ shot, keyframe }: { shot: DramaShot; keyframe: DramaShotKeyframeData }) {
  const hasImage = keyframe.status === "done" && keyframe.url;
  return (
    <div className="mt-3 space-y-3">
      <div className="grid gap-3 md:grid-cols-[160px_1fr]">
        {hasImage ? (
          <a href={keyframe.url} target="_blank" rel="noreferrer" className="block">
            <img
              src={keyframe.url}
              alt={`镜头 ${shot.order} 首帧图`}
              className="h-56 w-full rounded-md border object-cover md:h-40"
            />
          </a>
        ) : (
          <div className="flex h-40 w-full items-center justify-center rounded-md border border-dashed bg-muted text-xs text-muted-foreground">
            {keyframe.status === "generating"
              ? "首帧图生成中"
              : keyframe.status === "error"
                ? "首帧图生成失败"
                : "尚未生成首帧"}
          </div>
        )}
        <div className="rounded-md border bg-muted/20 p-3 text-xs leading-5 text-muted-foreground">
          <div className="mb-1 flex flex-wrap items-center gap-2 font-medium text-foreground">
            <span>镜头画面</span>
            {keyframe.status === "done" ? (
              <Badge variant="outline">v{keyframe.version ?? 1}</Badge>
            ) : null}
          </div>
          <div>{shot.visualPrompt || shot.action}</div>
          {shot.location ? <div className="mt-1">地点：{shot.location}</div> : null}
          {keyframe.provider ? <div className="mt-1">首帧通道：{keyframe.provider}</div> : null}
          {keyframe.status === "error" && keyframe.error ? (
            <div className="mt-2 text-destructive">{keyframe.error}</div>
          ) : null}
        </div>
      </div>
      <KeyframeHistory history={keyframe.history ?? []} />
    </div>
  );
}

function formatLocalTime(value: string | undefined): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

function KeyframeHistory({ history }: { history: NonNullable<DramaShotKeyframeData["history"]> }) {
  if (!history.length) {
    return null;
  }
  const items = [...history].sort((left, right) => right.version - left.version);
  return (
    <div className="rounded-md border border-dashed p-3 text-xs">
      <div className="mb-2 font-medium">首帧历史版本</div>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => {
          const label = `v${item.version}${item.provider ? ` · ${item.provider}` : ""}`;
          return item.url ? (
            <a
              key={`${item.version}-${item.url}`}
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border px-2 py-1 text-primary underline-offset-4 hover:underline"
              title={formatLocalTime(item.generatedAt)}
            >
              {label}
            </a>
          ) : (
            <span
              key={item.version}
              className="rounded-md border px-2 py-1 text-muted-foreground"
              title={formatLocalTime(item.generatedAt)}
            >
              {label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function formatCost(cost: DramaBatchCostBreakdown, amount: number): string {
  return `${cost.currency} ${amount.toFixed(2)}`;
}

function costUnitLabel(cost: DramaBatchCostBreakdown): string {
  const parts = [];
  if (cost.unit.costPerImage) {
    parts.push(`图片 ${formatCost(cost, cost.unit.costPerImage)}/张`);
  }
  if (cost.unit.costPerSecond) {
    parts.push(`时长 ${formatCost(cost, cost.unit.costPerSecond)}/秒`);
  }
  return parts.length ? parts.join("，") : "未配置单价，费用请以生成通道账单为准";
}

function CostEstimate(props: { title: string; cost?: DramaBatchCostBreakdown; loading: boolean }) {
  return (
    <div className="rounded-md border border-dashed p-3 text-sm">
      <div className="text-xs text-muted-foreground">{props.title}</div>
      <div className="mt-1 font-medium">
        {props.loading
          ? "计算中"
          : props.cost
            ? formatCost(props.cost, props.cost.estimated)
            : "待计算"}
      </div>
      {props.cost ? (
        <div className="mt-1 text-xs text-muted-foreground">
          {costUnitLabel(props.cost)}
          {props.cost.estimatedUnits.shots ? ` · ${props.cost.estimatedUnits.shots} 个镜头` : ""}
        </div>
      ) : null}
    </div>
  );
}

function VideoPromptDetails({
  prompt,
  compact = false,
}: {
  prompt: DramaVideoPrompt;
  compact?: boolean;
}) {
  const providerResult = safeJson<{
    resultUrl?: string;
    failureReason?: string;
    status?: string;
    raw?: unknown;
  }>(prompt.providerResult, {});
  const resultUrl = prompt.resultUrl || providerResult.resultUrl;
  const failureReason = prompt.failureReason || providerResult.failureReason;

  return (
    <div className="mt-3 space-y-2">
      {!compact ? (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="secondary">{prompt.provider}</Badge>
            <Badge variant="outline">v{prompt.version ?? 1}</Badge>
            <Badge variant={prompt.status === "failed" ? "destructive" : "outline"}>
              {videoStatusLabel(prompt.status)}
            </Badge>
            {prompt.status === "superseded" || Boolean(prompt.supersededById) ? (
              <Badge variant="secondary">历史版本</Badge>
            ) : null}
            {prompt.providerTaskId ? (
              <span className="text-muted-foreground">任务：{prompt.providerTaskId}</span>
            ) : null}
          </div>
          <pre className="whitespace-pre-wrap rounded-md bg-muted/30 p-3 text-xs leading-5">
            {prompt.prompt}
          </pre>
        </>
      ) : null}
      {prompt.negativePrompt ? (
        <div className="rounded-md border p-3 text-xs leading-5 text-muted-foreground">
          <div className="mb-1 font-medium text-foreground">负面提示词</div>
          {prompt.negativePrompt}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span>版本：v{prompt.version ?? 1}</span>
        <span>画幅：{prompt.aspectRatio}</span>
        {prompt.durationSec ? <span>时长：{prompt.durationSec} 秒</span> : null}
        {providerResult.status ? <span>视频通道状态：{providerResult.status}</span> : null}
      </div>
      {resultUrl ? (
        <a
          className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
          href={resultUrl}
          target="_blank"
          rel="noreferrer"
        >
          查看生成结果
          <ExternalLink className="h-4 w-4" />
        </a>
      ) : null}
      {prompt.status === "failed" ? (
        <div className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">
          {failureReason
            ? `视频任务失败：${failureReason}`
            : "视频任务失败。请核对生成通道后，点击“确认重试视频”。"}
        </div>
      ) : null}
      {prompt.status === "submission_unknown" ? (
        <p className="rounded-md border p-3 text-sm text-muted-foreground">
          提交结果待确认。请先查看生成通道中的任务和账单，再决定是否重新提交。
        </p>
      ) : null}
    </div>
  );
}
