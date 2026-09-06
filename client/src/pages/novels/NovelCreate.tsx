import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BOOK_ANALYSIS_SECTIONS } from "@ai-novel/shared/types/bookAnalysis";
import { flattenGenreTreeOptions, getGenreTree } from "@/api/genre";
import { bootstrapNovelWorkflow } from "@/api/novelWorkflow";
import { createNovelProject } from "@/api/novel";
import { queryKeys } from "@/api/queryKeys";
import { flattenStoryModeTreeOptions, getStoryModeTree } from "@/api/storyMode";
import { getWorldList } from "@/api/world";
import { Button } from "@/components/ui/button";
import NovelBasicInfoForm from "./components/basicInfoForm/NovelBasicInfoForm";
import NovelCreateResourceRecommendationCard from "./components/NovelCreateResourceRecommendationCard";
import { BookFramingQuickFillButton } from "./components/basicInfoForm/BookFramingQuickFillButton";
import NovelCreateTitleQuickFill from "./components/titleWorkshop/NovelCreateTitleQuickFill";
import { useNovelContinuationSources } from "./hooks/useNovelContinuationSources";
import {
  buildNovelCreatePayload,
  createDefaultNovelBasicFormState,
  patchNovelBasicForm,
} from "./novelBasicInfo.shared";

