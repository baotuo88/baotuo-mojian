import { useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Loader2 } from "lucide-react";
import { generateComicOutline, generateComicPanelScript, getComicProject, importComicSourceBundle, listComicPanels, type ComicEpisode, type ComicProjectDetail } from "@/api/comic";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { hasReadyCharacterSheet, resolveProductionStep, type ComicWorkspaceTab, type ProductionStep } from "./productionGuide";

const STEPS: Record<ProductionStep, { label: string; description: string; action: string; tab: ComicWorkspaceTab }> = {
  import: { label: "准备故事资料", description: "导入故事、角色与世界信息，让漫画沿用原作设定。", action: "导入故事资料", tab: "outline" },
  outline: { label: "规划第一话", description: "AI 根据故事资料安排第一话剧情与结尾悬念，先完成一话再继续连载。", action: "AI 规划第一话", tab: "outline" },
  script: { label: "准备第一话分镜", description: "AI 将剧情拆成连续画面，安排动作、台词与角色出场。", action: "AI 生成第一话分镜", tab: "outline" },
  characters: { label: "确认角色形象", description: "为角色准备设计稿，后续画面会参考同一份形象。生图前可以查看素材与模型参数。", action: "准备角色设计稿", tab: "characters" },
  panels: { label: "完成第一话图片", description: "批量生成未完成画面，查看条带阅读效果；失败格子可以单独重试。", action: "生成并审阅第一话", tab: "panels" },
  export: { label: "导出第一话", description: "检查画面和对白后，导出完整长图或分段图片。下载记录会保留在项目中。", action: "查看导出选项", tab: "export" },
};

export function FirstEpisodeGuide({ project, episodes, onNavigate }: {
  project: ComicProjectDetail;
  episodes: ComicEpisode[];
  onNavigate: (tab: ComicWorkspaceTab, episodeId?: string) => void;
}) {
  const queryClient = useQueryClient();
  const lock = useRef(false);
  const first = [...episodes].sort((a, b) => a.order - b.order)[0];
  const panelsQuery = useQuery({
    queryKey: ["comic", "panels", first?.id],
    queryFn: () => listComicPanels(first!.id),
    enabled: Boolean(first),
  });
  const step = resolveProductionStep({ hasSource: Boolean(project.sourceBundle), episodes, characters: project.characters, panels: panelsQuery.data ?? [] });
  const content = STEPS[step];
  const readyCharacters = project.characters.filter(hasReadyCharacterSheet).length;
  const mutation = useMutation({
    mutationFn: async () => {
      const current = await getComicProject(project.id);
      if (step === "import") return current.sourceBundle ? current : importComicSourceBundle(project.id);
      if (step === "outline") return current.episodes.length > 0 ? current : generateComicOutline(project.id, { startOrder: 1, count: 1 });
      if (step === "script" && first) {
        const existing = await listComicPanels(first.id);
        if (existing.length > 0) return current;
        let format = "webtoon";
        try { format = JSON.parse(project.stylePreset ?? "{}").format ?? format; } catch { /* use project default */ }
        return generateComicPanelScript(first.id, { densityMode: "balanced", targetPanelCount: format === "4koma" ? 12 : 30 });
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["comic", "project", project.id] }),
        queryClient.invalidateQueries({ queryKey: ["comic", "episodes", project.id] }),
        queryClient.invalidateQueries({ queryKey: ["comic", "panels", first?.id] }),
      ]);
      toast.success("准备完成，可以继续下一步");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : String(error)),
  });
  const advance = async () => {
    if (!["import", "outline", "script"].includes(step)) {
      onNavigate(content.tab, first?.id);
      return;
    }
    if (lock.current) return;
    lock.current = true;
    try { await mutation.mutateAsync(); } catch { /* mutation reports the error */ }
    finally { lock.current = false; }
  };
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-primary/25 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between" aria-label="第一话创作指引">
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-primary">从故事到第一话漫画</p>
        <h2 className="text-base font-semibold">{content.label}</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">{content.description}</p>
        {step === "characters" && <p className="text-xs text-muted-foreground">{readyCharacters} / {project.characters.length} 个角色设计稿就绪</p>}
        {panelsQuery.isError && <p className="text-xs text-destructive">分镜进度读取失败。<button type="button" className="ml-2 underline" onClick={() => void panelsQuery.refetch()}>重新读取</button></p>}
      </div>
      <Button type="button" className="shrink-0" disabled={mutation.isPending || Boolean(first && panelsQuery.isPending) || panelsQuery.isError} onClick={() => void advance()}>
        {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
        {mutation.isPending ? "AI 准备中…" : content.action}
      </Button>
    </section>
  );
}
