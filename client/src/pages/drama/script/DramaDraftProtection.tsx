import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Download, History, RefreshCw } from "lucide-react";
import { getDramaProject, listDramaEpisodeRevisions, type DramaEpisode } from "@/api/drama";
import { queryKeys } from "@/api/queryKeys";
import { Button } from "@/components/ui/button";
import { Dialog, AppDialogContent } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { draftAsText, isDraftDirty, type EpisodeDraftState } from "./draftState";

function downloadText(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function DramaDraftProtection(props: {
  projectId: string;
  episode: DramaEpisode;
  state: EpisodeDraftState;
  busy: boolean;
  onReload: (episode: DramaEpisode) => void;
}) {
  const [confirmReload, setConfirmReload] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const queryClient = useQueryClient();
  const dirty = isDraftDirty(props.state);
  const history = useQuery({
    queryKey: ["drama", "episode-revisions", props.projectId, props.episode.order, props.episode.revision],
    queryFn: () => listDramaEpisodeRevisions(props.projectId, props.episode.order),
    enabled: showHistory,
  });

  const reload = async () => {
    setReloading(true);
    try {
      const response = await getDramaProject(props.projectId);
      const fresh = response.data?.episodes?.find((item) => item.id === props.episode.id);
      if (!fresh) { toast.error("未能读取本集台本，本地稿会保留。"); return; }
      props.onReload(fresh);
      queryClient.setQueryData(queryKeys.drama.project(props.projectId), response);
      setConfirmReload(false);
    } catch {
      // API errors are shown by the client. Keep the local draft intact.
    } finally {
      setReloading(false);
    }
  };

  return <section className="space-y-3" aria-label="台本版本保护">
    <div role="status" className="rounded-md border p-3 text-sm">
      {props.state.conflict ? <p className="font-medium text-destructive">服务器台本有其他修改，本地编辑内容会保留。请先复制或下载本地稿，再载入服务器稿进行核对。</p>
        : <p className="text-muted-foreground">台本版本 {props.state.baseRevision} · {dirty ? "有未保存的编辑，切换分集时会保留。" : "编辑内容与保存的台本一致。"}</p>}
      {dirty || props.state.conflict ? <p className="mt-1 text-xs text-muted-foreground">保存台本后，请按新台本重新生成分镜和音视频；历史稿和素材会保留。</p> : null}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={async () => {
          try { await navigator.clipboard.writeText(draftAsText(props.state.draft)); toast.success("本地稿复制成功。"); }
          catch { toast.error("无法访问剪贴板，请下载本地稿。"); }
        }}><Copy className="h-4 w-4" />复制本地稿</Button>
        <Button size="sm" variant="outline" onClick={() => downloadText(draftAsText(props.state.draft), `第${props.episode.order}集-本地稿.txt`)}><Download className="h-4 w-4" />下载本地稿</Button>
        {dirty || props.state.conflict ? <Button size="sm" variant="outline" disabled={props.busy} onClick={() => setConfirmReload(true)}><RefreshCw className="h-4 w-4" />载入服务器稿</Button> : null}
        <Button size="sm" variant="ghost" onClick={() => setShowHistory((value) => !value)}><History className="h-4 w-4" />{showHistory ? "收起历史稿" : "查看历史稿"}</Button>
      </div>
    </div>
    <Dialog open={confirmReload} onOpenChange={(open) => { if (!reloading) setConfirmReload(open); }}>
      <AppDialogContent title="载入服务器台本" description="此操作会丢弃本集尚未保存的本地编辑。请先复制或下载需要保留的内容。"
        footer={<><Button variant="outline" disabled={reloading} onClick={() => setConfirmReload(false)}>保留本地稿</Button><Button variant="destructive" disabled={props.busy || reloading} onClick={() => void reload()}>{reloading ? "读取中..." : "丢弃本地编辑并载入"}</Button></>}>
        <p className="text-sm text-muted-foreground">载入后可把本地稿中需要的内容合并到服务器台本，再保存。</p>
      </AppDialogContent>
    </Dialog>
    {showHistory ? <div className="space-y-2 rounded-md border p-3">
      <h4 className="text-sm font-medium">历史台本</h4>
      {history.isPending ? <p className="text-sm text-muted-foreground">正在读取历史稿...</p> : null}
      {history.isError ? <Button variant="outline" size="sm" onClick={() => void history.refetch()}>重试读取历史稿</Button> : null}
      {!history.isPending && !history.isError && !history.data?.data?.length ? <p className="text-sm text-muted-foreground">修改或重新生成台本后，可在这里查看上一版台本。</p> : null}
      {(history.data?.data ?? []).map((revision) => <details key={revision.id} className="rounded-md border p-3 text-sm">
        <summary className="cursor-pointer">版本 {revision.revision} · {revision.title} · {new Date(revision.createdAt).toLocaleString()}</summary>
        <pre className="my-3 max-h-80 overflow-auto whitespace-pre-wrap leading-6">{revision.content || "本版未填写台本正文。"}</pre>
        <Button size="sm" variant="outline" onClick={() => downloadText(draftAsText({ title: revision.title, content: revision.content ?? "", hookOpening: revision.hookOpening ?? "", cliffhanger: revision.cliffhanger ?? "", durationSec: revision.durationSec == null ? "" : String(revision.durationSec) }), `第${props.episode.order}集-版本${revision.revision}.txt`)}><Download className="h-4 w-4" />下载此版台本</Button>
      </details>)}
    </div> : null}
  </section>;
}
