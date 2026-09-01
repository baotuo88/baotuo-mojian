import type { ReactNode } from "react";
import type { DirectorBookAutomationProjection } from "@ai-novel/shared/types/directorRuntime";
import type { DirectorTakeoverEntryStep } from "@ai-novel/shared/types/novelDirector";
import type { UnifiedTaskDetail } from "@ai-novel/shared/types/task";
import type { NovelBasicFormState } from "../novelBasicInfo.shared";
import { resolveTakeoverDialogContextTaskId } from "../novelEditAutomationStatus";
import NovelExistingProjectTakeoverDialog from "../components/NovelExistingProjectTakeoverDialog";

export function NovelTakeoverEntry({
  step,
  variant = "default",
  novelId,
  directorTaskId,
  activeAutoDirectorTask,
  projection,
  basicForm,
  genreOptions,
  storyModeOptions,
  worldOptions,
}: {
  step: DirectorTakeoverEntryStep;
  variant?: "default" | "outline" | "secondary";
  novelId: string;
  directorTaskId: string;
  activeAutoDirectorTask: UnifiedTaskDetail | null;
  projection: DirectorBookAutomationProjection | null;
  basicForm: NovelBasicFormState;
  genreOptions: Array<{ id: string; path: string; label: string }>;
  storyModeOptions: Array<{ id: string; path: string; name: string }>;
  worldOptions: Array<{ id: string; name: string }>;
}): ReactNode {
  const workflowTaskId = resolveTakeoverDialogContextTaskId({ directorTaskId, activeAutoDirectorTask, projection });
  return (
    <NovelExistingProjectTakeoverDialog
      novelId={novelId}
      basicForm={basicForm}
      genreOptions={genreOptions}
      storyModeOptions={storyModeOptions}
      worldOptions={worldOptions}
      triggerVariant={variant}
      defaultEntryStep={step}
      workflowTaskId={workflowTaskId}
    />
  );
}
