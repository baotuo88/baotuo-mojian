import type { LLMSelectorValue } from "@/components/common/LLMSelector";
import { canCancelDirectorTask } from "@/lib/novelWorkflowTaskUi";
import type { NovelTaskDrawerState } from "../components/NovelEditView.types";
import {
  resolveNovelResourceProposalMutationState,
  resolveNovelTaskDrawerCapabilities,
  resolveNovelTaskDrawerRetryState,
} from "../novelEditRuntime.utils";

interface ProposalMutation {
  isPending: boolean;
  variables?: string;
  mutate: (proposalId: string) => void;
}

export function buildNovelTaskDrawerModel({
  open,
  setOpen,
  taskPanelOpen,
  clearTaskPanelOpen,
  task,
  snapshot,
  runtimeSnapshot,
  projection,
  currentUiModel,
  actions,
  onProjectionAction,
  followUp,
  onFollowUpAction,
  executingFollowUpAction,
  runtimeHardBlocked,
  runtimeBlockedReason,
  retryOverride,
  setRetryOverride,
  retryWithOverrideModelPending,
  retryWithTaskModelPending,
  retryWithOverrideModel,
  retryWithTaskModel,
  resourceProposals,
  setSelectedChapterId,
  setActiveTab,
  confirmProposalMutation,
  rejectProposalMutation,
  onOpenFullTaskCenter,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  taskPanelOpen: boolean;
  clearTaskPanelOpen: () => void;
  task: NovelTaskDrawerState["task"];
  snapshot: NovelTaskDrawerState["snapshot"];
  runtimeSnapshot: NovelTaskDrawerState["runtimeSnapshot"];
  projection: NovelTaskDrawerState["projection"];
  currentUiModel: NovelTaskDrawerState["currentUiModel"];
  actions: NovelTaskDrawerState["actions"];
  onProjectionAction: NovelTaskDrawerState["onProjectionAction"];
  followUp: NovelTaskDrawerState["followUp"];
  onFollowUpAction: NovelTaskDrawerState["onFollowUpAction"];
  executingFollowUpAction: boolean;
  runtimeHardBlocked: boolean;
  runtimeBlockedReason: string | null;
  retryOverride: LLMSelectorValue;
  setRetryOverride: (value: LLMSelectorValue) => void;
  retryWithOverrideModelPending: boolean;
  retryWithTaskModelPending: boolean;
  retryWithOverrideModel: () => void;
  retryWithTaskModel: () => void;
  resourceProposals: NovelTaskDrawerState["resourceProposals"];
  setSelectedChapterId: (chapterId: string) => void;
  setActiveTab: (tab: string) => void;
  confirmProposalMutation: ProposalMutation;
  rejectProposalMutation: ProposalMutation;
  onOpenFullTaskCenter: NovelTaskDrawerState["onOpenFullTaskCenter"];
}): NovelTaskDrawerState {
  return {
    open,
    onOpenChange: (nextOpen) => {
      setOpen(nextOpen);
      if (!nextOpen && taskPanelOpen) clearTaskPanelOpen();
    },
    task,
    snapshot,
    runtimeSnapshot,
    projection,
    currentUiModel,
    actions,
    onProjectionAction,
    followUp,
    onFollowUpAction,
    executingFollowUpAction,
    runtimeHardBlocked,
    runtimeBlockedReason,
    onOverrideModelChange: setRetryOverride,
    onRetryWithOverrideModel: retryWithOverrideModel,
    onRetryWithTaskModel: retryWithTaskModel,
    ...resolveNovelTaskDrawerRetryState({
      overrideModel: retryOverride,
      retryWithOverrideModelPending,
      retryWithTaskModelPending,
    }),
    capabilities: resolveNovelTaskDrawerCapabilities({
      hasTask: Boolean(task),
      taskStatus: task?.status,
      hasActions: actions.length > 0,
      hasFollowUps: Boolean(followUp),
      hasRuntimeSnapshot: Boolean(runtimeSnapshot),
      canCancel: Boolean(task && canCancelDirectorTask(task)),
    }),
    resourceProposals,
    onOpenResourceProposalSource: (proposal) => {
      if (proposal.chapterId) {
        setSelectedChapterId(proposal.chapterId);
        setActiveTab("chapter");
      } else {
        setActiveTab("character");
      }
      setOpen(false);
    },
    onConfirmResourceProposal: (proposalId) => confirmProposalMutation.mutate(proposalId),
    onRejectResourceProposal: (proposalId) => rejectProposalMutation.mutate(proposalId),
    ...resolveNovelResourceProposalMutationState({
      confirming: confirmProposalMutation.isPending,
      confirmingId: confirmProposalMutation.variables,
      rejecting: rejectProposalMutation.isPending,
      rejectingId: rejectProposalMutation.variables,
    }),
    onOpenFullTaskCenter,
  };
}
