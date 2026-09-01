import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getBaseCharacterList } from "@/api/character";
import { getGenreTree, flattenGenreTreeOptions } from "@/api/genre";
import {
  getChapterAuditReports,
  getChapterPlan,
  getChapterResourceContext,
  getChapterStateSnapshot,
  getChapterTimeline,
  getLatestStateSnapshot,
  getNovelCharacterResources,
  getNovelPayoffLedger,
  getNovelQualityReport,
  getNovelVolumeWorkspace,
} from "@/api/novel";
import { getStoryModeTree, flattenStoryModeTreeOptions } from "@/api/storyMode";
import { getWorldList } from "@/api/world";
import { queryKeys } from "@/api/queryKeys";

export function useNovelEditQueries({
  id,
  selectedChapterId,
  shouldLoadQualityReport,
  shouldLoadVolumeWorkspace,
  shouldLoadLatestState,
  shouldLoadPayoffLedger,
  shouldLoadCharacterResources,
  shouldLoadChapterContext,
  shouldLoadChapterTimeline,
  chapters,
}: {
  id: string;
  selectedChapterId: string;
  shouldLoadQualityReport: boolean;
  shouldLoadVolumeWorkspace: boolean;
  shouldLoadLatestState: boolean;
  shouldLoadPayoffLedger: boolean;
  shouldLoadCharacterResources: boolean;
  shouldLoadChapterContext: boolean;
  shouldLoadChapterTimeline: boolean;
  chapters: Array<{ order: number }>;
}) {
  const qualityReportQuery = useQuery({ queryKey: queryKeys.novels.qualityReport(id), queryFn: () => getNovelQualityReport(id), enabled: Boolean(id && shouldLoadQualityReport) });
  const volumeWorkspaceQuery = useQuery({ queryKey: queryKeys.novels.volumeWorkspace(id), queryFn: () => getNovelVolumeWorkspace(id), enabled: Boolean(id && shouldLoadVolumeWorkspace) });
  const latestStateSnapshotQuery = useQuery({ queryKey: queryKeys.novels.latestStateSnapshot(id), queryFn: () => getLatestStateSnapshot(id), enabled: Boolean(id && shouldLoadLatestState) });
  const chapterStateSnapshotQuery = useQuery({ queryKey: queryKeys.novels.chapterStateSnapshot(id, selectedChapterId || "none"), queryFn: () => getChapterStateSnapshot(id, selectedChapterId), enabled: Boolean(id && selectedChapterId) });
  const payoffLedgerChapterOrder = useMemo(() => {
    const orders = chapters.map((chapter) => chapter.order);
    return orders.length > 0 ? Math.max(...orders) : undefined;
  }, [chapters]);
  const payoffLedgerQuery = useQuery({ queryKey: queryKeys.novels.payoffLedger(id, payoffLedgerChapterOrder), queryFn: () => getNovelPayoffLedger(id, payoffLedgerChapterOrder), enabled: Boolean(id && shouldLoadPayoffLedger) });
  const characterResourcesQuery = useQuery({ queryKey: queryKeys.novels.characterResources(id), queryFn: () => getNovelCharacterResources(id), enabled: Boolean(id && shouldLoadCharacterResources) });
  const chapterResourceContextQuery = useQuery({ queryKey: queryKeys.novels.characterResourceContext(id, selectedChapterId || "none"), queryFn: () => getChapterResourceContext(id, selectedChapterId), enabled: Boolean(id && shouldLoadChapterContext) });
  const chapterTimelineQuery = useQuery({ queryKey: queryKeys.novels.chapterTimeline(id, selectedChapterId || "none"), queryFn: () => getChapterTimeline(id, selectedChapterId), enabled: Boolean(id && shouldLoadChapterTimeline) });
  const chapterPlanQuery = useQuery({ queryKey: queryKeys.novels.chapterPlan(id, selectedChapterId || "none"), queryFn: () => getChapterPlan(id, selectedChapterId), enabled: Boolean(id && shouldLoadChapterContext) });
  const chapterAuditReportsQuery = useQuery({ queryKey: queryKeys.novels.chapterAuditReports(id, selectedChapterId || "none"), queryFn: () => getChapterAuditReports(id, selectedChapterId), enabled: Boolean(id && shouldLoadChapterContext) });
  const baseCharacterListQuery = useQuery({ queryKey: queryKeys.baseCharacters.all, queryFn: () => getBaseCharacterList() });
  const worldListQuery = useQuery({ queryKey: queryKeys.worlds.all, queryFn: getWorldList });
  const genreTreeQuery = useQuery({ queryKey: queryKeys.genres.all, queryFn: getGenreTree });
  const storyModeTreeQuery = useQuery({ queryKey: queryKeys.storyModes.all, queryFn: getStoryModeTree });
  const genreOptions = useMemo(() => flattenGenreTreeOptions(genreTreeQuery.data?.data ?? []), [genreTreeQuery.data?.data]);
  const storyModeOptions = useMemo(() => flattenStoryModeTreeOptions(storyModeTreeQuery.data?.data ?? []), [storyModeTreeQuery.data?.data]);
  return { qualityReportQuery, volumeWorkspaceQuery, latestStateSnapshotQuery, chapterStateSnapshotQuery, payoffLedgerChapterOrder, payoffLedgerQuery, characterResourcesQuery, chapterResourceContextQuery, chapterTimelineQuery, chapterPlanQuery, chapterAuditReportsQuery, baseCharacterListQuery, worldListQuery, genreTreeQuery, storyModeTreeQuery, genreOptions, storyModeOptions };
}
