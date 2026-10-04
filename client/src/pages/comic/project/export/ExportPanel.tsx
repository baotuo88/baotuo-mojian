import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Loader2 } from "lucide-react";
import { exportComicEpisode, listComicPanels, listExportJobs, type ComicEpisode, type ExportEpisodePayload } from "@/api/comic";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import SelectControl from "@/components/common/SelectControl";
import { missingPanelOrders, parseExportArtifacts } from "./exportProjection";

export function ExportPanel({ projectId, episodes, initialEpisodeId, onShowPanels, onEpisodeChange }: {
  projectId: string;
  episodes: ComicEpisode[];
  initialEpisodeId?: string;
  onShowPanels: (episodeId: string) => void;
  onEpisodeChange?: (episodeId: string) => void;
}) {
  const queryClient = useQueryClient();
  const lock = useRef(false);
  const [selectedId, setSelectedId] = useState(initialEpisodeId ?? "");
  const [format, setFormat] = useState<NonNullable<ExportEpisodePayload["format"]>>("long_image");
  const [exportError, setExportError] = useState("");
  const selected = episodes.find((episode) => episode.id === selectedId) ?? episodes[0];
  const panelsQuery = useQuery({
    queryKey: ["comic", "panels", selected?.id],
    queryFn: () => listComicPanels(selected!.id),
    enabled: Boolean(selected),
  });
  const historyQuery = useQuery({
    queryKey: ["comic", "export-jobs", projectId],
    queryFn: () => listExportJobs(projectId),
    refetchInterval: (query) => query.state.data?.some((job) => job.status === "processing") ? 2500 : false,
  });
  const missing = missingPanelOrders(panelsQuery.data ?? []);
  const complete = panelsQuery.isSuccess && !panelsQuery.isError && (panelsQuery.data?.length ?? 0) > 0 && missing.length === 0;
  const mutation = useMutation({
    mutationFn: () => exportComicEpisode(selected!.id, { format, spec: { sliceWidth: 800, sliceMaxHeight: format === "sliced" ? 4000 : 0, outputFormat: "png" } }),
    onMutate: () => setExportError(""),
    onSuccess: () => toast.success("导出完成，可从下载记录保存图片"),
    onError: (error) => {
      const message = error instanceof Error ? error.message : String(error);
      setExportError(message);
      toast.error(message);
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["comic", "export-jobs", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["comic", "panels", selected?.id] }),
      ]);
    },
  });
  const exportImages = async () => {
    if (lock.current) return;
    lock.current = true;
    try { await mutation.mutateAsync(); } catch { /* mutation reports the failure */ }
    finally { lock.current = false; }
  };

  return (
    <div className="space-y-6">
      <section className="space-y-4 rounded-xl border bg-card p-4">
        <div><h2 className="font-semibold">导出完整漫画</h2><p className="mt-1 text-sm text-muted-foreground">全部画面就绪后可导出。分段图片适合逐张上传到发布平台。</p></div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1 text-sm"><span className="block">选择话数</span>
            <SelectControl className="rounded-md border bg-background px-3 py-2" value={selected?.id ?? ""} disabled={mutation.isPending} onChange={(event) => { setSelectedId(event.target.value); setExportError(""); onEpisodeChange?.(event.target.value); }}>
              {episodes.map((episode) => <option key={episode.id} value={episode.id}>第 {episode.order} 话 {episode.title ?? ""}</option>)}
            </SelectControl>
          </label>
          <label className="space-y-1 text-sm"><span className="block">下载格式</span>
            <SelectControl className="rounded-md border bg-background px-3 py-2" value={format} disabled={mutation.isPending} onChange={(event) => setFormat(event.target.value as typeof format)}>
              <option value="long_image">完整长图</option><option value="sliced">分段图片（800 像素宽）</option>
            </SelectControl>
          </label>
          <Button type="button" disabled={!selected || !complete || mutation.isPending} onClick={() => void exportImages()}>
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}{mutation.isPending ? "正在导出…" : "生成下载图片"}
          </Button>
        </div>
        {panelsQuery.isPending ? <p className="text-sm text-muted-foreground">正在检查画面进度…</p> : panelsQuery.isError ? (
          <p className="text-sm text-destructive">无法读取画面进度。<button type="button" className="ml-2 underline" onClick={() => void panelsQuery.refetch()}>重新读取</button></p>
        ) : !complete ? (
          <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
            <p>{missing.length > 0 ? `还有 ${missing.length} 格未完成图片：第 ${missing.join("、")} 格。` : "该话还没有分镜图片，请先准备分镜。"}</p>
            {selected && <Button type="button" size="sm" variant="outline" onClick={() => onShowPanels(selected.id)}>去完成本话图片</Button>}
          </div>
        ) : <p className="text-sm text-muted-foreground">{panelsQuery.data.length} 格图片就绪。导出时会检查图片文件，缺失画面需要补齐后再导出。</p>}
        {exportError && <p className="text-sm text-destructive" role="alert">{exportError}</p>}
      </section>
      <section className="space-y-3" aria-label="漫画下载记录">
        <h2 className="font-semibold">下载记录</h2>
        {historyQuery.isPending && <p className="text-sm text-muted-foreground">正在读取下载记录…</p>}
        {historyQuery.isError && <p className="text-sm text-destructive">下载记录读取失败。<button type="button" className="ml-2 underline" onClick={() => void historyQuery.refetch()}>重试</button></p>}
        {historyQuery.data?.length === 0 && <p className="text-sm text-muted-foreground">导出完成后，图片下载链接会保留在这里。</p>}
        {historyQuery.data?.map((job) => {
          const episode = episodes.find((candidate) => candidate.id === job.episodeId);
          const artifacts = parseExportArtifacts(job.artifacts);
          return <div key={job.id} className="space-y-2 rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>{episode ? `第 ${episode.order} 话` : "漫画导出"} · {job.format === "sliced" ? "分段图片" : "完整长图"}</span>
              <span className="text-xs text-muted-foreground">{new Date(job.createdAt).toLocaleString("zh-CN")}</span>
            </div>
            {job.status === "processing" ? <p className="text-xs text-muted-foreground">图片导出中…</p> : job.status === "error" ? <p className="text-xs text-destructive">本次导出未完成，请补齐图片后重试。</p> : (
              <div className="flex flex-wrap gap-2">{artifacts.map((artifact, index) => <Button key={artifact.url} asChild type="button" size="sm" variant="outline"><a href={artifact.url} target="_blank" rel="noreferrer" download><Download className="h-3.5 w-3.5" />{artifacts.length > 1 ? `下载第 ${artifact.index ?? index + 1} 张` : "下载图片"}</a></Button>)}</div>
            )}
          </div>;
        })}
      </section>
    </div>
  );
}
