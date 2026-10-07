import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Play, RotateCcw, Square } from "lucide-react";
import {
  cancelComicBatchJob,
  estimateBatchCost,
  listBatchJobs,
  retryBatchJob,
  startEpisodeBatch,
} from "@/api/comic";
import { getAPIKeySettings } from "@/api/settings";
import { Button } from "@/components/ui/button";
import { AppDialogContent, Dialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import {
  batchPercent,
  parseBatchProgress,
  remainingBatchPanels,
  selectEpisodeBatchJob,
} from "./batchProjection";

type Confirmation = {
  kind: "start" | "retry";
  provider: string;
  count: number;
  jobId?: string;
  imageModel?: string;
  scopeFingerprint?: string;
};

export function BatchBar({
  projectId,
  episodeId,
  provider,
}: {
  projectId: string;
  episodeId: string;
  provider: string;
}) {
  const queryClient = useQueryClient();
  const commandLock = useRef(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const imageSettings = useQuery({
    queryKey: ["settings", "api-keys"],
    queryFn: getAPIKeySettings,
    enabled: Boolean(confirmation),
  });
  const imageConfig = imageSettings.data?.data?.find(
    (setting) => setting.provider === confirmation?.provider,
  );
  const imageModel =
    confirmation?.imageModel || imageConfig?.currentImageModel || imageConfig?.defaultImageModel;
  const jobsKey = ["comic", "batch-jobs", projectId];
  const jobsQuery = useQuery({
    queryKey: jobsKey,
    queryFn: () => listBatchJobs(projectId),
    refetchInterval: (query) =>
      query.state.data?.some((job) => job.status === "running") ? 2500 : false,
  });
  const estimateQuery = useQuery({
    queryKey: ["comic", "batch-estimate", episodeId, provider],
    queryFn: () => estimateBatchCost(episodeId, provider || undefined),
    enabled: Boolean(provider),
  });
  const job = selectEpisodeBatchJob(jobsQuery.data ?? [], episodeId);
  const progress = job ? parseBatchProgress(job.progress) : null;
  const running = job?.status === "running";
  const recoverable = Boolean(
    job &&
    progress?.recoverable !== false &&
    ["partial", "interrupted", "waiting_recovery", "cancelled"].includes(job.status),
  );
  const pendingCount = estimateQuery.data?.pendingPanels ?? 0;

  // A changed persisted progress record refreshes the actual images and cost
  // estimate; parent renders and episode switches do not restart timers.
  useEffect(() => {
    if (!job?.id) return;
    void queryClient.invalidateQueries({ queryKey: ["comic", "panels", episodeId] });
    void queryClient.invalidateQueries({ queryKey: ["comic", "batch-estimate", episodeId] });
    if (job?.status !== "running") {
      void queryClient.invalidateQueries({ queryKey: ["comic", "project", projectId] });
    }
  }, [episodeId, projectId, job?.id, job?.progress, job?.status, queryClient]);

  const command = useMutation({
    mutationFn: async (input: Confirmation | { kind: "cancel"; jobId: string }) => {
      if (input.kind === "cancel") return cancelComicBatchJob(input.jobId);
      if (input.kind === "retry") return retryBatchJob(input.jobId!);
      return startEpisodeBatch(episodeId, {
        provider: input.provider,
        concurrency: 3,
        skipDone: true,
        expectedScopeFingerprint: input.scopeFingerprint,
      });
    },
    onSuccess: () => setConfirmation(null),
    onError: (error) => {
      setConfirmation(null);
      toast.error(error instanceof Error ? error.message : String(error));
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: jobsKey }),
        queryClient.invalidateQueries({ queryKey: ["comic", "batch-estimate", episodeId] }),
        queryClient.invalidateQueries({ queryKey: ["comic", "panels", episodeId] }),
      ]);
    },
  });

  const submit = async (input: Parameters<typeof command.mutateAsync>[0]) => {
    if (commandLock.current) return;
    commandLock.current = true;
    try {
      await command.mutateAsync(input);
    } catch {
      /* onError reports the failure */
    } finally {
      commandLock.current = false;
    }
  };
  const busy = command.isPending;
  const blocked = busy || running || !jobsQuery.isSuccess || jobsQuery.isError;
  const openRetry = () => {
    if (!job || !progress) return;
    setConfirmation({
      kind: "retry",
      provider: progress.provider ?? provider,
      imageModel: progress.imageModel,
      count: remainingBatchPanels(progress),
      jobId: job.id,
    });
  };

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3" aria-label="本话图片生成进度">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={blocked || !provider || pendingCount === 0 || !estimateQuery.isSuccess}
          onClick={() =>
            setConfirmation({
              kind: "start",
              provider,
              count: pendingCount,
              scopeFingerprint: estimateQuery.data?.scopeFingerprint,
              imageModel: estimateQuery.data?.imageModel,
            })
          }
        >
          {running || busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
          {running ? "正在生成本话图片" : `生成未完成的 ${pendingCount} 格`}
        </Button>
        {recoverable && progress && remainingBatchPanels(progress) > 0 && (
          <Button type="button" size="sm" variant="outline" disabled={blocked} onClick={openRetry}>
            <RotateCcw className="h-3.5 w-3.5" />
            {job?.status === "partial" ? `重试失败的 ${progress.failed} 格` : "继续未完成图片"}
          </Button>
        )}
        {running && job && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void submit({ kind: "cancel", jobId: job.id })}
          >
            <Square className="h-3.5 w-3.5" />
            停止后续生成
          </Button>
        )}
      </div>
      {!provider && (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          请在项目顶部选择可用的图片服务。
        </p>
      )}
      {jobsQuery.isError && (
        <p className="text-xs text-destructive">
          无法读取生成进度。
          <button type="button" className="ml-2 underline" onClick={() => void jobsQuery.refetch()}>
            重新读取
          </button>
        </p>
      )}
      {estimateQuery.isError && (
        <p className="text-xs text-destructive">
          无法确认待生成范围。
          <button
            type="button"
            className="ml-2 underline"
            onClick={() => void estimateQuery.refetch()}
          >
            重试
          </button>
        </p>
      )}
      {progress?.recoverable === false && job?.status !== "completed" && (
        <p className="text-xs text-muted-foreground">
          该任务无法直接续跑，请按当前分镜重新确认生成。
        </p>
      )}
      {progress && (
        <div className="space-y-2" aria-live="polite">
          <div className="flex flex-wrap justify-between gap-2 text-xs">
            <span>
              {progress.done} / {progress.total} 格生成成功
              {progress.failed > 0 ? `，${progress.failed} 格待重试` : ""}
            </span>
            <span>
              {job?.status === "completed"
                ? "本次任务完成"
                : job?.status === "interrupted" || job?.status === "waiting_recovery"
                  ? "等待继续"
                  : job?.status === "cancelled"
                    ? "后续生成停止"
                    : running
                      ? "可以离开页面，返回后查看进度"
                      : "保留成功图片，可继续重试"}
            </span>
          </div>
          <div
            className="h-1.5 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={batchPercent(progress)}
            aria-label="本话图片处理进度"
          >
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${batchPercent(progress)}%` }}
            />
          </div>
          {progress.errors && Object.keys(progress.errors).length > 0 && (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">查看未完成原因</summary>
              <ul className="mt-2 space-y-1">
                {Object.entries(progress.errors)
                  .slice(0, 5)
                  .map(([id, error]) => (
                    <li key={id}>{error}</li>
                  ))}
              </ul>
            </details>
          )}
        </div>
      )}
      <Dialog
        open={Boolean(confirmation)}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirmation(null);
        }}
      >
        <AppDialogContent
          title="确认本话图片生成"
          description="成功图片会保留，只处理本次未完成的格子。"
          className="max-w-lg"
          footer={
            <>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setConfirmation(null)}
              >
                返回
              </Button>
              <Button
                type="button"
                disabled={
                  busy ||
                  running ||
                  !confirmation?.provider ||
                  !imageModel ||
                  (!confirmation?.imageModel && imageSettings.isError) ||
                  jobsQuery.isError ||
                  (confirmation?.kind === "start" && !confirmation.scopeFingerprint)
                }
                onClick={() => confirmation && void submit(confirmation)}
              >
                {busy ? "正在提交…" : "确认并开始"}
              </Button>
            </>
          }
        >
          <div className="space-y-3 text-sm">
            <p>
              本次最多生成 <strong>{confirmation?.count ?? 0} 格</strong>，使用图片服务{" "}
              <strong>{confirmation?.provider || "未配置"}</strong>。
            </p>
            <p>
              图片模型：
              <strong>{imageModel || (imageSettings.isPending ? "正在读取…" : "未配置")}</strong>
            </p>
            {imageSettings.isError && (
              <p className="text-destructive">
                无法确认图片模型。
                <button
                  type="button"
                  className="ml-2 underline"
                  onClick={() => void imageSettings.refetch()}
                >
                  重新读取
                </button>
              </p>
            )}
            <p className="text-muted-foreground">
              {confirmation?.provider === provider
                ? estimateQuery.data?.providerNote ||
                  "费用无法预估，实际费用以图片服务平台账单为准。"
                : "费用无法预估，实际费用以图片服务平台账单为准。"}
            </p>
            <p className="text-muted-foreground">
              生成会消耗图片服务额度。图片失败时可从本页继续；停止后续生成无法撤回已发送的图片请求。
            </p>
          </div>
        </AppDialogContent>
      </Dialog>
    </div>
  );
}
