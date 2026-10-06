import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Headphones } from "lucide-react";
import {
  estimateDramaEpisodeBatchJob,
  type DramaBatchCostBreakdown,
  type DramaBatchJob,
  type DramaDialogueAudioData,
  type DramaEpisode,
  type DramaTTSProvider,
} from "@/api/drama";
import { Link } from "react-router-dom";
import { DramaBatchJobCard, currentStoryboard, hasEpisodeProduction, isBatchStoryboardCurrent, latestEpisodeBatch } from "../production";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import SelectControl from "@/components/common/SelectControl";

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

function parseAudioData(raw: string | null | undefined): DramaDialogueAudioData {
  return safeJson<DramaDialogueAudioData>(raw, { status: "idle", items: [] });
}

export function DramaEpisodeAudioPanel(props: {
  projectId: string;
  episode: DramaEpisode;
  batchJobs?: DramaBatchJob[];
  ttsProviders: DramaTTSProvider[];
  busy: boolean;
  onPause: (job: DramaBatchJob) => void;
  onResume: (job: DramaBatchJob) => void;
  onBatchJob: (order: number, input: { type: "tts"; provider?: string; failedShotIds?: string[] }) => void;
}) {
  const [selectedProvider, setSelectedProvider] = useState("");
  const activeProvider = props.ttsProviders.some((provider) => provider.provider === selectedProvider)
    ? selectedProvider
    : props.ttsProviders[0]?.provider ?? "";
  const latestTtsBatch = latestEpisodeBatch(props.batchJobs, props.episode.id, "tts");
  const ttsActive = hasEpisodeProduction(props.batchJobs, props.episode, "tts");
  const hasStoryboardShots = Boolean(currentStoryboard(props.episode)?.shots?.length);
  const estimateQuery = useQuery({
    queryKey: ["drama", "batch-estimate", props.projectId, props.episode.order, props.episode.revision, currentStoryboard(props.episode)?.id, "tts", activeProvider],
    queryFn: () => estimateDramaEpisodeBatchJob(props.projectId, props.episode.order, {
      type: "tts",
      provider: activeProvider,
    }),
    enabled: hasStoryboardShots && Boolean(activeProvider),
    staleTime: 30_000,
  });
  const audioItems = useMemo(() => {
    const storyboard = currentStoryboard(props.episode);
    return (storyboard?.shots ?? []).flatMap((shot) => {
      const audio = parseAudioData(shot.dialogueAudioData);
      return (audio.items ?? []).map((item) => ({
        ...item,
        shotOrder: shot.order,
      }));
    });
  }, [props.episode]);

  useEffect(() => {
    if (props.ttsProviders.length > 0 && !selectedProvider) {
      setSelectedProvider(props.ttsProviders[0]!.provider);
    }
  }, [props.ttsProviders, selectedProvider]);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">配音</h3>
        <div className="flex flex-wrap gap-2">
          <SelectControl
            className="h-9 rounded-md border bg-background px-2 text-xs"
            value={activeProvider}
            onChange={(event) => setSelectedProvider(event.target.value)}
            aria-label="配音通道"
          >
            {props.ttsProviders.length > 0 ? props.ttsProviders.map((provider) => (
              <option key={provider.provider} value={provider.provider}>{provider.label}</option>
            )) : (
              <option value="">请配置配音通道</option>
            )}
          </SelectControl>
          <Button
            size="sm"
            type="button"
            variant="outline"
            disabled={props.busy || ttsActive || !hasStoryboardShots || !activeProvider}
            onClick={() => props.onBatchJob(props.episode.order, { type: "tts", provider: activeProvider })}
          >
            <Headphones className="h-4 w-4" />
            合成本集配音
          </Button>
        </div>
      </div>
      <CostEstimate
        cost={estimateQuery.data?.data?.cost}
        loading={estimateQuery.isFetching}
      />

      {!activeProvider ? (
        <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">添加并启用配音通道后，可合成本集配音。<Button asChild variant="ghost" size="sm"><Link to="/settings/media">设置配音通道</Link></Button></div>
      ) : null}
      {latestTtsBatch ? (
        <DramaBatchJobCard job={latestTtsBatch} title="本集配音任务" busy={props.busy}
          storyboardCurrent={isBatchStoryboardCurrent(latestTtsBatch, props.episode)} onPause={props.onPause} onResume={props.onResume} />
      ) : null}

      {audioItems.length > 0 ? (
        <div className="space-y-2">
          {audioItems.map((item) => (
            <div key={`${item.shotOrder}-${item.lineIndex}`} className="rounded-md border p-3 text-sm">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge variant="secondary">镜头 {item.shotOrder}</Badge>
                {item.speaker ? <span className="font-medium">{item.speaker}</span> : null}
                {item.voiceId ? <span className="text-xs text-muted-foreground">声线：{item.voiceId}</span> : null}
              </div>
              <p className="mb-2 text-muted-foreground">{item.text}</p>
              <audio className="w-full" controls src={item.audioUrl} />
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">生成分镜后可合成本集配音。</div>
      )}
    </section>
  );
}

function formatCost(cost: DramaBatchCostBreakdown, amount: number): string {
  return `${cost.currency} ${amount.toFixed(2)}`;
}

function CostEstimate(props: { cost?: DramaBatchCostBreakdown; loading: boolean }) {
  return (
    <div className="rounded-md border border-dashed p-3 text-sm">
      <div className="text-xs text-muted-foreground">配音预计费用</div>
      <div className="mt-1 font-medium">
        {props.loading ? "计算中" : props.cost ? formatCost(props.cost, props.cost.estimated) : "生成分镜后可计算"}
      </div>
      {props.cost ? (
        <div className="mt-1 text-xs text-muted-foreground">
          {props.cost.unit.costPerSecond ? `时长 ${formatCost(props.cost, props.cost.unit.costPerSecond)}/秒` : "未配置单价，费用请以生成通道账单为准"}
          {props.cost.estimatedUnits.shots ? ` · ${props.cost.estimatedUnits.shots} 个镜头` : ""}
        </div>
      ) : null}
    </div>
  );
}