export default function NovelCreate() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [basicForm, setBasicForm] = useState(() => createDefaultNovelBasicFormState());

  const workflowTaskIdFromQuery = searchParams.get("workflowTaskId") ?? "";
  const workflowMode = searchParams.get("mode");
  const creationRequestId = searchParams.get("creationRequestId") ?? "";

  const worldListQuery = useQuery({
    queryKey: queryKeys.worlds.all,
    queryFn: getWorldList,
  });

  const genreTreeQuery = useQuery({
    queryKey: queryKeys.genres.all,
    queryFn: getGenreTree,
  });
  const genreOptions = flattenGenreTreeOptions(genreTreeQuery.data?.data ?? []);
  const storyModeTreeQuery = useQuery({
    queryKey: queryKeys.storyModes.all,
    queryFn: getStoryModeTree,
  });
  const storyModeOptions = flattenStoryModeTreeOptions(storyModeTreeQuery.data?.data ?? []);

  const {
    sourceBookAnalysesQuery,
    sourceNovelOptions,
    sourceKnowledgeOptions,
    sourceNovelBookAnalysisOptions,
  } = useNovelContinuationSources("", basicForm);

  useEffect(() => {
    if (
      basicForm.writingMode !== "continuation"
      || !basicForm.continuationBookAnalysisId
    ) {
      return;
    }
    if (sourceBookAnalysesQuery.isLoading || sourceBookAnalysesQuery.isFetching) {
      return;
    }
    const exists = sourceNovelBookAnalysisOptions.some((item) => item.id === basicForm.continuationBookAnalysisId);
    if (exists) {
      return;
    }
    setBasicForm((prev) => ({
      ...prev,
      continuationBookAnalysisId: "",
      continuationBookAnalysisSections: [],
    }));
  }, [
    basicForm.continuationBookAnalysisId,
    basicForm.writingMode,
    sourceBookAnalysesQuery.isFetching,
    sourceBookAnalysesQuery.isLoading,
    sourceNovelBookAnalysisOptions,
  ]);

  useEffect(() => {
    if (workflowMode !== "director") {
      return;
    }
    const params = new URLSearchParams();
    if (workflowTaskIdFromQuery) {
      params.set("taskId", workflowTaskIdFromQuery);
    }
    navigate(`/novels/auto-director${params.toString() ? `?${params.toString()}` : ""}`, { replace: true });
  }, [navigate, workflowMode, workflowTaskIdFromQuery]);

  const restoreWorkflowMutation = useMutation({
    mutationFn: () => bootstrapNovelWorkflow({
      workflowTaskId: workflowTaskIdFromQuery || undefined,
      lane: "manual_create",
    }),
    onSuccess: (response) => {
      const task = response.data;
      if (!task) {
        return;
      }
      const seedPayload = (task.meta.seedPayload ?? null) as { basicForm?: Partial<typeof basicForm> } | null;
      if (seedPayload?.basicForm) {
        setBasicForm((prev) => patchNovelBasicForm(prev, seedPayload.basicForm ?? {}));
      }
      if (task.id !== workflowTaskIdFromQuery) {
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.set("workflowTaskId", task.id);
          return next;
        }, { replace: true });
      }
    },
  });

  useEffect(() => {
    if (!workflowTaskIdFromQuery || workflowMode === "director") {
      return;
    }
    restoreWorkflowMutation.mutate();
  }, [workflowTaskIdFromQuery, workflowMode]);

  const createNovelMutation = useMutation({
    mutationFn: async () => {
      const requestId = creationRequestId || globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
      if (!creationRequestId) {
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.set("creationRequestId", requestId);
          return next;
        }, { replace: true });
      }
      const created = await createNovelProject({
        ...buildNovelCreatePayload(basicForm),
        creationRequestId: requestId,
      });
      return {
        response: { data: created.data?.novel ?? null },
        workflowTaskId: created.data?.task?.id ?? "",
      };
    },
    onSuccess: async ({ response, workflowTaskId }) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.all });
      if (response.data?.id) {
        const search = new URLSearchParams();
        search.set("stage", "basic");
        if (workflowTaskId) {
          search.set("workspaceTaskId", workflowTaskId);
        }
        navigate(`/novels/${response.data.id}/edit?${search.toString()}`);
      }
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "项目创建未完成。请检查网络后重试，已填写内容会保留在当前页面。";
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("creationError", message);
        return next;
      }, { replace: true });
    },
  });

  return (
    <div className="mx-auto max-w-5xl space-y-7 px-3 py-4 sm:px-4 lg:px-0">
      <section className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-3xl">
          <h1 className="text-3xl font-semibold tracking-normal text-foreground">创建小说项目</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            推荐先让 AI 自动导演从一句灵感整理方向、世界、角色和章节准备。需要完全手动填写时，也可以继续使用下方表单。
          </p>
        </div>
        <Button type="button" asChild className="shrink-0">
          <Link to="/novels/auto-director">AI 自动导演开书</Link>
        </Button>
      </section>

      {searchParams.get("creationError") ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">
          {searchParams.get("creationError")}
        </div>
      ) : null}

      <section className="space-y-4">
        <div>
          <div className="text-lg font-semibold leading-7 text-foreground">手动创建</div>
          <div className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            手动路径适合你已经清楚题材、卖点和前期承诺的项目；创建后仍可在工作台继续调整。
          </div>
        </div>
        <NovelBasicInfoForm
          basicForm={basicForm}
          genreOptions={genreOptions}
          storyModeOptions={storyModeOptions}
          worldOptions={worldListQuery.data?.data ?? []}
          sourceNovelOptions={sourceNovelOptions}
          sourceKnowledgeOptions={sourceKnowledgeOptions}
          sourceNovelBookAnalysisOptions={sourceNovelBookAnalysisOptions}
          isLoadingSourceNovelBookAnalyses={sourceBookAnalysesQuery.isLoading}
          availableBookAnalysisSections={[...BOOK_ANALYSIS_SECTIONS]}
          onFormChange={(patch) => setBasicForm((prev) => patchNovelBasicForm(prev, patch))}
          onSubmit={() => createNovelMutation.mutate()}
          isSubmitting={createNovelMutation.isPending}
          submitLabel="创建并进入项目"
          showPublicationStatus={false}
          framingQuickFill={(
            <BookFramingQuickFillButton
              basicForm={basicForm}
              genreOptions={genreOptions}
              onApplySuggestion={(patch) => setBasicForm((prev) => patchNovelBasicForm(prev, patch))}
            />
          )}
          resourceRecommendation={(
            <NovelCreateResourceRecommendationCard
              basicForm={basicForm}
              onApplySuggestion={(patch) => setBasicForm((prev) => patchNovelBasicForm(prev, patch))}
            />
          )}
          titleQuickFill={(
            <NovelCreateTitleQuickFill
              basicForm={basicForm}
              onApplyTitle={(title) => setBasicForm((prev) => patchNovelBasicForm(prev, { title }))}
            />
          )}
        />
      </section>
    </div>
  );
}
