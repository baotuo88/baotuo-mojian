import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Film, RefreshCw, Square } from "lucide-react";
import { cancelDramaEpisodeRender, createDramaEpisodeRender, listDramaEpisodeRenders, type DramaProjectDetail } from "@/api/drama";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import SelectControl from "@/components/common/SelectControl";
import { toast } from "@/components/ui/toast";
import { isActiveRender, isCurrentRender, renderProgress, renderReadiness, renderStatusLabel } from "./projection";

export function DramaRenderPanel(props: {
  project: DramaProjectDetail;
  selectedOrder: number | null;
  onSelectOrder: (order: number) => void;
  busy: boolean;
}) {
  const queryClient = useQueryClient();
  const episodes = props.project.episodes ?? [];
  const episode = episodes.find((item) => item.order === props.selectedOrder) ?? episodes[0];
  const queryKey = ["drama", "renders", props.project.id, episode?.order];
  const renders = useQuery({
    queryKey,
    queryFn: () => listDramaEpisodeRenders(props.project.id, episode!.order),
    enabled: Boolean(episode),
    refetchInterval: (query) => query.state.data?.data?.some(isActiveRender) ? 2_000 : false,
  });
  useEffect(() => {
    if (episode) void queryClient.invalidateQueries({ queryKey: ["drama", "renders", props.project.id, episode.order] });
  }, [props.project, episode?.order, queryClient]);
  const jobs = [...(renders.data?.data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const readiness = renderReadiness(props.project, episode);
  const active = jobs.some(isActiveRender);
  const action = useMutation({
    mutationFn: async (input: { order: number; cancelId?: string }) => {
      const response = input.cancelId
        ? await cancelDramaEpisodeRender(props.project.id, input.cancelId)
        : await createDramaEpisodeRender(props.project.id, input.order);
      if (response.data) {
        const job = response.data;
        queryClient.setQueryData<Awaited<ReturnType<typeof listDramaEpisodeRenders>>>(["drama", "renders", props.project.id, input.order], (previous) => ({
          ...response, data: [job, ...(previous?.data ?? []).filter((item) => item.id !== job.id)],
        }));
      }
      return input;
    },
    onSuccess: async (input) => {
      toast.success(input.cancelId ? "合成任务已取消。" : "成片合成已开始，可在这里查看进度。");
      await queryClient.invalidateQueries({ queryKey: ["drama", "renders", props.project.id, input.order] });
    },
  });

  return <Card className="rounded-lg">
    <CardHeader>
      <CardTitle className="text-lg">合成 MP4 成片</CardTitle>
      <CardDescription>把本集镜头视频、已生成的配音和字幕合成为竖屏视频。合成在自部署服务器完成，无需调用 AI 生成通道。</CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <SelectControl className="h-10 rounded-md border bg-background px-3 text-sm" aria-label="成片集数" value={episode?.order ?? ""}
          onChange={(event) => props.onSelectOrder(Number(event.target.value))}>
          {episodes.length ? episodes.map((item) => <option key={item.id} value={item.order}>第 {item.order} 集 · {item.title}</option>) : <option value="">请先生成分集</option>}
        </SelectControl>
        <Button disabled={props.busy || action.isPending || renders.isPending || renders.isError || !readiness.ready || active} onClick={() => { if (episode) action.mutate({ order: episode.order }); }}>
          <Film className="h-4 w-4" />{active ? "成片合成中" : "合成本集成片"}
        </Button>
      </div>
      {!readiness.ready ? <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
        {!readiness.total ? "请先根据当前台本生成分镜，再完成各镜头视频。" : `还有 ${readiness.missingShotOrders.length} 个镜头缺少可用视频（镜头 ${readiness.missingShotOrders.join("、")}）。请在“分镜视频”完成制作后合成。`}
      </p> : <p className="text-sm text-muted-foreground">本集 {readiness.total} 个镜头视频可用于合成。合成期间请保留服务器运行。</p>}
      {renders.isError ? <div role="alert" className="rounded-md border p-3 text-sm">无法读取成片任务，请刷新后重试。<Button size="sm" variant="ghost" onClick={() => void renders.refetch()}><RefreshCw className="h-4 w-4" />刷新任务</Button></div> : null}
      {jobs.map((job) => {
        const current = isCurrentRender(job, episode);
        return <div key={job.id} className="space-y-2 rounded-md border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant={job.status === "failed" ? "destructive" : "outline"}>{renderStatusLabel(job)}</Badge>
              <span className="text-muted-foreground">台本版本 {job.sourceRevision}</span>
              {!current ? <Badge variant="secondary">历史版本</Badge> : null}
              <span className="text-xs text-muted-foreground">{new Date(job.createdAt).toLocaleString()}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {isActiveRender(job) ? <Button variant="outline" size="sm" disabled={action.isPending} onClick={() => { if (episode) action.mutate({ order: episode.order, cancelId: job.id }); }}><Square className="h-4 w-4" />取消合成</Button> : null}
              {current && ["failed", "cancelled"].includes(job.status) ? <Button variant="outline" size="sm" disabled={props.busy || action.isPending || active || !readiness.ready || renders.isError} onClick={() => { if (episode) action.mutate({ order: episode.order }); }}><RefreshCw className="h-4 w-4" />重新合成</Button> : null}
              {job.status === "succeeded" && job.resultUrl ? <Button asChild size="sm" variant={current ? "default" : "outline"}><a href={job.resultUrl} download={`第${episode?.order ?? ""}集-台本${job.sourceRevision}.mp4`}><Download className="h-4 w-4" />{current ? "下载 MP4 成片" : "下载历史成片"}</a></Button> : null}
            </div>
          </div>
          {isActiveRender(job) ? <div className="space-y-1">
            <progress className="h-2 w-full accent-primary" max={100} value={renderProgress(job)} aria-label="成片合成进度" />
            <p className="text-xs text-muted-foreground">{renderProgress(job)}% · 任务会自动刷新，离开页面后仍会继续合成。</p>
          </div> : null}
          {job.failureReason ? <p className="text-sm text-destructive">{job.failureReason}</p> : null}
          {!current ? <p className="text-xs text-muted-foreground">本任务使用其他版本的台本、分镜或音视频素材，可保留作对照。</p> : null}
          {job.status === "succeeded" && !job.resultUrl ? <p className="text-sm text-destructive">任务没有可下载的成片，请重新合成。</p> : null}
        </div>;
      })}
    </CardContent>
  </Card>;
}
