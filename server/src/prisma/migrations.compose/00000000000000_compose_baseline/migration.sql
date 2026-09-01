-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ChapterGenerationState" AS ENUM ('planned', 'drafted', 'reviewed', 'repaired', 'approved', 'published');

-- CreateEnum
CREATE TYPE "PipelineJobStatus" AS ENUM ('queued', 'running', 'succeeded', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "BeatStatus" AS ENUM ('planned', 'completed', 'skipped');

-- CreateEnum
CREATE TYPE "FactCategory" AS ENUM ('world', 'character', 'timeline', 'plot', 'rule');

-- CreateEnum
CREATE TYPE "RagOwnerType" AS ENUM ('novel', 'chapter', 'world', 'character', 'bible', 'chapter_summary', 'consistency_fact', 'character_timeline', 'world_library_item', 'knowledge_document', 'chat_message');

-- CreateEnum
CREATE TYPE "RagJobType" AS ENUM ('upsert', 'delete', 'rebuild');

-- CreateEnum
CREATE TYPE "RagJobStatus" AS ENUM ('queued', 'running', 'succeeded', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "KnowledgeDocumentStatus" AS ENUM ('enabled', 'disabled', 'archived');

-- CreateEnum
CREATE TYPE "KnowledgeDocumentKind" AS ENUM ('user_upload', 'analysis_published');

-- CreateEnum
CREATE TYPE "KnowledgeIndexStatus" AS ENUM ('idle', 'queued', 'running', 'succeeded', 'failed');

-- CreateEnum
CREATE TYPE "KnowledgeBindingTargetType" AS ENUM ('novel', 'world');

-- CreateEnum
CREATE TYPE "BookAnalysisStatus" AS ENUM ('draft', 'queued', 'running', 'succeeded', 'failed', 'cancelled', 'archived');

-- CreateEnum
CREATE TYPE "BookAnalysisSectionStatus" AS ENUM ('idle', 'running', 'succeeded', 'failed');

-- CreateEnum
CREATE TYPE "ImageSceneType" AS ENUM ('character', 'novel_cover', 'chapter_illustration', 'book_analysis_character');

-- CreateEnum
CREATE TYPE "ProjectMode" AS ENUM ('ai_led', 'co_pilot', 'draft_mode', 'auto_pipeline');

-- CreateEnum
CREATE TYPE "CreationExperience" AS ENUM ('simple', 'professional');

-- CreateEnum
CREATE TYPE "NarrativePov" AS ENUM ('first_person', 'third_person', 'mixed');

-- CreateEnum
CREATE TYPE "PacePreference" AS ENUM ('slow', 'balanced', 'fast');

-- CreateEnum
CREATE TYPE "EmotionIntensity" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "AIFreedom" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "ProjectProgressStatus" AS ENUM ('not_started', 'in_progress', 'completed', 'rework', 'blocked');

-- CreateEnum
CREATE TYPE "StorylineVersionStatus" AS ENUM ('draft', 'active', 'frozen');

-- CreateEnum
CREATE TYPE "VolumePlanVersionStatus" AS ENUM ('draft', 'active', 'frozen');

-- CreateEnum
CREATE TYPE "ChapterStatus" AS ENUM ('unplanned', 'pending_generation', 'generating', 'pending_review', 'needs_repair', 'completed');

-- CreateEnum
CREATE TYPE "PipelineRunMode" AS ENUM ('fast', 'polish');

-- CreateEnum
CREATE TYPE "PipelineRepairMode" AS ENUM ('detect_only', 'light_repair', 'heavy_repair', 'continuity_only', 'character_only', 'ending_only');

-- CreateEnum
CREATE TYPE "AgentRunStatus" AS ENUM ('queued', 'running', 'waiting_approval', 'succeeded', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "NovelWorkflowLane" AS ENUM ('manual_create', 'auto_director', 'creation_studio');

-- CreateEnum
CREATE TYPE "NarrativeForm" AS ENUM ('short_story', 'long_novel');

-- CreateEnum
CREATE TYPE "NovelWorkflowTaskStatus" AS ENUM ('queued', 'running', 'waiting_approval', 'succeeded', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "AgentStepType" AS ENUM ('planning', 'tool_call', 'tool_result', 'reasoning', 'write', 'approval', 'answer');

-- CreateEnum
CREATE TYPE "AgentStepStatus" AS ENUM ('pending', 'running', 'succeeded', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "AgentApprovalStatus" AS ENUM ('pending', 'approved', 'rejected', 'expired');

-- CreateEnum
CREATE TYPE "CreativeHubThreadStatus" AS ENUM ('idle', 'busy', 'interrupted', 'error');

-- CreateEnum
CREATE TYPE "StoryPlanLevel" AS ENUM ('book', 'arc', 'chapter');

-- CreateEnum
CREATE TYPE "StoryPlanRole" AS ENUM ('setup', 'progress', 'pressure', 'turn', 'payoff', 'cooldown');

-- CreateEnum
CREATE TYPE "AuditType" AS ENUM ('continuity', 'character', 'plot', 'mode_fit');

-- CreateEnum
CREATE TYPE "AuditIssueStatus" AS ENUM ('open', 'resolved', 'ignored');

-- CreateEnum
CREATE TYPE "PayoffLedgerScopeType" AS ENUM ('book', 'volume', 'chapter');

-- CreateEnum
CREATE TYPE "PayoffLedgerStatus" AS ENUM ('setup', 'hinted', 'pending_payoff', 'paid_off', 'failed', 'overdue');

-- CreateEnum
CREATE TYPE "StyleBindingTargetType" AS ENUM ('novel', 'chapter', 'task');

-- CreateEnum
CREATE TYPE "AntiAiRuleType" AS ENUM ('forbidden', 'risk', 'encourage');

-- CreateEnum
CREATE TYPE "AntiAiSeverity" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "CharacterGender" AS ENUM ('male', 'female', 'other', 'unknown');

-- CreateTable
CREATE TABLE "Novel" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "targetAudience" TEXT,
    "bookSellingPoint" TEXT,
    "competingFeel" TEXT,
    "first30ChapterPromise" TEXT,
    "commercialTagsJson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "writingMode" TEXT NOT NULL DEFAULT 'original',
    "projectMode" "ProjectMode",
    "creationExperience" "CreationExperience" NOT NULL DEFAULT 'professional',
    "narrativeForm" "NarrativeForm" NOT NULL DEFAULT 'long_novel',
    "targetWordCount" INTEGER,
    "derivedFromNovelId" TEXT,
    "writingPlatform" TEXT,
    "writingPlatformProfileVersion" INTEGER,
    "writingPlatformSnapshotJson" TEXT,
    "directorIssuePolicyOverridesJson" TEXT,
    "directorRiskNoticeThreshold" INTEGER,
    "directorRiskPauseThreshold" INTEGER,
    "narrativePov" "NarrativePov",
    "pacePreference" "PacePreference",
    "styleTone" TEXT,
    "emotionIntensity" "EmotionIntensity",
    "aiFreedom" "AIFreedom",
    "postGenerationStyleReviewEnabled" BOOLEAN NOT NULL DEFAULT true,
    "defaultChapterLength" INTEGER,
    "estimatedChapterCount" INTEGER,
    "projectStatus" "ProjectProgressStatus" DEFAULT 'not_started',
    "storylineStatus" "ProjectProgressStatus" DEFAULT 'not_started',
    "outlineStatus" "ProjectProgressStatus" DEFAULT 'not_started',
    "resourceReadyScore" INTEGER,
    "sourceNovelId" TEXT,
    "sourceKnowledgeDocumentId" TEXT,
    "continuationBookAnalysisId" TEXT,
    "continuationBookAnalysisSections" TEXT,
    "outline" TEXT,
    "structuredOutline" TEXT,
    "storyWorldSliceJson" TEXT,
    "storyWorldSliceOverridesJson" TEXT,
    "storyWorldSliceSchemaVersion" INTEGER NOT NULL DEFAULT 1,
    "genreId" TEXT,
    "primaryStoryModeId" TEXT,
    "secondaryStoryModeId" TEXT,
    "worldId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Novel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NovelIntentVersion" (
    "id" TEXT NOT NULL,
    "novelId" TEXT,
    "workflowTaskId" TEXT NOT NULL,
    "previousVersionId" TEXT,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "source" TEXT NOT NULL DEFAULT 'initial',
    "originalExpression" TEXT NOT NULL,
    "structuredIntentJson" TEXT NOT NULL,
    "impactScopeJson" TEXT,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NovelIntentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreationStudioConfirmation" (
    "id" TEXT NOT NULL,
    "workflowTaskId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "narrativeForm" "NarrativeForm" NOT NULL,
    "novelId" TEXT,
    "productionTaskId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'claimed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreationStudioConfirmation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShortStoryPlan" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "intentVersionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'planning',
    "targetWordCount" INTEGER NOT NULL,
    "endingPromise" TEXT NOT NULL,
    "structureJson" TEXT NOT NULL,
    "qualityDebtJson" TEXT,
    "auditResultJson" TEXT,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShortStoryPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShortStorySegment" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "targetWordCount" INTEGER NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "version" INTEGER NOT NULL DEFAULT 1,
    "qualityResultJson" TEXT,
    "humanSnapshotJson" TEXT,
    "userEditedAt" TIMESTAMP(3),
    "generatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShortStorySegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromptAddendum" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "novelId" TEXT,
    "promptId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromptAddendum_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromptSlotOverride" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "novelId" TEXT,
    "promptId" TEXT NOT NULL,
    "baseVersion" TEXT NOT NULL,
    "slots" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromptSlotOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromptTemplateOverride" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'novel',
    "novelId" TEXT NOT NULL,
    "promptId" TEXT NOT NULL,
    "basePromptVersion" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'official',
    "activeVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromptTemplateOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromptTemplateVersion" (
    "id" TEXT NOT NULL,
    "overrideId" TEXT NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "templateJson" TEXT NOT NULL,
    "contextRefsJson" TEXT NOT NULL DEFAULT '{}',
    "compiledHash" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromptTemplateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WritingPlatformProfileOverride" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "activeVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WritingPlatformProfileOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WritingPlatformProfileVersion" (
    "id" TEXT NOT NULL,
    "overrideId" TEXT NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "profileJson" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WritingPlatformProfileVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreativeDecision" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "chapterId" TEXT,
    "category" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "importance" TEXT NOT NULL DEFAULT 'normal',
    "expiresAt" INTEGER,
    "sourceType" TEXT,
    "sourceRefId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreativeDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NovelSnapshot" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "label" TEXT,
    "snapshotData" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NovelSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chapter" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT DEFAULT '',
    "order" INTEGER NOT NULL,
    "generationState" "ChapterGenerationState" NOT NULL DEFAULT 'planned',
    "chapterStatus" "ChapterStatus" DEFAULT 'unplanned',
    "targetWordCount" INTEGER,
    "conflictLevel" INTEGER,
    "revealLevel" INTEGER,
    "mustAvoid" TEXT,
    "taskSheet" TEXT,
    "sceneCards" TEXT,
    "repairHistory" TEXT,
    "qualityScore" INTEGER,
    "continuityScore" INTEGER,
    "characterScore" INTEGER,
    "pacingScore" INTEGER,
    "riskFlags" TEXT,
    "hook" TEXT,
    "expectation" TEXT,
    "novelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Chapter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChapterArtifactSyncCheckpoint" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "artifactType" TEXT NOT NULL,
    "syncMode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'succeeded',
    "sourceType" TEXT,
    "sourceStage" TEXT,
    "metadataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChapterArtifactSyncCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Character" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "gender" "CharacterGender" NOT NULL DEFAULT 'unknown',
    "castRole" TEXT,
    "storyFunction" TEXT,
    "relationToProtagonist" TEXT,
    "personality" TEXT,
    "background" TEXT,
    "development" TEXT,
    "identityLabel" TEXT,
    "factionLabel" TEXT,
    "stanceLabel" TEXT,
    "powerLevel" TEXT,
    "realm" TEXT,
    "currentLocation" TEXT,
    "availability" TEXT,
    "prohibitionsJson" TEXT NOT NULL DEFAULT '[]',
    "outerGoal" TEXT,
    "innerNeed" TEXT,
    "fear" TEXT,
    "wound" TEXT,
    "misbelief" TEXT,
    "secret" TEXT,
    "moralLine" TEXT,
    "firstImpression" TEXT,
    "appearance" TEXT,
    "physique" TEXT,
    "attireStyle" TEXT,
    "signatureDetail" TEXT,
    "voiceTexture" TEXT,
    "presenceImpression" TEXT,
    "arcStart" TEXT,
    "arcMidpoint" TEXT,
    "arcClimax" TEXT,
    "arcEnd" TEXT,
    "currentState" TEXT,
    "currentGoal" TEXT,
    "lastEvolvedAt" TIMESTAMP(3),
    "novelId" TEXT NOT NULL,
    "baseCharacterId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Character_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterMindSnapshot" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "sourceChapterId" TEXT,
    "sourceType" TEXT NOT NULL,
    "currentInterpretation" TEXT NOT NULL,
    "privateIntent" TEXT,
    "activePlan" TEXT,
    "emotionalStance" TEXT,
    "actionTendency" TEXT,
    "decisionTrigger" TEXT,
    "beliefsJson" TEXT NOT NULL DEFAULT '[]',
    "misbeliefsJson" TEXT NOT NULL DEFAULT '[]',
    "evidenceJson" TEXT NOT NULL DEFAULT '[]',
    "confidence" DOUBLE PRECISION,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterMindSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterInfluenceProposal" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "proposalSetId" TEXT NOT NULL,
    "sourceMindSnapshotId" TEXT,
    "title" TEXT NOT NULL,
    "directionSummary" TEXT NOT NULL,
    "recommendationReason" TEXT NOT NULL,
    "isRecommended" BOOLEAN NOT NULL DEFAULT false,
    "behaviorGuidance" TEXT NOT NULL,
    "emotionalGuidance" TEXT,
    "relationTension" TEXT,
    "readerPayoff" TEXT NOT NULL,
    "risk" TEXT NOT NULL,
    "observableSignalsJson" TEXT NOT NULL DEFAULT '[]',
    "evidenceJson" TEXT NOT NULL DEFAULT '[]',
    "confidence" DOUBLE PRECISION,
    "authorIntent" TEXT,
    "targetStartChapterOrder" INTEGER NOT NULL,
    "targetEndChapterOrder" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "acceptedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "resolvedChapterId" TEXT,
    "resolutionEvidenceJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterInfluenceProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterDialogueSession" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "sourceMindSnapshotId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterDialogueSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterDialogueTurn" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CharacterDialogueTurn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterDialogueInfluence" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "sessionId" TEXT,
    "conversationSessionId" TEXT,
    "sourceMindSnapshotId" TEXT,
    "summary" TEXT NOT NULL,
    "behaviorGuidance" TEXT NOT NULL,
    "emotionalGuidance" TEXT,
    "relationTension" TEXT,
    "evidenceJson" TEXT NOT NULL DEFAULT '[]',
    "confidence" DOUBLE PRECISION,
    "targetStartChapterOrder" INTEGER NOT NULL,
    "targetEndChapterOrder" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "activatedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "resolvedChapterId" TEXT,
    "resolutionEvidenceJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterDialogueInfluence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterConversationSession" (
    "id" TEXT NOT NULL,
    "subjectKind" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "scopeKind" TEXT NOT NULL,
    "scopeId" TEXT,
    "interactionPolicy" TEXT NOT NULL,
    "chapterAnchor" INTEGER,
    "sourceSnapshotJson" TEXT NOT NULL DEFAULT '{}',
    "evidenceBoundaryJson" TEXT NOT NULL DEFAULT '[]',
    "legacyDialogueSessionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterConversationSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterConversationTurn" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "evidenceJson" TEXT NOT NULL DEFAULT '[]',
    "uncertainty" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CharacterConversationTurn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterRelation" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "sourceCharacterId" TEXT NOT NULL,
    "targetCharacterId" TEXT NOT NULL,
    "surfaceRelation" TEXT NOT NULL,
    "hiddenTension" TEXT,
    "conflictSource" TEXT,
    "secretAsymmetry" TEXT,
    "dynamicLabel" TEXT,
    "nextTurnPoint" TEXT,
    "trustScore" INTEGER,
    "conflictScore" INTEGER,
    "intimacyScore" INTEGER,
    "dependencyScore" INTEGER,
    "evidence" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterCastOption" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "whyItWorks" TEXT,
    "recommendedReason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "sourceStoryInput" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterCastOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterCastOptionMember" (
    "id" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "gender" "CharacterGender" NOT NULL DEFAULT 'unknown',
    "castRole" TEXT NOT NULL,
    "relationToProtagonist" TEXT,
    "storyFunction" TEXT NOT NULL,
    "shortDescription" TEXT,
    "personality" TEXT,
    "background" TEXT,
    "development" TEXT,
    "identityLabel" TEXT,
    "factionLabel" TEXT,
    "stanceLabel" TEXT,
    "powerLevel" TEXT,
    "realm" TEXT,
    "currentLocation" TEXT,
    "availability" TEXT,
    "prohibitionsJson" TEXT NOT NULL DEFAULT '[]',
    "outerGoal" TEXT,
    "innerNeed" TEXT,
    "fear" TEXT,
    "wound" TEXT,
    "misbelief" TEXT,
    "secret" TEXT,
    "moralLine" TEXT,
    "firstImpression" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterCastOptionMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterCastOptionRelation" (
    "id" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "sourceName" TEXT NOT NULL,
    "targetName" TEXT NOT NULL,
    "surfaceRelation" TEXT NOT NULL,
    "hiddenTension" TEXT,
    "conflictSource" TEXT,
    "secretAsymmetry" TEXT,
    "dynamicLabel" TEXT,
    "nextTurnPoint" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterCastOptionRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterTimeline" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "chapterId" TEXT,
    "chapterOrder" INTEGER,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'auto',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterTimeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterCandidate" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "sourceChapterId" TEXT,
    "proposedName" TEXT NOT NULL,
    "proposedRole" TEXT,
    "summary" TEXT,
    "evidenceJson" TEXT,
    "matchedCharacterId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterVolumeAssignment" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "volumeId" TEXT NOT NULL,
    "roleLabel" TEXT,
    "responsibility" TEXT NOT NULL,
    "appearanceExpectation" TEXT,
    "plannedChapterOrdersJson" TEXT,
    "isCore" BOOLEAN NOT NULL DEFAULT false,
    "absenceWarningThreshold" INTEGER NOT NULL DEFAULT 3,
    "absenceHighRiskThreshold" INTEGER NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterVolumeAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterFactionTrack" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "volumeId" TEXT,
    "chapterId" TEXT,
    "chapterOrder" INTEGER,
    "factionLabel" TEXT NOT NULL,
    "stanceLabel" TEXT,
    "summary" TEXT,
    "sourceType" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterFactionTrack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterRelationStage" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "relationId" TEXT,
    "sourceCharacterId" TEXT NOT NULL,
    "targetCharacterId" TEXT NOT NULL,
    "volumeId" TEXT,
    "chapterId" TEXT,
    "chapterOrder" INTEGER,
    "stageLabel" TEXT NOT NULL,
    "stageSummary" TEXT NOT NULL,
    "nextTurnPoint" TEXT,
    "sourceType" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterRelationStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BaseCharacter" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "personality" TEXT NOT NULL,
    "background" TEXT NOT NULL,
    "development" TEXT NOT NULL,
    "appearance" TEXT,
    "weaknesses" TEXT,
    "interests" TEXT,
    "keyEvents" TEXT,
    "tags" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'manual',
    "sourceRefId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BaseCharacter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BaseCharacterRevision" (
    "id" TEXT NOT NULL,
    "baseCharacterId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshotJson" TEXT NOT NULL,
    "changeSummary" TEXT,
    "sourceType" TEXT NOT NULL DEFAULT 'manual',
    "sourceRefId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BaseCharacterRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterLibraryLink" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "baseCharacterId" TEXT NOT NULL,
    "baseRevisionId" TEXT,
    "syncPolicy" TEXT NOT NULL DEFAULT 'manual_review',
    "linkStatus" TEXT NOT NULL DEFAULT 'linked',
    "localOverridesJson" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterLibraryLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterSyncProposal" (
    "id" TEXT NOT NULL,
    "novelId" TEXT,
    "characterId" TEXT,
    "baseCharacterId" TEXT,
    "baseRevisionId" TEXT,
    "direction" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending_review',
    "confidence" DOUBLE PRECISION,
    "summary" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "safeUpdatesJson" TEXT,
    "novelOnlyUpdatesJson" TEXT,
    "riskyUpdatesJson" TEXT,
    "recommendedAction" TEXT,
    "sourceType" TEXT NOT NULL DEFAULT 'manual',
    "sourceRefId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterSyncProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImageGenerationTask" (
    "id" TEXT NOT NULL,
    "sceneType" "ImageSceneType" NOT NULL DEFAULT 'character',
    "baseCharacterId" TEXT,
    "novelId" TEXT,
    "bookAnalysisCharacterId" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "negativePrompt" TEXT,
    "stylePreset" TEXT,
    "referenceImageAssetIdsJson" TEXT,
    "size" TEXT NOT NULL DEFAULT '1024x1024',
    "imageCount" INTEGER NOT NULL DEFAULT 1,
    "seed" INTEGER,
    "status" "PipelineJobStatus" NOT NULL DEFAULT 'queued',
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 2,
    "pendingManualRecovery" BOOLEAN NOT NULL DEFAULT false,
    "heartbeatAt" TIMESTAMP(3),
    "currentStage" TEXT,
    "currentItemKey" TEXT,
    "currentItemLabel" TEXT,
    "cancelRequestedAt" TIMESTAMP(3),
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImageGenerationTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StyleExtractionTask" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "sourceText" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'from_text',
    "sourceRefId" TEXT,
    "sourceProcessingMode" TEXT NOT NULL DEFAULT 'full_text',
    "sourceInputText" TEXT,
    "sourceInputCharLimit" INTEGER,
    "sourceInputCharCount" INTEGER,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "temperature" DOUBLE PRECISION,
    "presetKey" TEXT NOT NULL DEFAULT 'balanced',
    "status" "PipelineJobStatus" NOT NULL DEFAULT 'queued',
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 1,
    "pendingManualRecovery" BOOLEAN NOT NULL DEFAULT false,
    "heartbeatAt" TIMESTAMP(3),
    "currentStage" TEXT,
    "currentItemKey" TEXT,
    "currentItemLabel" TEXT,
    "cancelRequestedAt" TIMESTAMP(3),
    "error" TEXT,
    "summary" TEXT,
    "createdStyleProfileId" TEXT,
    "createdStyleProfileName" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "llmCallCount" INTEGER NOT NULL DEFAULT 0,
    "lastTokenRecordedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StyleExtractionTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImageAsset" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "sceneType" "ImageSceneType" NOT NULL DEFAULT 'character',
    "baseCharacterId" TEXT,
    "novelId" TEXT,
    "bookAnalysisCharacterId" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mimeType" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "seed" INTEGER,
    "prompt" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImageAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisualAssetProjection" (
    "id" TEXT NOT NULL,
    "sourceDomain" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceVersion" TEXT NOT NULL DEFAULT 'current',
    "sourceLabel" TEXT NOT NULL,
    "scopeKind" TEXT NOT NULL DEFAULT 'global',
    "scopeId" TEXT,
    "scopeLabel" TEXT,
    "kind" TEXT NOT NULL,
    "origin" TEXT NOT NULL DEFAULT 'generated',
    "url" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "mimeType" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "prompt" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "metadata" TEXT,
    "sourceCreatedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisualAssetProjection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NovelGenre" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "template" TEXT,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NovelGenre_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NovelStoryMode" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "template" TEXT,
    "profileJson" TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NovelStoryMode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "World" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "worldType" TEXT,
    "templateKey" TEXT,
    "axioms" TEXT,
    "background" TEXT,
    "geography" TEXT,
    "cultures" TEXT,
    "magicSystem" TEXT,
    "politics" TEXT,
    "races" TEXT,
    "religions" TEXT,
    "technology" TEXT,
    "conflicts" TEXT,
    "history" TEXT,
    "economy" TEXT,
    "factions" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 1,
    "selectedDimensions" TEXT,
    "selectedElements" TEXT,
    "layerStates" TEXT,
    "consistencyReport" TEXT,
    "overviewSummary" TEXT,
    "structureJson" TEXT,
    "bindingSupportJson" TEXT,
    "structureSchemaVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "World_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NovelWorld" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "sourceWorldId" TEXT,
    "sourceType" TEXT NOT NULL DEFAULT 'manual',
    "title" TEXT,
    "coverSummary" TEXT,
    "structuredDataJson" TEXT,
    "bindingContractJson" TEXT,
    "storySliceJson" TEXT,
    "storySliceOverridesJson" TEXT,
    "storySliceSchemaVersion" INTEGER NOT NULL DEFAULT 1,
    "storySliceBuiltAt" TIMESTAMP(3),
    "storySliceDigest" TEXT,
    "syncEnabled" BOOLEAN NOT NULL DEFAULT false,
    "syncDirection" TEXT NOT NULL DEFAULT 'none',
    "syncBaseVersion" INTEGER,
    "syncPendingChangesJson" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "generationPolicyJson" TEXT,
    "generatedFromThemeJson" TEXT,
    "savedToLibraryAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NovelWorld_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorldSyncRecord" (
    "id" TEXT NOT NULL,
    "novelWorldId" TEXT NOT NULL,
    "sourceWorldId" TEXT,
    "direction" TEXT NOT NULL,
    "syncedFieldsJson" TEXT,
    "diffSummary" TEXT,
    "triggeredBy" TEXT NOT NULL DEFAULT 'user',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorldSyncRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorldAsset" (
    "id" TEXT NOT NULL,
    "worldId" TEXT,
    "novelWorldId" TEXT,
    "assetType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "generationPrompt" TEXT,
    "renderDataJson" TEXT,
    "thumbnailUrl" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'placeholder',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorldAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorldPropertyLibrary" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "worldType" TEXT,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "sourceWorldId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorldPropertyLibrary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorldSnapshot" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "label" TEXT,
    "data" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorldSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorldDeepeningQA" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'recommended',
    "question" TEXT NOT NULL,
    "targetLayer" TEXT,
    "targetField" TEXT,
    "answer" TEXT,
    "integratedSummary" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorldDeepeningQA_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorldConsistencyIssue" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "detail" TEXT,
    "source" TEXT NOT NULL DEFAULT 'rule',
    "status" TEXT NOT NULL DEFAULT 'open',
    "targetField" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorldConsistencyIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WritingFormula" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceText" TEXT,
    "content" TEXT,
    "genre" TEXT,
    "style" TEXT,
    "toneVoice" TEXT,
    "structure" TEXT,
    "pacing" TEXT,
    "paragraphPattern" TEXT,
    "sentenceStructure" TEXT,
    "vocabularyLevel" TEXT,
    "rhetoricalDevices" TEXT,
    "narrativeMode" TEXT,
    "perspectivePoint" TEXT,
    "characterVoice" TEXT,
    "themes" TEXT,
    "motifs" TEXT,
    "emotionalTone" TEXT,
    "uniqueFeatures" TEXT,
    "formulaDescription" TEXT,
    "formulaSteps" TEXT,
    "applicationTips" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WritingFormula_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StyleProfile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "tagsJson" TEXT,
    "applicableGenresJson" TEXT,
    "sourceType" TEXT NOT NULL,
    "sourceRefId" TEXT,
    "sourceContent" TEXT,
    "extractedFeaturesJson" TEXT,
    "extractionPresetsJson" TEXT,
    "extractionAntiAiRuleKeysJson" TEXT,
    "selectedExtractionPresetKey" TEXT,
    "analysisMarkdown" TEXT,
    "narrativeRulesJson" TEXT,
    "characterRulesJson" TEXT,
    "languageRulesJson" TEXT,
    "rhythmRulesJson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StyleProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StyleTemplate" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "tagsJson" TEXT,
    "applicableGenresJson" TEXT,
    "analysisMarkdown" TEXT,
    "narrativeRulesJson" TEXT,
    "characterRulesJson" TEXT,
    "languageRulesJson" TEXT,
    "rhythmRulesJson" TEXT,
    "defaultAntiAiRuleKeysJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StyleTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AntiAiRule" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AntiAiRuleType" NOT NULL,
    "severity" "AntiAiSeverity" NOT NULL,
    "description" TEXT NOT NULL,
    "detectPatternsJson" TEXT,
    "rewriteSuggestion" TEXT,
    "promptInstruction" TEXT,
    "autoRewrite" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "globalBaselineEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AntiAiRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StyleProfileAntiAiRule" (
    "id" TEXT NOT NULL,
    "styleProfileId" TEXT NOT NULL,
    "antiAiRuleId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StyleProfileAntiAiRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StyleBinding" (
    "id" TEXT NOT NULL,
    "styleProfileId" TEXT NOT NULL,
    "targetType" "StyleBindingTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StyleBinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TitleLibrary" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "clickRate" DOUBLE PRECISION,
    "keywords" TEXT,
    "genreId" TEXT,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TitleLibrary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "APIKey" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "displayName" TEXT,
    "key" TEXT,
    "model" TEXT,
    "baseURL" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "reasoningEnabled" BOOLEAN NOT NULL DEFAULT true,
    "concurrencyLimit" INTEGER NOT NULL DEFAULT 0,
    "requestIntervalMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "APIKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ModelRouteConfig" (
    "id" TEXT NOT NULL,
    "taskType" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "maxTokens" INTEGER,
    "requestProtocol" TEXT NOT NULL DEFAULT 'auto',
    "structuredResponseFormat" TEXT NOT NULL DEFAULT 'auto',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelRouteConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NovelBible" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "coreSetting" TEXT,
    "forbiddenRules" TEXT,
    "mainPromise" TEXT,
    "characterArcs" TEXT,
    "worldRules" TEXT,
    "rawContent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NovelBible_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlotBeat" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "chapterOrder" INTEGER,
    "beatType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" "BeatStatus" NOT NULL DEFAULT 'planned',
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlotBeat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChapterSummary" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "keyEvents" TEXT,
    "characterStates" TEXT,
    "hook" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChapterSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsistencyFact" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "chapterId" TEXT,
    "category" "FactCategory" NOT NULL DEFAULT 'plot',
    "content" TEXT NOT NULL,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsistencyFact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GenerationJob" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "startOrder" INTEGER NOT NULL,
    "endOrder" INTEGER NOT NULL,
    "runMode" "PipelineRunMode" DEFAULT 'fast',
    "autoReview" BOOLEAN NOT NULL DEFAULT true,
    "autoRepair" BOOLEAN NOT NULL DEFAULT true,
    "skipCompleted" BOOLEAN NOT NULL DEFAULT true,
    "qualityThreshold" INTEGER,
    "repairMode" "PipelineRepairMode" DEFAULT 'light_repair',
    "status" "PipelineJobStatus" NOT NULL DEFAULT 'queued',
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "completedCount" INTEGER NOT NULL DEFAULT 0,
    "totalCount" INTEGER NOT NULL DEFAULT 0,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 2,
    "pendingManualRecovery" BOOLEAN NOT NULL DEFAULT false,
    "heartbeatAt" TIMESTAMP(3),
    "currentStage" TEXT,
    "currentItemKey" TEXT,
    "currentItemLabel" TEXT,
    "cancelRequestedAt" TIMESTAMP(3),
    "error" TEXT,
    "lastErrorType" TEXT,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "llmCallCount" INTEGER NOT NULL DEFAULT 0,
    "lastTokenRecordedAt" TIMESTAMP(3),
    "payload" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GenerationJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "novelId" TEXT,
    "chapterId" TEXT,
    "sessionId" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "entryAgent" TEXT NOT NULL,
    "status" "AgentRunStatus" NOT NULL DEFAULT 'queued',
    "currentStep" TEXT,
    "currentAgent" TEXT,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "metadataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentStep" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "agentName" TEXT NOT NULL,
    "stepType" "AgentStepType" NOT NULL,
    "status" "AgentStepStatus" NOT NULL DEFAULT 'succeeded',
    "parentStepId" TEXT,
    "idempotencyKey" TEXT,
    "inputJson" TEXT,
    "outputJson" TEXT,
    "error" TEXT,
    "errorCode" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "tokenUsageJson" TEXT,
    "costUsd" DOUBLE PRECISION,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentApproval" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "stepId" TEXT,
    "approvalType" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "diffSummary" TEXT NOT NULL,
    "status" "AgentApprovalStatus" NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "decider" TEXT,
    "decidedAt" TIMESTAMP(3),
    "payloadJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreativeHubThread" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '新对话',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "status" "CreativeHubThreadStatus" NOT NULL DEFAULT 'idle',
    "latestRunId" TEXT,
    "latestError" TEXT,
    "resourceBindingsJson" TEXT,
    "metadataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreativeHubThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreativeHubCheckpoint" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "checkpointId" TEXT NOT NULL,
    "parentCheckpointId" TEXT,
    "runId" TEXT,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "preview" TEXT,
    "messagesJson" TEXT NOT NULL,
    "interruptsJson" TEXT,
    "metadataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreativeHubCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorylineVersion" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "StorylineVersionStatus" NOT NULL DEFAULT 'draft',
    "content" TEXT NOT NULL,
    "diffSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorylineVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VolumePlanVersion" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "VolumePlanVersionStatus" NOT NULL DEFAULT 'draft',
    "contentJson" TEXT NOT NULL,
    "diffSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VolumePlanVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VolumePlan" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "mainPromise" TEXT,
    "escalationMode" TEXT,
    "protagonistChange" TEXT,
    "climax" TEXT,
    "nextVolumeHook" TEXT,
    "resetPoint" TEXT,
    "openPayoffsJson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "sourceVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VolumePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VolumeChapterPlan" (
    "id" TEXT NOT NULL,
    "volumeId" TEXT NOT NULL,
    "chapterId" TEXT,
    "chapterOrder" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "purpose" TEXT,
    "conflictLevel" INTEGER,
    "conflictLevelSource" TEXT,
    "revealLevel" INTEGER,
    "targetWordCount" INTEGER,
    "mustAvoid" TEXT,
    "taskSheet" TEXT,
    "sceneCards" TEXT,
    "payoffRefsJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VolumeChapterPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QualityReport" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "chapterId" TEXT,
    "coherence" INTEGER NOT NULL,
    "repetition" INTEGER NOT NULL,
    "pacing" INTEGER NOT NULL,
    "voice" INTEGER NOT NULL,
    "engagement" INTEGER NOT NULL,
    "overall" INTEGER NOT NULL,
    "issues" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QualityReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryMacroPlan" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "storyInput" TEXT,
    "expansionJson" TEXT,
    "decompositionJson" TEXT,
    "issuesJson" TEXT,
    "lockedFieldsJson" TEXT,
    "constraintEngineJson" TEXT,
    "stateJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoryMacroPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookContract" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "readingPromise" TEXT NOT NULL,
    "protagonistFantasy" TEXT NOT NULL,
    "coreSellingPoint" TEXT NOT NULL,
    "chapter3Payoff" TEXT NOT NULL,
    "chapter10Payoff" TEXT NOT NULL,
    "chapter30Payoff" TEXT NOT NULL,
    "escalationLadder" TEXT NOT NULL,
    "relationshipMainline" TEXT NOT NULL,
    "absoluteRedLinesJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NovelWorkflowTask" (
    "id" TEXT NOT NULL,
    "novelId" TEXT,
    "lane" "NovelWorkflowLane" NOT NULL,
    "title" TEXT NOT NULL,
    "status" "NovelWorkflowTaskStatus" NOT NULL DEFAULT 'queued',
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentStage" TEXT,
    "currentItemKey" TEXT,
    "currentItemLabel" TEXT,
    "checkpointType" TEXT,
    "checkpointSummary" TEXT,
    "resumeTargetJson" TEXT,
    "seedPayloadJson" TEXT,
    "milestonesJson" TEXT,
    "pendingManualRecovery" BOOLEAN NOT NULL DEFAULT false,
    "heartbeatAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "cancelRequestedAt" TIMESTAMP(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "lastError" TEXT,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "llmCallCount" INTEGER NOT NULL DEFAULT 0,
    "lastTokenRecordedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NovelWorkflowTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DirectorRunCommand" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "novelId" TEXT,
    "commandType" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "leaseOwner" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payloadJson" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DirectorRunCommand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DirectorRuntimeInstance" (
    "id" TEXT NOT NULL,
    "novelId" TEXT,
    "workflowTaskId" TEXT,
    "runId" TEXT,
    "runMode" TEXT,
    "status" TEXT NOT NULL DEFAULT 'waiting_worker',
    "currentStep" TEXT,
    "currentChapterId" TEXT,
    "checkpointVersion" INTEGER NOT NULL DEFAULT 0,
    "cancelRequestedAt" TIMESTAMP(3),
    "lastHeartbeatAt" TIMESTAMP(3),
    "lastErrorClass" TEXT,
    "lastErrorMessage" TEXT,
    "workerMessage" TEXT,
    "metadataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DirectorRuntimeInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DirectorRuntimeCommand" (
    "id" TEXT NOT NULL,
    "runtimeId" TEXT NOT NULL,
    "workflowTaskId" TEXT,
    "novelId" TEXT,
    "legacyCommandId" TEXT,
    "commandType" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "priority" INTEGER NOT NULL DEFAULT 50,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseOwner" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "payloadJson" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DirectorRuntimeCommand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DirectorRuntimeExecution" (
    "id" TEXT NOT NULL,
    "runtimeId" TEXT NOT NULL,
    "commandId" TEXT,
    "workflowTaskId" TEXT,
    "novelId" TEXT,
    "legacyCommandId" TEXT,
    "activeLockKey" TEXT,
    "workerId" TEXT,
    "slotId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'leased',
    "stepType" TEXT NOT NULL,
    "resourceClass" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "heartbeatAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "errorClass" TEXT,
    "errorMessage" TEXT,
    "inputHash" TEXT,
    "checkpointVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DirectorRuntimeExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DirectorRuntimeCheckpoint" (
    "id" TEXT NOT NULL,
    "runtimeId" TEXT NOT NULL,
    "commandId" TEXT,
    "executionId" TEXT,
    "version" INTEGER NOT NULL,
    "stepType" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "inputHash" TEXT,
    "outputRefJson" TEXT,
    "stateJson" TEXT,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DirectorRuntimeCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DirectorRuntimeEvent" (
    "id" TEXT NOT NULL,
    "runtimeId" TEXT NOT NULL,
    "commandId" TEXT,
    "executionId" TEXT,
    "workflowTaskId" TEXT,
    "novelId" TEXT,
    "type" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "severity" TEXT,
    "metadataJson" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DirectorRuntimeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DirectorRun" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "novelId" TEXT,
    "entrypoint" TEXT,
    "policyJson" TEXT NOT NULL,
    "lastWorkspaceAnalysisJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DirectorRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DirectorStepRun" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "novelId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "nodeKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "error" TEXT,
    "producedArtifactsJson" TEXT,
    "policyDecisionJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DirectorStepRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DirectorLlmUsageRecord" (
    "id" TEXT NOT NULL,
    "novelId" TEXT,
    "taskId" TEXT,
    "runId" TEXT,
    "stepIdempotencyKey" TEXT,
    "nodeKey" TEXT,
    "promptAssetKey" TEXT,
    "promptVersion" TEXT,
    "modelRoute" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "status" TEXT NOT NULL DEFAULT 'recorded',
    "attributionStatus" TEXT NOT NULL DEFAULT 'unattributed',
    "durationMs" INTEGER,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "metadataJson" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DirectorLlmUsageRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DirectorEvent" (
    "id" TEXT NOT NULL,
    "runId" TEXT,
    "taskId" TEXT,
    "novelId" TEXT,
    "type" TEXT NOT NULL,
    "nodeKey" TEXT,
    "artifactId" TEXT,
    "artifactType" TEXT,
    "summary" TEXT NOT NULL,
    "affectedScope" TEXT,
    "severity" TEXT,
    "metadataJson" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DirectorEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DirectorArtifact" (
    "id" TEXT NOT NULL,
    "runId" TEXT,
    "novelId" TEXT NOT NULL,
    "taskId" TEXT,
    "artifactType" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "contentTable" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "contentHash" TEXT,
    "schemaVersion" TEXT NOT NULL,
    "promptAssetKey" TEXT,
    "promptVersion" TEXT,
    "modelRoute" TEXT,
    "sourceStepRunId" TEXT,
    "protectedUserContent" BOOLEAN,
    "artifactUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DirectorArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DirectorArtifactDependency" (
    "id" TEXT NOT NULL,
    "artifactId" TEXT NOT NULL,
    "dependsOnArtifactId" TEXT NOT NULL,
    "dependsOnVersion" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DirectorArtifactDependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoDirectorAutoApprovalRecord" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "approvalPointCode" TEXT NOT NULL,
    "approvalPointLabel" TEXT NOT NULL,
    "checkpointType" TEXT NOT NULL,
    "checkpointSummary" TEXT,
    "summary" TEXT NOT NULL,
    "stage" TEXT,
    "scopeLabel" TEXT,
    "eventId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutoDirectorAutoApprovalRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoDirectorFollowUpActionLog" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "actionCode" TEXT NOT NULL,
    "sourceChannel" TEXT NOT NULL,
    "sourceUser" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "resultCode" TEXT NOT NULL,
    "failureReason" TEXT,
    "metadataJson" TEXT,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutoDirectorFollowUpActionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoDirectorFollowUpNotificationLog" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "channelType" TEXT NOT NULL,
    "target" TEXT,
    "requestPayload" TEXT,
    "responseBody" TEXT,
    "responseStatus" INTEGER,
    "attemptCount" INTEGER NOT NULL DEFAULT 1,
    "deliveredAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoDirectorFollowUpNotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryStateSnapshot" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "sourceChapterId" TEXT,
    "summary" TEXT,
    "rawStateJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoryStateSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryStateSnapshotArchive" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "sourceChapterId" TEXT,
    "sourceChapterOrder" INTEGER,
    "summary" TEXT,
    "snapshotJson" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoryStateSnapshotArchive_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterState" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "currentGoal" TEXT,
    "emotion" TEXT,
    "stressLevel" INTEGER,
    "secretExposure" TEXT,
    "knownFactsJson" TEXT,
    "misbeliefsJson" TEXT,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RelationState" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "sourceCharacterId" TEXT NOT NULL,
    "targetCharacterId" TEXT NOT NULL,
    "trustScore" INTEGER,
    "intimacyScore" INTEGER,
    "conflictScore" INTEGER,
    "dependencyScore" INTEGER,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RelationState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InformationState" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "holderType" TEXT NOT NULL,
    "holderRefId" TEXT,
    "fact" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InformationState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForeshadowState" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "status" TEXT NOT NULL,
    "setupChapterId" TEXT,
    "payoffChapterId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ForeshadowState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpenConflict" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "chapterId" TEXT,
    "sourceSnapshotId" TEXT,
    "sourceIssueId" TEXT,
    "sourceType" TEXT NOT NULL,
    "conflictType" TEXT NOT NULL,
    "conflictKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'open',
    "evidenceJson" TEXT,
    "affectedCharacterIdsJson" TEXT,
    "resolutionHint" TEXT,
    "lastSeenChapterOrder" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpenConflict_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayoffLedgerItem" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "ledgerKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "scopeType" "PayoffLedgerScopeType" NOT NULL,
    "currentStatus" "PayoffLedgerStatus" NOT NULL,
    "targetStartChapterOrder" INTEGER,
    "targetEndChapterOrder" INTEGER,
    "firstSeenChapterOrder" INTEGER,
    "lastTouchedChapterOrder" INTEGER,
    "lastTouchedChapterId" TEXT,
    "setupChapterId" TEXT,
    "payoffChapterId" TEXT,
    "lastSnapshotId" TEXT,
    "sourceRefsJson" TEXT,
    "evidenceJson" TEXT,
    "riskSignalsJson" TEXT,
    "statusReason" TEXT,
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayoffLedgerItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterResourceLedgerItem" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "resourceKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "narrativeFunction" TEXT NOT NULL,
    "ownerType" TEXT NOT NULL,
    "ownerId" TEXT,
    "ownerName" TEXT,
    "ownerCharacterId" TEXT,
    "holderCharacterId" TEXT,
    "holderCharacterName" TEXT,
    "status" TEXT NOT NULL,
    "readerKnows" BOOLEAN NOT NULL DEFAULT false,
    "holderKnows" BOOLEAN NOT NULL DEFAULT true,
    "knownByCharacterIdsJson" TEXT,
    "introducedChapterId" TEXT,
    "introducedChapterOrder" INTEGER,
    "lastTouchedChapterId" TEXT,
    "lastTouchedChapterOrder" INTEGER,
    "expectedUseStartChapterOrder" INTEGER,
    "expectedUseEndChapterOrder" INTEGER,
    "constraintsJson" TEXT,
    "riskSignalsJson" TEXT,
    "sourceRefsJson" TEXT,
    "evidenceJson" TEXT,
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterResourceLedgerItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterResourceEvent" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "chapterId" TEXT,
    "chapterOrder" INTEGER,
    "eventType" TEXT NOT NULL,
    "actorCharacterId" TEXT,
    "fromHolderCharacterId" TEXT,
    "toHolderCharacterId" TEXT,
    "summary" TEXT NOT NULL,
    "evidenceJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CharacterResourceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CanonicalStateVersion" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "chapterId" TEXT,
    "sourceType" TEXT NOT NULL,
    "sourceStage" TEXT,
    "version" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "snapshotJson" TEXT NOT NULL,
    "acceptedProposalIdsJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CanonicalStateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StateChangeProposal" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "chapterId" TEXT,
    "sourceSnapshotId" TEXT,
    "sourceType" TEXT NOT NULL,
    "sourceStage" TEXT,
    "proposalType" TEXT NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'validated',
    "summary" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "evidenceJson" TEXT,
    "validationNotesJson" TEXT,
    "committedVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StateChangeProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryPlan" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "chapterId" TEXT,
    "parentId" TEXT,
    "sourceStateSnapshotId" TEXT,
    "level" "StoryPlanLevel" NOT NULL,
    "planRole" "StoryPlanRole",
    "phaseLabel" TEXT,
    "title" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "participantsJson" TEXT,
    "revealsJson" TEXT,
    "riskNotesJson" TEXT,
    "mustAdvanceJson" TEXT,
    "mustPreserveJson" TEXT,
    "sourceIssueIdsJson" TEXT,
    "replannedFromPlanId" TEXT,
    "hookTarget" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "externalRef" TEXT,
    "rawPlanJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoryPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChapterPlanScene" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "objective" TEXT,
    "conflict" TEXT,
    "reveal" TEXT,
    "emotionBeat" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChapterPlanScene_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReplanRun" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "chapterId" TEXT,
    "sourcePlanId" TEXT,
    "triggerType" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "outputSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReplanRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditReport" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "auditType" "AuditType" NOT NULL,
    "overallScore" INTEGER,
    "summary" TEXT,
    "legacyScoreJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditIssue" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "auditType" "AuditType" NOT NULL,
    "severity" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "fixSuggestion" TEXT NOT NULL,
    "status" "AuditIssueStatus" NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeDocument" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "kind" "KnowledgeDocumentKind" NOT NULL DEFAULT 'user_upload',
    "sourceAnalysisId" TEXT,
    "status" "KnowledgeDocumentStatus" NOT NULL DEFAULT 'enabled',
    "activeVersionId" TEXT,
    "activeVersionNumber" INTEGER NOT NULL DEFAULT 0,
    "latestIndexStatus" "KnowledgeIndexStatus" NOT NULL DEFAULT 'idle',
    "lastIndexedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeDocumentVersion" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "charCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeDocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentChapter" (
    "id" TEXT NOT NULL,
    "documentVersionId" TEXT NOT NULL,
    "chapterIndex" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "startOffset" INTEGER NOT NULL,
    "endOffset" INTEGER NOT NULL,
    "charCount" INTEGER NOT NULL,
    "summary" TEXT,
    "splitter" TEXT NOT NULL DEFAULT 'rule',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentChapter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeBinding" (
    "id" TEXT NOT NULL,
    "targetType" "KnowledgeBindingTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "sourceAnalysisId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeBinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookAnalysis" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "documentVersionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "BookAnalysisStatus" NOT NULL DEFAULT 'queued',
    "summary" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "temperature" DOUBLE PRECISION,
    "maxTokens" INTEGER,
    "budgetTokens" INTEGER,
    "usedTokens" INTEGER DEFAULT 0,
    "userFocusInstruction" TEXT,
    "sourceStartChapterIndex" INTEGER,
    "sourceEndChapterIndex" INTEGER,
    "sourceStartOffset" INTEGER,
    "sourceEndOffset" INTEGER,
    "sourceScopeLabel" TEXT,
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pendingManualRecovery" BOOLEAN NOT NULL DEFAULT false,
    "heartbeatAt" TIMESTAMP(3),
    "currentStage" TEXT,
    "currentItemKey" TEXT,
    "currentItemLabel" TEXT,
    "cancelRequestedAt" TIMESTAMP(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 1,
    "lastError" TEXT,
    "lastRunAt" TIMESTAMP(3),
    "publishedDocumentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookAnalysisSourceCache" (
    "id" TEXT NOT NULL,
    "documentVersionId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "temperature" DOUBLE PRECISION NOT NULL,
    "notesMaxTokens" INTEGER NOT NULL,
    "sourceScopeKey" TEXT NOT NULL DEFAULT 'full',
    "segmentVersion" INTEGER NOT NULL DEFAULT 1,
    "segmentCount" INTEGER NOT NULL,
    "notesJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookAnalysisSourceCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookAnalysisSection" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "sectionKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "BookAnalysisSectionStatus" NOT NULL DEFAULT 'idle',
    "aiContent" TEXT,
    "editedContent" TEXT,
    "notes" TEXT,
    "focusInstruction" TEXT,
    "structuredDataJson" TEXT,
    "normalizationWarningsJson" TEXT,
    "evidenceJson" TEXT,
    "frozen" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookAnalysisSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookAnalysisCharacter" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'candidate',
    "briefDescription" TEXT,
    "importance" TEXT,
    "occurringChaptersJson" TEXT,
    "lastGenerationError" TEXT,
    "generationDepth" TEXT NOT NULL DEFAULT 'standard',
    "selectedDimensionsJson" TEXT,
    "profileJson" TEXT,
    "depthMetadataJson" TEXT,
    "profileSectionsJson" TEXT,
    "evidenceJson" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookAnalysisCharacter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookAnalysisCharacterAppearance" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "coveragePercent" INTEGER NOT NULL DEFAULT 0,
    "consolidatedAppearanceJson" TEXT,
    "variantPolicyJson" TEXT,
    "lastIndexedChapterIndex" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookAnalysisCharacterAppearance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookAnalysisCharacterAppearanceSnapshot" (
    "id" TEXT NOT NULL,
    "appearanceId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "chapterIndex" INTEGER NOT NULL,
    "chapterTitle" TEXT,
    "appearanceJson" TEXT,
    "evidenceJson" TEXT,
    "summaryCaption" TEXT,
    "contextSceneRefsJson" TEXT,
    "manuallyEdited" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookAnalysisCharacterAppearanceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookAnalysisCharacterAppearanceTerm" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "chapterIndex" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "category" TEXT,
    "confidence" DOUBLE PRECISION,
    "stability" TEXT,
    "evidenceJson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookAnalysisCharacterAppearanceTerm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookAnalysisCharacterAppearanceImage" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "generationTaskId" TEXT,
    "imageAssetId" TEXT,
    "imagePromptJson" TEXT,
    "referenceAssetIdsJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookAnalysisCharacterAppearanceImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookAnalysisCharacterArc" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "chapterIndex" INTEGER,
    "stageLabel" TEXT NOT NULL,
    "stateSnapshotJson" TEXT,
    "evidenceJson" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookAnalysisCharacterArc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookAnalysisCharacterScene" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "sceneLabel" TEXT NOT NULL,
    "sceneType" TEXT,
    "performanceJson" TEXT,
    "evidenceJson" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookAnalysisCharacterScene_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeChunk" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default',
    "ownerType" "RagOwnerType" NOT NULL,
    "ownerId" TEXT NOT NULL,
    "novelId" TEXT,
    "worldId" TEXT,
    "title" TEXT,
    "chunkText" TEXT NOT NULL,
    "chunkHash" TEXT NOT NULL,
    "chunkOrder" INTEGER NOT NULL,
    "tokenEstimate" INTEGER NOT NULL DEFAULT 0,
    "language" TEXT NOT NULL DEFAULT 'zh',
    "metadataJson" TEXT,
    "facetKeys" TEXT,
    "chapterAnchor" TEXT,
    "embedProvider" TEXT NOT NULL,
    "embedModel" TEXT NOT NULL,
    "embedVersion" INTEGER NOT NULL DEFAULT 1,
    "indexedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RagIndexJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default',
    "jobType" "RagJobType" NOT NULL,
    "ownerType" "RagOwnerType" NOT NULL,
    "ownerId" TEXT NOT NULL,
    "status" "RagJobStatus" NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payloadJson" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RagIndexJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RagRetrievalTrace" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default',
    "novelId" TEXT,
    "worldId" TEXT,
    "queryDigest" TEXT NOT NULL,
    "queryPreview" TEXT,
    "scopeJson" TEXT,
    "candidateCounts" TEXT NOT NULL DEFAULT '{}',
    "hitsJson" TEXT NOT NULL DEFAULT '[]',
    "timingsJson" TEXT NOT NULL DEFAULT '{}',
    "fallbackTriggered" BOOLEAN NOT NULL DEFAULT false,
    "rerankerUsed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RagRetrievalTrace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NovelSideEffectJob" (
    "id" TEXT NOT NULL,
    "novelId" TEXT,
    "jobType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "idempotencyKey" TEXT NOT NULL,
    "payloadVersion" INTEGER NOT NULL DEFAULT 1,
    "payloadJson" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseOwner" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "lastError" TEXT,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NovelSideEffectJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskCenterArchive" (
    "id" TEXT NOT NULL,
    "taskKind" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskCenterArchive_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryTimelineEvent" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "chapterId" TEXT,
    "chapterIndex" INTEGER,
    "eventOrder" INTEGER NOT NULL,
    "storyDayIndex" INTEGER,
    "storyTimeLabel" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "visibility" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "participantIdsJson" TEXT NOT NULL DEFAULT '[]',
    "locationId" TEXT,
    "factionIdsJson" TEXT NOT NULL DEFAULT '[]',
    "prerequisiteIdsJson" TEXT NOT NULL DEFAULT '[]',
    "consequenceIdsJson" TEXT NOT NULL DEFAULT '[]',
    "stateChangesJson" TEXT NOT NULL DEFAULT '[]',
    "eventKey" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoryTimelineEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChapterTimeAnchor" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "chapterIndex" INTEGER NOT NULL,
    "storyDayIndex" INTEGER,
    "timeLabel" TEXT NOT NULL,
    "startsAfterIdsJson" TEXT NOT NULL DEFAULT '[]',
    "plannedEventIdsJson" TEXT NOT NULL DEFAULT '[]',
    "endedWithIdsJson" TEXT NOT NULL DEFAULT '[]',
    "previousHookIdsJson" TEXT NOT NULL DEFAULT '[]',
    "nextHookIdsJson" TEXT NOT NULL DEFAULT '[]',
    "forbiddenEventIdsJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChapterTimeAnchor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimelineHook" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "createdInChapterId" TEXT NOT NULL,
    "createdInChapterIndex" INTEGER NOT NULL,
    "expectedResolveByChapterIndex" INTEGER,
    "resolveMode" TEXT NOT NULL DEFAULT 'long_arc',
    "blocking" BOOLEAN NOT NULL DEFAULT false,
    "resolvedInChapterId" TEXT,
    "resolvedInChapterIndex" INTEGER,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "relatedEventIdsJson" TEXT NOT NULL DEFAULT '[]',
    "participantIdsJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimelineHook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimelineConstraint" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "chapterId" TEXT,
    "chapterIndex" INTEGER,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "relatedEventIdsJson" TEXT NOT NULL DEFAULT '[]',
    "relatedHookIdsJson" TEXT NOT NULL DEFAULT '[]',
    "relatedCharacterIdsJson" TEXT NOT NULL DEFAULT '[]',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimelineConstraint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimelineCheckReport" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "chapterIndex" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "issuesJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimelineCheckReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NovelFactEntry" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "chapterOrder" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'completed',
    "source" TEXT NOT NULL DEFAULT 'auto',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NovelFactEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DramaProject" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'original',
    "sourceRef" TEXT,
    "sourceInput" TEXT,
    "track" TEXT,
    "theme" TEXT,
    "orientation" TEXT NOT NULL DEFAULT 'vertical_paid',
    "targetEpisodes" INTEGER NOT NULL DEFAULT 80,
    "strategy" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DramaProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DramaSourceBundle" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "synopsis" TEXT,
    "beats" TEXT,
    "worldNotes" TEXT,
    "hardFacts" TEXT,
    "rawText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DramaSourceBundle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DramaCharacter" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "archetype" TEXT,
    "persona" TEXT,
    "speechStyle" TEXT,
    "visualAnchor" TEXT,
    "voiceProfile" TEXT,
    "relations" TEXT,
    "sourceCharacterRef" TEXT,
    "portraitData" TEXT,
    "threeViewData" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DramaCharacter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DramaEpisode" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT DEFAULT '',
    "hookOpening" TEXT,
    "cliffhanger" TEXT,
    "hookType" TEXT,
    "isPaywall" BOOLEAN NOT NULL DEFAULT false,
    "emotionNet" INTEGER,
    "beatSheet" TEXT,
    "sourceMap" TEXT,
    "durationSec" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "qualityFlags" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DramaEpisode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DramaFact" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "episodeOrder" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'completed',
    "source" TEXT NOT NULL DEFAULT 'auto',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DramaFact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DramaCharacterLibrary" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "name" TEXT NOT NULL,
    "archetype" TEXT,
    "persona" TEXT,
    "speechStyle" TEXT,
    "visualAnchor" TEXT,
    "voiceProfile" TEXT,
    "relations" TEXT,
    "tags" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DramaCharacterLibrary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DramaStoryboard" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DramaStoryboard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DramaShot" (
    "id" TEXT NOT NULL,
    "storyboardId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "shotSize" TEXT,
    "cameraMove" TEXT,
    "durationSec" INTEGER,
    "location" TEXT,
    "action" TEXT NOT NULL,
    "dialogue" TEXT,
    "characterRefs" TEXT,
    "visualPrompt" TEXT,
    "keyframeData" TEXT,
    "dialogueAudioData" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DramaShot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DramaVideoPrompt" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "episodeId" TEXT,
    "shotId" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'mock',
    "prompt" TEXT NOT NULL,
    "negativePrompt" TEXT,
    "aspectRatio" TEXT NOT NULL DEFAULT '9:16',
    "durationSec" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'prompted',
    "version" INTEGER NOT NULL DEFAULT 1,
    "supersededById" TEXT,
    "providerTaskId" TEXT,
    "resultUrl" TEXT,
    "failureReason" TEXT,
    "providerResult" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DramaVideoPrompt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DramaBatchJob" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "episodeId" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "progress" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DramaBatchJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComicProject" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'original',
    "sourceRef" TEXT,
    "sourceInput" TEXT,
    "trackId" TEXT,
    "stylePreset" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComicProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComicSourceBundle" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "bundleJson" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComicSourceBundle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComicCharacter" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gender" TEXT NOT NULL DEFAULT 'unknown',
    "persona" TEXT,
    "visualAnchor" TEXT,
    "sheetData" TEXT,
    "sourceCharacterRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComicCharacter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComicCharacterAsset" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "assetType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageData" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComicCharacterAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComicScene" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sceneType" TEXT NOT NULL DEFAULT 'interior',
    "bible" TEXT,
    "sheetData" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComicScene_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComicEpisode" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT,
    "hookType" TEXT,
    "cliffhanger" TEXT,
    "isPaywalled" BOOLEAN NOT NULL DEFAULT false,
    "outline" TEXT,
    "sourceText" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "scriptConfig" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComicEpisode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComicPanel" (
    "id" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "panelType" TEXT,
    "action" TEXT NOT NULL,
    "dialogues" TEXT,
    "characterRefs" TEXT,
    "sceneRef" TEXT,
    "visualPrompt" TEXT,
    "densityLevel" TEXT,
    "focus" TEXT,
    "layoutData" TEXT,
    "imageData" TEXT,
    "letteredData" TEXT,
    "motionData" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComicPanel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComicFact" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'completed',
    "episodeOrder" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComicFact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComicUploadAsset" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "refId" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComicUploadAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComicExportJob" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "episodeId" TEXT,
    "format" TEXT NOT NULL,
    "spec" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "artifacts" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComicExportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComicBatchJob" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "episodeId" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "progress" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComicBatchJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Novel_genreId_idx" ON "Novel"("genreId");

-- CreateIndex
CREATE INDEX "Novel_primaryStoryModeId_idx" ON "Novel"("primaryStoryModeId");

-- CreateIndex
CREATE INDEX "Novel_secondaryStoryModeId_idx" ON "Novel"("secondaryStoryModeId");

-- CreateIndex
CREATE INDEX "Novel_worldId_idx" ON "Novel"("worldId");

-- CreateIndex
CREATE INDEX "Novel_writingMode_idx" ON "Novel"("writingMode");

-- CreateIndex
CREATE INDEX "Novel_sourceNovelId_idx" ON "Novel"("sourceNovelId");

-- CreateIndex
CREATE INDEX "Novel_derivedFromNovelId_idx" ON "Novel"("derivedFromNovelId");

-- CreateIndex
CREATE INDEX "Novel_narrativeForm_idx" ON "Novel"("narrativeForm");

-- CreateIndex
CREATE INDEX "Novel_writingPlatform_idx" ON "Novel"("writingPlatform");

-- CreateIndex
CREATE INDEX "Novel_sourceKnowledgeDocumentId_idx" ON "Novel"("sourceKnowledgeDocumentId");

-- CreateIndex
CREATE INDEX "Novel_continuationBookAnalysisId_idx" ON "Novel"("continuationBookAnalysisId");

-- CreateIndex
CREATE INDEX "NovelIntentVersion_novelId_status_version_idx" ON "NovelIntentVersion"("novelId", "status", "version");

-- CreateIndex
CREATE INDEX "NovelIntentVersion_previousVersionId_idx" ON "NovelIntentVersion"("previousVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "NovelIntentVersion_workflowTaskId_version_key" ON "NovelIntentVersion"("workflowTaskId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "CreationStudioConfirmation_workflowTaskId_key" ON "CreationStudioConfirmation"("workflowTaskId");

-- CreateIndex
CREATE INDEX "CreationStudioConfirmation_novelId_idx" ON "CreationStudioConfirmation"("novelId");

-- CreateIndex
CREATE INDEX "CreationStudioConfirmation_productionTaskId_idx" ON "CreationStudioConfirmation"("productionTaskId");

-- CreateIndex
CREATE UNIQUE INDEX "CreationStudioConfirmation_workflowTaskId_idempotencyKey_key" ON "CreationStudioConfirmation"("workflowTaskId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "ShortStoryPlan_novelId_key" ON "ShortStoryPlan"("novelId");

-- CreateIndex
CREATE INDEX "ShortStoryPlan_intentVersionId_idx" ON "ShortStoryPlan"("intentVersionId");

-- CreateIndex
CREATE INDEX "ShortStoryPlan_status_updatedAt_idx" ON "ShortStoryPlan"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "ShortStorySegment_novelId_order_idx" ON "ShortStorySegment"("novelId", "order");

-- CreateIndex
CREATE INDEX "ShortStorySegment_status_updatedAt_idx" ON "ShortStorySegment"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ShortStorySegment_planId_order_key" ON "ShortStorySegment"("planId", "order");

-- CreateIndex
CREATE INDEX "PromptAddendum_scope_promptId_enabled_idx" ON "PromptAddendum"("scope", "promptId", "enabled");

-- CreateIndex
CREATE INDEX "PromptAddendum_novelId_promptId_enabled_idx" ON "PromptAddendum"("novelId", "promptId", "enabled");

-- CreateIndex
CREATE INDEX "PromptAddendum_updatedAt_idx" ON "PromptAddendum"("updatedAt");

-- CreateIndex
CREATE INDEX "PromptSlotOverride_promptId_idx" ON "PromptSlotOverride"("promptId");

-- CreateIndex
CREATE INDEX "PromptSlotOverride_novelId_promptId_idx" ON "PromptSlotOverride"("novelId", "promptId");

-- CreateIndex
CREATE UNIQUE INDEX "PromptSlotOverride_scope_novelId_promptId_key" ON "PromptSlotOverride"("scope", "novelId", "promptId");

-- CreateIndex
CREATE INDEX "PromptTemplateOverride_promptId_idx" ON "PromptTemplateOverride"("promptId");

-- CreateIndex
CREATE INDEX "PromptTemplateOverride_novelId_promptId_idx" ON "PromptTemplateOverride"("novelId", "promptId");

-- CreateIndex
CREATE INDEX "PromptTemplateOverride_activeVersionId_idx" ON "PromptTemplateOverride"("activeVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "PromptTemplateOverride_scope_novelId_promptId_key" ON "PromptTemplateOverride"("scope", "novelId", "promptId");

-- CreateIndex
CREATE INDEX "PromptTemplateVersion_overrideId_createdAt_idx" ON "PromptTemplateVersion"("overrideId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PromptTemplateVersion_overrideId_versionNo_key" ON "PromptTemplateVersion"("overrideId", "versionNo");

-- CreateIndex
CREATE UNIQUE INDEX "WritingPlatformProfileOverride_platform_key" ON "WritingPlatformProfileOverride"("platform");

-- CreateIndex
CREATE INDEX "WritingPlatformProfileOverride_activeVersionId_idx" ON "WritingPlatformProfileOverride"("activeVersionId");

-- CreateIndex
CREATE INDEX "WritingPlatformProfileVersion_overrideId_createdAt_idx" ON "WritingPlatformProfileVersion"("overrideId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WritingPlatformProfileVersion_overrideId_versionNo_key" ON "WritingPlatformProfileVersion"("overrideId", "versionNo");

-- CreateIndex
CREATE INDEX "CreativeDecision_novelId_createdAt_idx" ON "CreativeDecision"("novelId", "createdAt");

-- CreateIndex
CREATE INDEX "NovelSnapshot_novelId_createdAt_idx" ON "NovelSnapshot"("novelId", "createdAt");

-- CreateIndex
CREATE INDEX "Chapter_novelId_order_idx" ON "Chapter"("novelId", "order");

-- CreateIndex
CREATE INDEX "ChapterArtifactSyncCheckpoint_novelId_chapterId_artifactTyp_idx" ON "ChapterArtifactSyncCheckpoint"("novelId", "chapterId", "artifactType", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChapterArtifactSyncCheckpoint_novelId_chapterId_contentHash_key" ON "ChapterArtifactSyncCheckpoint"("novelId", "chapterId", "contentHash", "artifactType", "syncMode");

-- CreateIndex
CREATE INDEX "Character_novelId_idx" ON "Character"("novelId");

-- CreateIndex
CREATE INDEX "Character_baseCharacterId_idx" ON "Character"("baseCharacterId");

-- CreateIndex
CREATE INDEX "CharacterMindSnapshot_novelId_characterId_isCurrent_updated_idx" ON "CharacterMindSnapshot"("novelId", "characterId", "isCurrent", "updatedAt");

-- CreateIndex
CREATE INDEX "CharacterMindSnapshot_sourceChapterId_idx" ON "CharacterMindSnapshot"("sourceChapterId");

-- CreateIndex
CREATE INDEX "CharacterInfluenceProposal_novelId_characterId_status_targe_idx" ON "CharacterInfluenceProposal"("novelId", "characterId", "status", "targetStartChapterOrder", "targetEndChapterOrder");

-- CreateIndex
CREATE INDEX "CharacterInfluenceProposal_proposalSetId_idx" ON "CharacterInfluenceProposal"("proposalSetId");

-- CreateIndex
CREATE INDEX "CharacterInfluenceProposal_resolvedChapterId_idx" ON "CharacterInfluenceProposal"("resolvedChapterId");

-- CreateIndex
CREATE INDEX "CharacterDialogueSession_novelId_characterId_status_updated_idx" ON "CharacterDialogueSession"("novelId", "characterId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "CharacterDialogueSession_sourceMindSnapshotId_idx" ON "CharacterDialogueSession"("sourceMindSnapshotId");

-- CreateIndex
CREATE INDEX "CharacterDialogueTurn_sessionId_createdAt_idx" ON "CharacterDialogueTurn"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "CharacterDialogueInfluence_novelId_characterId_status_targe_idx" ON "CharacterDialogueInfluence"("novelId", "characterId", "status", "targetStartChapterOrder", "targetEndChapterOrder");

-- CreateIndex
CREATE INDEX "CharacterDialogueInfluence_sessionId_createdAt_idx" ON "CharacterDialogueInfluence"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "CharacterDialogueInfluence_conversationSessionId_createdAt_idx" ON "CharacterDialogueInfluence"("conversationSessionId", "createdAt");

-- CreateIndex
CREATE INDEX "CharacterDialogueInfluence_resolvedChapterId_idx" ON "CharacterDialogueInfluence"("resolvedChapterId");

-- CreateIndex
CREATE UNIQUE INDEX "CharacterConversationSession_legacyDialogueSessionId_key" ON "CharacterConversationSession"("legacyDialogueSessionId");

-- CreateIndex
CREATE INDEX "CharacterConversationSession_subjectKind_subjectId_scopeKin_idx" ON "CharacterConversationSession"("subjectKind", "subjectId", "scopeKind", "scopeId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "CharacterConversationSession_scopeKind_scopeId_updatedAt_idx" ON "CharacterConversationSession"("scopeKind", "scopeId", "updatedAt");

-- CreateIndex
CREATE INDEX "CharacterConversationTurn_sessionId_createdAt_idx" ON "CharacterConversationTurn"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "CharacterRelation_novelId_updatedAt_idx" ON "CharacterRelation"("novelId", "updatedAt");

-- CreateIndex
CREATE INDEX "CharacterRelation_sourceCharacterId_idx" ON "CharacterRelation"("sourceCharacterId");

-- CreateIndex
CREATE INDEX "CharacterRelation_targetCharacterId_idx" ON "CharacterRelation"("targetCharacterId");

-- CreateIndex
CREATE UNIQUE INDEX "CharacterRelation_novelId_sourceCharacterId_targetCharacter_key" ON "CharacterRelation"("novelId", "sourceCharacterId", "targetCharacterId");

-- CreateIndex
CREATE INDEX "CharacterCastOption_novelId_updatedAt_idx" ON "CharacterCastOption"("novelId", "updatedAt");

-- CreateIndex
CREATE INDEX "CharacterCastOptionMember_optionId_sortOrder_idx" ON "CharacterCastOptionMember"("optionId", "sortOrder");

-- CreateIndex
CREATE INDEX "CharacterCastOptionRelation_optionId_sortOrder_idx" ON "CharacterCastOptionRelation"("optionId", "sortOrder");

-- CreateIndex
CREATE INDEX "CharacterTimeline_novelId_characterId_idx" ON "CharacterTimeline"("novelId", "characterId");

-- CreateIndex
CREATE INDEX "CharacterTimeline_characterId_chapterOrder_idx" ON "CharacterTimeline"("characterId", "chapterOrder");

-- CreateIndex
CREATE INDEX "CharacterTimeline_chapterId_idx" ON "CharacterTimeline"("chapterId");

-- CreateIndex
CREATE INDEX "CharacterCandidate_novelId_status_updatedAt_idx" ON "CharacterCandidate"("novelId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "CharacterCandidate_sourceChapterId_idx" ON "CharacterCandidate"("sourceChapterId");

-- CreateIndex
CREATE INDEX "CharacterCandidate_matchedCharacterId_idx" ON "CharacterCandidate"("matchedCharacterId");

-- CreateIndex
CREATE INDEX "CharacterVolumeAssignment_novelId_volumeId_isCore_idx" ON "CharacterVolumeAssignment"("novelId", "volumeId", "isCore");

-- CreateIndex
CREATE INDEX "CharacterVolumeAssignment_volumeId_characterId_idx" ON "CharacterVolumeAssignment"("volumeId", "characterId");

-- CreateIndex
CREATE UNIQUE INDEX "CharacterVolumeAssignment_characterId_volumeId_key" ON "CharacterVolumeAssignment"("characterId", "volumeId");

-- CreateIndex
CREATE INDEX "CharacterFactionTrack_novelId_characterId_createdAt_idx" ON "CharacterFactionTrack"("novelId", "characterId", "createdAt");

-- CreateIndex
CREATE INDEX "CharacterFactionTrack_volumeId_characterId_createdAt_idx" ON "CharacterFactionTrack"("volumeId", "characterId", "createdAt");

-- CreateIndex
CREATE INDEX "CharacterFactionTrack_chapterId_createdAt_idx" ON "CharacterFactionTrack"("chapterId", "createdAt");

-- CreateIndex
CREATE INDEX "CharacterRelationStage_novelId_isCurrent_updatedAt_idx" ON "CharacterRelationStage"("novelId", "isCurrent", "updatedAt");

-- CreateIndex
CREATE INDEX "CharacterRelationStage_sourceCharacterId_targetCharacterId__idx" ON "CharacterRelationStage"("sourceCharacterId", "targetCharacterId", "isCurrent");

-- CreateIndex
CREATE INDEX "CharacterRelationStage_relationId_idx" ON "CharacterRelationStage"("relationId");

-- CreateIndex
CREATE INDEX "CharacterRelationStage_chapterId_idx" ON "CharacterRelationStage"("chapterId");

-- CreateIndex
CREATE INDEX "BaseCharacter_sourceType_sourceRefId_idx" ON "BaseCharacter"("sourceType", "sourceRefId");

-- CreateIndex
CREATE INDEX "BaseCharacterRevision_baseCharacterId_createdAt_idx" ON "BaseCharacterRevision"("baseCharacterId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BaseCharacterRevision_baseCharacterId_version_key" ON "BaseCharacterRevision"("baseCharacterId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "CharacterLibraryLink_characterId_key" ON "CharacterLibraryLink"("characterId");

-- CreateIndex
CREATE INDEX "CharacterLibraryLink_novelId_linkStatus_updatedAt_idx" ON "CharacterLibraryLink"("novelId", "linkStatus", "updatedAt");

-- CreateIndex
CREATE INDEX "CharacterLibraryLink_baseCharacterId_linkStatus_updatedAt_idx" ON "CharacterLibraryLink"("baseCharacterId", "linkStatus", "updatedAt");

-- CreateIndex
CREATE INDEX "CharacterLibraryLink_baseRevisionId_idx" ON "CharacterLibraryLink"("baseRevisionId");

-- CreateIndex
CREATE INDEX "CharacterSyncProposal_novelId_status_updatedAt_idx" ON "CharacterSyncProposal"("novelId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "CharacterSyncProposal_characterId_status_updatedAt_idx" ON "CharacterSyncProposal"("characterId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "CharacterSyncProposal_baseCharacterId_status_updatedAt_idx" ON "CharacterSyncProposal"("baseCharacterId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "CharacterSyncProposal_baseRevisionId_idx" ON "CharacterSyncProposal"("baseRevisionId");

-- CreateIndex
CREATE INDEX "ImageGenerationTask_sceneType_status_idx" ON "ImageGenerationTask"("sceneType", "status");

-- CreateIndex
CREATE INDEX "ImageGenerationTask_baseCharacterId_createdAt_idx" ON "ImageGenerationTask"("baseCharacterId", "createdAt");

-- CreateIndex
CREATE INDEX "ImageGenerationTask_novelId_createdAt_idx" ON "ImageGenerationTask"("novelId", "createdAt");

-- CreateIndex
CREATE INDEX "ImageGenerationTask_bookAnalysisCharacterId_createdAt_idx" ON "ImageGenerationTask"("bookAnalysisCharacterId", "createdAt");

-- CreateIndex
CREATE INDEX "StyleExtractionTask_status_updatedAt_idx" ON "StyleExtractionTask"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "StyleExtractionTask_createdStyleProfileId_idx" ON "StyleExtractionTask"("createdStyleProfileId");

-- CreateIndex
CREATE INDEX "StyleExtractionTask_sourceType_sourceRefId_idx" ON "StyleExtractionTask"("sourceType", "sourceRefId");

-- CreateIndex
CREATE INDEX "ImageAsset_taskId_idx" ON "ImageAsset"("taskId");

-- CreateIndex
CREATE INDEX "ImageAsset_sceneType_createdAt_idx" ON "ImageAsset"("sceneType", "createdAt");

-- CreateIndex
CREATE INDEX "ImageAsset_baseCharacterId_isPrimary_createdAt_idx" ON "ImageAsset"("baseCharacterId", "isPrimary", "createdAt");

-- CreateIndex
CREATE INDEX "ImageAsset_novelId_isPrimary_createdAt_idx" ON "ImageAsset"("novelId", "isPrimary", "createdAt");

-- CreateIndex
CREATE INDEX "ImageAsset_bookAnalysisCharacterId_isPrimary_createdAt_idx" ON "ImageAsset"("bookAnalysisCharacterId", "isPrimary", "createdAt");

-- CreateIndex
CREATE INDEX "VisualAssetProjection_scopeKind_scopeId_sourceCreatedAt_idx" ON "VisualAssetProjection"("scopeKind", "scopeId", "sourceCreatedAt");

-- CreateIndex
CREATE INDEX "VisualAssetProjection_kind_sourceCreatedAt_idx" ON "VisualAssetProjection"("kind", "sourceCreatedAt");

-- CreateIndex
CREATE INDEX "VisualAssetProjection_sourceDomain_sourceCreatedAt_idx" ON "VisualAssetProjection"("sourceDomain", "sourceCreatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "VisualAssetProjection_sourceDomain_sourceType_sourceId_sour_key" ON "VisualAssetProjection"("sourceDomain", "sourceType", "sourceId", "sourceVersion");

-- CreateIndex
CREATE INDEX "NovelGenre_parentId_idx" ON "NovelGenre"("parentId");

-- CreateIndex
CREATE INDEX "NovelStoryMode_parentId_idx" ON "NovelStoryMode"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "NovelWorld_novelId_key" ON "NovelWorld"("novelId");

-- CreateIndex
CREATE INDEX "NovelWorld_sourceWorldId_idx" ON "NovelWorld"("sourceWorldId");

-- CreateIndex
CREATE INDEX "NovelWorld_sourceType_idx" ON "NovelWorld"("sourceType");

-- CreateIndex
CREATE INDEX "WorldSyncRecord_novelWorldId_createdAt_idx" ON "WorldSyncRecord"("novelWorldId", "createdAt");

-- CreateIndex
CREATE INDEX "WorldSyncRecord_sourceWorldId_idx" ON "WorldSyncRecord"("sourceWorldId");

-- CreateIndex
CREATE INDEX "WorldAsset_worldId_assetType_idx" ON "WorldAsset"("worldId", "assetType");

-- CreateIndex
CREATE INDEX "WorldAsset_novelWorldId_assetType_idx" ON "WorldAsset"("novelWorldId", "assetType");

-- CreateIndex
CREATE INDEX "WorldAsset_assetType_idx" ON "WorldAsset"("assetType");

-- CreateIndex
CREATE INDEX "WorldPropertyLibrary_sourceWorldId_idx" ON "WorldPropertyLibrary"("sourceWorldId");

-- CreateIndex
CREATE INDEX "WorldSnapshot_worldId_createdAt_idx" ON "WorldSnapshot"("worldId", "createdAt");

-- CreateIndex
CREATE INDEX "WorldDeepeningQA_worldId_status_idx" ON "WorldDeepeningQA"("worldId", "status");

-- CreateIndex
CREATE INDEX "WorldConsistencyIssue_worldId_status_idx" ON "WorldConsistencyIssue"("worldId", "status");

-- CreateIndex
CREATE INDEX "WorldConsistencyIssue_worldId_severity_idx" ON "WorldConsistencyIssue"("worldId", "severity");

-- CreateIndex
CREATE INDEX "StyleProfile_status_updatedAt_idx" ON "StyleProfile"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "StyleProfile_sourceType_sourceRefId_idx" ON "StyleProfile"("sourceType", "sourceRefId");

-- CreateIndex
CREATE UNIQUE INDEX "StyleTemplate_key_key" ON "StyleTemplate"("key");

-- CreateIndex
CREATE UNIQUE INDEX "AntiAiRule_key_key" ON "AntiAiRule"("key");

-- CreateIndex
CREATE INDEX "AntiAiRule_type_enabled_idx" ON "AntiAiRule"("type", "enabled");

-- CreateIndex
CREATE INDEX "AntiAiRule_globalBaselineEnabled_enabled_idx" ON "AntiAiRule"("globalBaselineEnabled", "enabled");

-- CreateIndex
CREATE INDEX "StyleProfileAntiAiRule_antiAiRuleId_idx" ON "StyleProfileAntiAiRule"("antiAiRuleId");

-- CreateIndex
CREATE UNIQUE INDEX "StyleProfileAntiAiRule_styleProfileId_antiAiRuleId_key" ON "StyleProfileAntiAiRule"("styleProfileId", "antiAiRuleId");

-- CreateIndex
CREATE INDEX "StyleBinding_targetType_targetId_enabled_idx" ON "StyleBinding"("targetType", "targetId", "enabled");

-- CreateIndex
CREATE INDEX "StyleBinding_styleProfileId_idx" ON "StyleBinding"("styleProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "APIKey_provider_key" ON "APIKey"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "ModelRouteConfig_taskType_key" ON "ModelRouteConfig"("taskType");

-- CreateIndex
CREATE INDEX "ModelRouteConfig_provider_idx" ON "ModelRouteConfig"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "NovelBible_novelId_key" ON "NovelBible"("novelId");

-- CreateIndex
CREATE INDEX "PlotBeat_novelId_idx" ON "PlotBeat"("novelId");

-- CreateIndex
CREATE INDEX "PlotBeat_novelId_chapterOrder_idx" ON "PlotBeat"("novelId", "chapterOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ChapterSummary_chapterId_key" ON "ChapterSummary"("chapterId");

-- CreateIndex
CREATE INDEX "ChapterSummary_novelId_idx" ON "ChapterSummary"("novelId");

-- CreateIndex
CREATE INDEX "ConsistencyFact_novelId_idx" ON "ConsistencyFact"("novelId");

-- CreateIndex
CREATE INDEX "ConsistencyFact_chapterId_idx" ON "ConsistencyFact"("chapterId");

-- CreateIndex
CREATE INDEX "ConsistencyFact_novelId_category_idx" ON "ConsistencyFact"("novelId", "category");

-- CreateIndex
CREATE INDEX "GenerationJob_novelId_idx" ON "GenerationJob"("novelId");

-- CreateIndex
CREATE INDEX "GenerationJob_novelId_status_idx" ON "GenerationJob"("novelId", "status");

-- CreateIndex
CREATE INDEX "AgentRun_status_updatedAt_idx" ON "AgentRun"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "AgentRun_novelId_createdAt_idx" ON "AgentRun"("novelId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentRun_novelId_chapterId_createdAt_idx" ON "AgentRun"("novelId", "chapterId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentRun_sessionId_createdAt_idx" ON "AgentRun"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentStep_runId_idempotencyKey_idx" ON "AgentStep"("runId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "AgentStep_runId_parentStepId_idx" ON "AgentStep"("runId", "parentStepId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentStep_runId_seq_key" ON "AgentStep"("runId", "seq");

-- CreateIndex
CREATE INDEX "AgentApproval_runId_status_idx" ON "AgentApproval"("runId", "status");

-- CreateIndex
CREATE INDEX "AgentApproval_stepId_idx" ON "AgentApproval"("stepId");

-- CreateIndex
CREATE INDEX "AgentApproval_status_expiresAt_idx" ON "AgentApproval"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "CreativeHubThread_archived_updatedAt_idx" ON "CreativeHubThread"("archived", "updatedAt");

-- CreateIndex
CREATE INDEX "CreativeHubThread_status_updatedAt_idx" ON "CreativeHubThread"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "CreativeHubCheckpoint_threadId_createdAt_idx" ON "CreativeHubCheckpoint"("threadId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CreativeHubCheckpoint_threadId_checkpointId_key" ON "CreativeHubCheckpoint"("threadId", "checkpointId");

-- CreateIndex
CREATE INDEX "StorylineVersion_novelId_status_createdAt_idx" ON "StorylineVersion"("novelId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StorylineVersion_novelId_version_key" ON "StorylineVersion"("novelId", "version");

-- CreateIndex
CREATE INDEX "VolumePlanVersion_novelId_status_createdAt_idx" ON "VolumePlanVersion"("novelId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "VolumePlanVersion_novelId_status_version_idx" ON "VolumePlanVersion"("novelId", "status", "version");

-- CreateIndex
CREATE UNIQUE INDEX "VolumePlanVersion_novelId_version_key" ON "VolumePlanVersion"("novelId", "version");

-- CreateIndex
CREATE INDEX "VolumePlan_novelId_status_sortOrder_idx" ON "VolumePlan"("novelId", "status", "sortOrder");

-- CreateIndex
CREATE INDEX "VolumePlan_sourceVersionId_idx" ON "VolumePlan"("sourceVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "VolumePlan_novelId_sortOrder_key" ON "VolumePlan"("novelId", "sortOrder");

-- CreateIndex
CREATE INDEX "VolumeChapterPlan_volumeId_chapterOrder_idx" ON "VolumeChapterPlan"("volumeId", "chapterOrder");

-- CreateIndex
CREATE INDEX "VolumeChapterPlan_chapterId_idx" ON "VolumeChapterPlan"("chapterId");

-- CreateIndex
CREATE UNIQUE INDEX "VolumeChapterPlan_volumeId_chapterOrder_key" ON "VolumeChapterPlan"("volumeId", "chapterOrder");

-- CreateIndex
CREATE INDEX "QualityReport_novelId_idx" ON "QualityReport"("novelId");

-- CreateIndex
CREATE INDEX "QualityReport_chapterId_idx" ON "QualityReport"("chapterId");

-- CreateIndex
CREATE INDEX "QualityReport_novelId_createdAt_idx" ON "QualityReport"("novelId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoryMacroPlan_novelId_key" ON "StoryMacroPlan"("novelId");

-- CreateIndex
CREATE UNIQUE INDEX "BookContract_novelId_key" ON "BookContract"("novelId");

-- CreateIndex
CREATE INDEX "NovelWorkflowTask_novelId_status_updatedAt_idx" ON "NovelWorkflowTask"("novelId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "NovelWorkflowTask_status_updatedAt_idx" ON "NovelWorkflowTask"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "NovelWorkflowTask_lane_updatedAt_idx" ON "NovelWorkflowTask"("lane", "updatedAt");

-- CreateIndex
CREATE INDEX "DirectorRunCommand_status_runAfter_updatedAt_idx" ON "DirectorRunCommand"("status", "runAfter", "updatedAt");

-- CreateIndex
CREATE INDEX "DirectorRunCommand_taskId_status_updatedAt_idx" ON "DirectorRunCommand"("taskId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "DirectorRunCommand_novelId_updatedAt_idx" ON "DirectorRunCommand"("novelId", "updatedAt");

-- CreateIndex
CREATE INDEX "DirectorRunCommand_leaseOwner_leaseExpiresAt_idx" ON "DirectorRunCommand"("leaseOwner", "leaseExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "DirectorRunCommand_taskId_commandType_idempotencyKey_key" ON "DirectorRunCommand"("taskId", "commandType", "idempotencyKey");

-- CreateIndex
CREATE INDEX "DirectorRuntimeInstance_novelId_status_updatedAt_idx" ON "DirectorRuntimeInstance"("novelId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "DirectorRuntimeInstance_workflowTaskId_idx" ON "DirectorRuntimeInstance"("workflowTaskId");

-- CreateIndex
CREATE INDEX "DirectorRuntimeInstance_runId_idx" ON "DirectorRuntimeInstance"("runId");

-- CreateIndex
CREATE INDEX "DirectorRuntimeInstance_status_updatedAt_idx" ON "DirectorRuntimeInstance"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DirectorRuntimeCommand_legacyCommandId_key" ON "DirectorRuntimeCommand"("legacyCommandId");

-- CreateIndex
CREATE INDEX "DirectorRuntimeCommand_runtimeId_status_updatedAt_idx" ON "DirectorRuntimeCommand"("runtimeId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "DirectorRuntimeCommand_status_priority_runAfter_createdAt_idx" ON "DirectorRuntimeCommand"("status", "priority", "runAfter", "createdAt");

-- CreateIndex
CREATE INDEX "DirectorRuntimeCommand_workflowTaskId_status_updatedAt_idx" ON "DirectorRuntimeCommand"("workflowTaskId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "DirectorRuntimeCommand_novelId_status_updatedAt_idx" ON "DirectorRuntimeCommand"("novelId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "DirectorRuntimeCommand_leaseOwner_leaseExpiresAt_idx" ON "DirectorRuntimeCommand"("leaseOwner", "leaseExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "DirectorRuntimeCommand_runtimeId_commandType_idempotencyKey_key" ON "DirectorRuntimeCommand"("runtimeId", "commandType", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "DirectorRuntimeExecution_activeLockKey_key" ON "DirectorRuntimeExecution"("activeLockKey");

-- CreateIndex
CREATE INDEX "DirectorRuntimeExecution_runtimeId_status_updatedAt_idx" ON "DirectorRuntimeExecution"("runtimeId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "DirectorRuntimeExecution_status_leaseExpiresAt_idx" ON "DirectorRuntimeExecution"("status", "leaseExpiresAt");

-- CreateIndex
CREATE INDEX "DirectorRuntimeExecution_workflowTaskId_status_updatedAt_idx" ON "DirectorRuntimeExecution"("workflowTaskId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "DirectorRuntimeExecution_novelId_status_updatedAt_idx" ON "DirectorRuntimeExecution"("novelId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "DirectorRuntimeExecution_workerId_status_updatedAt_idx" ON "DirectorRuntimeExecution"("workerId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "DirectorRuntimeCheckpoint_runtimeId_createdAt_idx" ON "DirectorRuntimeCheckpoint"("runtimeId", "createdAt");

-- CreateIndex
CREATE INDEX "DirectorRuntimeCheckpoint_commandId_idx" ON "DirectorRuntimeCheckpoint"("commandId");

-- CreateIndex
CREATE INDEX "DirectorRuntimeCheckpoint_executionId_idx" ON "DirectorRuntimeCheckpoint"("executionId");

-- CreateIndex
CREATE UNIQUE INDEX "DirectorRuntimeCheckpoint_runtimeId_version_key" ON "DirectorRuntimeCheckpoint"("runtimeId", "version");

-- CreateIndex
CREATE INDEX "DirectorRuntimeEvent_runtimeId_occurredAt_idx" ON "DirectorRuntimeEvent"("runtimeId", "occurredAt");

-- CreateIndex
CREATE INDEX "DirectorRuntimeEvent_commandId_occurredAt_idx" ON "DirectorRuntimeEvent"("commandId", "occurredAt");

-- CreateIndex
CREATE INDEX "DirectorRuntimeEvent_executionId_occurredAt_idx" ON "DirectorRuntimeEvent"("executionId", "occurredAt");

-- CreateIndex
CREATE INDEX "DirectorRuntimeEvent_workflowTaskId_occurredAt_idx" ON "DirectorRuntimeEvent"("workflowTaskId", "occurredAt");

-- CreateIndex
CREATE INDEX "DirectorRuntimeEvent_novelId_occurredAt_idx" ON "DirectorRuntimeEvent"("novelId", "occurredAt");

-- CreateIndex
CREATE INDEX "DirectorRuntimeEvent_type_occurredAt_idx" ON "DirectorRuntimeEvent"("type", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "DirectorRun_taskId_key" ON "DirectorRun"("taskId");

-- CreateIndex
CREATE INDEX "DirectorRun_novelId_updatedAt_idx" ON "DirectorRun"("novelId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DirectorStepRun_idempotencyKey_key" ON "DirectorStepRun"("idempotencyKey");

-- CreateIndex
CREATE INDEX "DirectorStepRun_runId_status_updatedAt_idx" ON "DirectorStepRun"("runId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "DirectorStepRun_taskId_nodeKey_idx" ON "DirectorStepRun"("taskId", "nodeKey");

-- CreateIndex
CREATE INDEX "DirectorStepRun_novelId_updatedAt_idx" ON "DirectorStepRun"("novelId", "updatedAt");

-- CreateIndex
CREATE INDEX "DirectorLlmUsageRecord_novelId_recordedAt_idx" ON "DirectorLlmUsageRecord"("novelId", "recordedAt");

-- CreateIndex
CREATE INDEX "DirectorLlmUsageRecord_taskId_recordedAt_idx" ON "DirectorLlmUsageRecord"("taskId", "recordedAt");

-- CreateIndex
CREATE INDEX "DirectorLlmUsageRecord_runId_recordedAt_idx" ON "DirectorLlmUsageRecord"("runId", "recordedAt");

-- CreateIndex
CREATE INDEX "DirectorLlmUsageRecord_stepIdempotencyKey_recordedAt_idx" ON "DirectorLlmUsageRecord"("stepIdempotencyKey", "recordedAt");

-- CreateIndex
CREATE INDEX "DirectorLlmUsageRecord_nodeKey_recordedAt_idx" ON "DirectorLlmUsageRecord"("nodeKey", "recordedAt");

-- CreateIndex
CREATE INDEX "DirectorLlmUsageRecord_attributionStatus_recordedAt_idx" ON "DirectorLlmUsageRecord"("attributionStatus", "recordedAt");

-- CreateIndex
CREATE INDEX "DirectorEvent_runId_occurredAt_idx" ON "DirectorEvent"("runId", "occurredAt");

-- CreateIndex
CREATE INDEX "DirectorEvent_taskId_occurredAt_idx" ON "DirectorEvent"("taskId", "occurredAt");

-- CreateIndex
CREATE INDEX "DirectorEvent_novelId_occurredAt_idx" ON "DirectorEvent"("novelId", "occurredAt");

-- CreateIndex
CREATE INDEX "DirectorEvent_type_occurredAt_idx" ON "DirectorEvent"("type", "occurredAt");

-- CreateIndex
CREATE INDEX "DirectorArtifact_novelId_artifactType_status_idx" ON "DirectorArtifact"("novelId", "artifactType", "status");

-- CreateIndex
CREATE INDEX "DirectorArtifact_runId_updatedAt_idx" ON "DirectorArtifact"("runId", "updatedAt");

-- CreateIndex
CREATE INDEX "DirectorArtifact_taskId_updatedAt_idx" ON "DirectorArtifact"("taskId", "updatedAt");

-- CreateIndex
CREATE INDEX "DirectorArtifact_targetType_targetId_idx" ON "DirectorArtifact"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "DirectorArtifact_sourceStepRunId_idx" ON "DirectorArtifact"("sourceStepRunId");

-- CreateIndex
CREATE INDEX "DirectorArtifactDependency_dependsOnArtifactId_idx" ON "DirectorArtifactDependency"("dependsOnArtifactId");

-- CreateIndex
CREATE UNIQUE INDEX "DirectorArtifactDependency_artifactId_dependsOnArtifactId_key" ON "DirectorArtifactDependency"("artifactId", "dependsOnArtifactId");

-- CreateIndex
CREATE UNIQUE INDEX "AutoDirectorAutoApprovalRecord_eventId_key" ON "AutoDirectorAutoApprovalRecord"("eventId");

-- CreateIndex
CREATE INDEX "AutoDirectorAutoApprovalRecord_novelId_createdAt_idx" ON "AutoDirectorAutoApprovalRecord"("novelId", "createdAt");

-- CreateIndex
CREATE INDEX "AutoDirectorAutoApprovalRecord_taskId_createdAt_idx" ON "AutoDirectorAutoApprovalRecord"("taskId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AutoDirectorFollowUpActionLog_idempotencyKey_key" ON "AutoDirectorFollowUpActionLog"("idempotencyKey");

-- CreateIndex
CREATE INDEX "AutoDirectorFollowUpActionLog_taskId_executedAt_idx" ON "AutoDirectorFollowUpActionLog"("taskId", "executedAt");

-- CreateIndex
CREATE INDEX "AutoDirectorFollowUpActionLog_taskId_actionCode_executedAt_idx" ON "AutoDirectorFollowUpActionLog"("taskId", "actionCode", "executedAt");

-- CreateIndex
CREATE INDEX "AutoDirectorFollowUpNotificationLog_taskId_createdAt_idx" ON "AutoDirectorFollowUpNotificationLog"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "AutoDirectorFollowUpNotificationLog_eventId_channelType_cre_idx" ON "AutoDirectorFollowUpNotificationLog"("eventId", "channelType", "createdAt");

-- CreateIndex
CREATE INDEX "StoryStateSnapshot_novelId_createdAt_idx" ON "StoryStateSnapshot"("novelId", "createdAt");

-- CreateIndex
CREATE INDEX "StoryStateSnapshot_sourceChapterId_idx" ON "StoryStateSnapshot"("sourceChapterId");

-- CreateIndex
CREATE UNIQUE INDEX "StoryStateSnapshot_novelId_sourceChapterId_key" ON "StoryStateSnapshot"("novelId", "sourceChapterId");

-- CreateIndex
CREATE INDEX "StoryStateSnapshotArchive_novelId_sourceChapterOrder_idx" ON "StoryStateSnapshotArchive"("novelId", "sourceChapterOrder");

-- CreateIndex
CREATE INDEX "StoryStateSnapshotArchive_novelId_archivedAt_idx" ON "StoryStateSnapshotArchive"("novelId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoryStateSnapshotArchive_novelId_sourceChapterId_key" ON "StoryStateSnapshotArchive"("novelId", "sourceChapterId");

-- CreateIndex
CREATE INDEX "CharacterState_characterId_createdAt_idx" ON "CharacterState"("characterId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CharacterState_snapshotId_characterId_key" ON "CharacterState"("snapshotId", "characterId");

-- CreateIndex
CREATE INDEX "RelationState_sourceCharacterId_targetCharacterId_idx" ON "RelationState"("sourceCharacterId", "targetCharacterId");

-- CreateIndex
CREATE UNIQUE INDEX "RelationState_snapshotId_sourceCharacterId_targetCharacterI_key" ON "RelationState"("snapshotId", "sourceCharacterId", "targetCharacterId");

-- CreateIndex
CREATE INDEX "InformationState_snapshotId_holderType_idx" ON "InformationState"("snapshotId", "holderType");

-- CreateIndex
CREATE INDEX "ForeshadowState_snapshotId_status_idx" ON "ForeshadowState"("snapshotId", "status");

-- CreateIndex
CREATE INDEX "ForeshadowState_setupChapterId_idx" ON "ForeshadowState"("setupChapterId");

-- CreateIndex
CREATE INDEX "ForeshadowState_payoffChapterId_idx" ON "ForeshadowState"("payoffChapterId");

-- CreateIndex
CREATE INDEX "OpenConflict_novelId_status_updatedAt_idx" ON "OpenConflict"("novelId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "OpenConflict_chapterId_status_idx" ON "OpenConflict"("chapterId", "status");

-- CreateIndex
CREATE INDEX "OpenConflict_sourceSnapshotId_idx" ON "OpenConflict"("sourceSnapshotId");

-- CreateIndex
CREATE INDEX "OpenConflict_sourceIssueId_idx" ON "OpenConflict"("sourceIssueId");

-- CreateIndex
CREATE UNIQUE INDEX "OpenConflict_novelId_chapterId_sourceType_conflictKey_key" ON "OpenConflict"("novelId", "chapterId", "sourceType", "conflictKey");

-- CreateIndex
CREATE INDEX "PayoffLedgerItem_novelId_currentStatus_updatedAt_idx" ON "PayoffLedgerItem"("novelId", "currentStatus", "updatedAt");

-- CreateIndex
CREATE INDEX "PayoffLedgerItem_novelId_targetEndChapterOrder_idx" ON "PayoffLedgerItem"("novelId", "targetEndChapterOrder");

-- CreateIndex
CREATE INDEX "PayoffLedgerItem_lastTouchedChapterId_idx" ON "PayoffLedgerItem"("lastTouchedChapterId");

-- CreateIndex
CREATE INDEX "PayoffLedgerItem_setupChapterId_idx" ON "PayoffLedgerItem"("setupChapterId");

-- CreateIndex
CREATE INDEX "PayoffLedgerItem_payoffChapterId_idx" ON "PayoffLedgerItem"("payoffChapterId");

-- CreateIndex
CREATE INDEX "PayoffLedgerItem_lastSnapshotId_idx" ON "PayoffLedgerItem"("lastSnapshotId");

-- CreateIndex
CREATE UNIQUE INDEX "PayoffLedgerItem_novelId_ledgerKey_key" ON "PayoffLedgerItem"("novelId", "ledgerKey");

-- CreateIndex
CREATE INDEX "CharacterResourceLedgerItem_novelId_status_updatedAt_idx" ON "CharacterResourceLedgerItem"("novelId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "CharacterResourceLedgerItem_holderCharacterId_status_idx" ON "CharacterResourceLedgerItem"("holderCharacterId", "status");

-- CreateIndex
CREATE INDEX "CharacterResourceLedgerItem_ownerCharacterId_idx" ON "CharacterResourceLedgerItem"("ownerCharacterId");

-- CreateIndex
CREATE INDEX "CharacterResourceLedgerItem_novelId_lastTouchedChapterOrder_idx" ON "CharacterResourceLedgerItem"("novelId", "lastTouchedChapterOrder");

-- CreateIndex
CREATE INDEX "CharacterResourceLedgerItem_introducedChapterId_idx" ON "CharacterResourceLedgerItem"("introducedChapterId");

-- CreateIndex
CREATE INDEX "CharacterResourceLedgerItem_lastTouchedChapterId_idx" ON "CharacterResourceLedgerItem"("lastTouchedChapterId");

-- CreateIndex
CREATE UNIQUE INDEX "CharacterResourceLedgerItem_novelId_resourceKey_key" ON "CharacterResourceLedgerItem"("novelId", "resourceKey");

-- CreateIndex
CREATE INDEX "CharacterResourceEvent_novelId_createdAt_idx" ON "CharacterResourceEvent"("novelId", "createdAt");

-- CreateIndex
CREATE INDEX "CharacterResourceEvent_resourceId_createdAt_idx" ON "CharacterResourceEvent"("resourceId", "createdAt");

-- CreateIndex
CREATE INDEX "CharacterResourceEvent_chapterId_idx" ON "CharacterResourceEvent"("chapterId");

-- CreateIndex
CREATE INDEX "CharacterResourceEvent_actorCharacterId_idx" ON "CharacterResourceEvent"("actorCharacterId");

-- CreateIndex
CREATE INDEX "CharacterResourceEvent_fromHolderCharacterId_idx" ON "CharacterResourceEvent"("fromHolderCharacterId");

-- CreateIndex
CREATE INDEX "CharacterResourceEvent_toHolderCharacterId_idx" ON "CharacterResourceEvent"("toHolderCharacterId");

-- CreateIndex
CREATE INDEX "CanonicalStateVersion_novelId_createdAt_idx" ON "CanonicalStateVersion"("novelId", "createdAt");

-- CreateIndex
CREATE INDEX "CanonicalStateVersion_chapterId_idx" ON "CanonicalStateVersion"("chapterId");

-- CreateIndex
CREATE UNIQUE INDEX "CanonicalStateVersion_novelId_version_key" ON "CanonicalStateVersion"("novelId", "version");

-- CreateIndex
CREATE INDEX "StateChangeProposal_novelId_createdAt_idx" ON "StateChangeProposal"("novelId", "createdAt");

-- CreateIndex
CREATE INDEX "StateChangeProposal_chapterId_createdAt_idx" ON "StateChangeProposal"("chapterId", "createdAt");

-- CreateIndex
CREATE INDEX "StateChangeProposal_status_riskLevel_createdAt_idx" ON "StateChangeProposal"("status", "riskLevel", "createdAt");

-- CreateIndex
CREATE INDEX "StateChangeProposal_committedVersionId_idx" ON "StateChangeProposal"("committedVersionId");

-- CreateIndex
CREATE INDEX "StoryPlan_novelId_level_createdAt_idx" ON "StoryPlan"("novelId", "level", "createdAt");

-- CreateIndex
CREATE INDEX "StoryPlan_novelId_level_externalRef_idx" ON "StoryPlan"("novelId", "level", "externalRef");

-- CreateIndex
CREATE INDEX "StoryPlan_novelId_level_chapterId_idx" ON "StoryPlan"("novelId", "level", "chapterId");

-- CreateIndex
CREATE INDEX "StoryPlan_chapterId_createdAt_idx" ON "StoryPlan"("chapterId", "createdAt");

-- CreateIndex
CREATE INDEX "StoryPlan_externalRef_idx" ON "StoryPlan"("externalRef");

-- CreateIndex
CREATE INDEX "StoryPlan_sourceStateSnapshotId_idx" ON "StoryPlan"("sourceStateSnapshotId");

-- CreateIndex
CREATE INDEX "ChapterPlanScene_planId_sortOrder_idx" ON "ChapterPlanScene"("planId", "sortOrder");

-- CreateIndex
CREATE INDEX "ReplanRun_novelId_createdAt_idx" ON "ReplanRun"("novelId", "createdAt");

-- CreateIndex
CREATE INDEX "ReplanRun_chapterId_createdAt_idx" ON "ReplanRun"("chapterId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditReport_novelId_chapterId_auditType_createdAt_idx" ON "AuditReport"("novelId", "chapterId", "auditType", "createdAt");

-- CreateIndex
CREATE INDEX "AuditReport_chapterId_createdAt_idx" ON "AuditReport"("chapterId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditIssue_reportId_status_idx" ON "AuditIssue"("reportId", "status");

-- CreateIndex
CREATE INDEX "AuditIssue_auditType_severity_idx" ON "AuditIssue"("auditType", "severity");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeDocument_sourceAnalysisId_key" ON "KnowledgeDocument"("sourceAnalysisId");

-- CreateIndex
CREATE INDEX "KnowledgeDocument_status_updatedAt_idx" ON "KnowledgeDocument"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "KnowledgeDocument_kind_updatedAt_idx" ON "KnowledgeDocument"("kind", "updatedAt");

-- CreateIndex
CREATE INDEX "KnowledgeDocument_title_idx" ON "KnowledgeDocument"("title");

-- CreateIndex
CREATE INDEX "KnowledgeDocumentVersion_documentId_createdAt_idx" ON "KnowledgeDocumentVersion"("documentId", "createdAt");

-- CreateIndex
CREATE INDEX "KnowledgeDocumentVersion_contentHash_idx" ON "KnowledgeDocumentVersion"("contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeDocumentVersion_documentId_versionNumber_key" ON "KnowledgeDocumentVersion"("documentId", "versionNumber");

-- CreateIndex
CREATE INDEX "DocumentChapter_documentVersionId_startOffset_idx" ON "DocumentChapter"("documentVersionId", "startOffset");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentChapter_documentVersionId_chapterIndex_key" ON "DocumentChapter"("documentVersionId", "chapterIndex");

-- CreateIndex
CREATE INDEX "KnowledgeBinding_targetType_targetId_idx" ON "KnowledgeBinding"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "KnowledgeBinding_documentId_idx" ON "KnowledgeBinding"("documentId");

-- CreateIndex
CREATE INDEX "KnowledgeBinding_sourceAnalysisId_idx" ON "KnowledgeBinding"("sourceAnalysisId");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeBinding_targetType_targetId_documentId_key" ON "KnowledgeBinding"("targetType", "targetId", "documentId");

-- CreateIndex
CREATE INDEX "BookAnalysis_documentId_status_idx" ON "BookAnalysis"("documentId", "status");

-- CreateIndex
CREATE INDEX "BookAnalysis_documentVersionId_idx" ON "BookAnalysis"("documentVersionId");

-- CreateIndex
CREATE INDEX "BookAnalysis_status_updatedAt_idx" ON "BookAnalysis"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "BookAnalysisSourceCache_documentVersionId_updatedAt_idx" ON "BookAnalysisSourceCache"("documentVersionId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BookAnalysisSourceCache_documentVersionId_sourceScopeKey_pr_key" ON "BookAnalysisSourceCache"("documentVersionId", "sourceScopeKey", "provider", "model", "temperature", "notesMaxTokens", "segmentVersion");

-- CreateIndex
CREATE INDEX "BookAnalysisSection_analysisId_sortOrder_idx" ON "BookAnalysisSection"("analysisId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "BookAnalysisSection_analysisId_sectionKey_key" ON "BookAnalysisSection"("analysisId", "sectionKey");

-- CreateIndex
CREATE INDEX "BookAnalysisCharacter_analysisId_sortOrder_idx" ON "BookAnalysisCharacter"("analysisId", "sortOrder");

-- CreateIndex
CREATE INDEX "BookAnalysisCharacter_analysisId_name_idx" ON "BookAnalysisCharacter"("analysisId", "name");

-- CreateIndex
CREATE INDEX "BookAnalysisCharacter_analysisId_status_idx" ON "BookAnalysisCharacter"("analysisId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BookAnalysisCharacterAppearance_characterId_key" ON "BookAnalysisCharacterAppearance"("characterId");

-- CreateIndex
CREATE INDEX "BookAnalysisCharacterAppearance_coveragePercent_idx" ON "BookAnalysisCharacterAppearance"("coveragePercent");

-- CreateIndex
CREATE INDEX "BookAnalysisCharacterAppearanceSnapshot_appearanceId_chapte_idx" ON "BookAnalysisCharacterAppearanceSnapshot"("appearanceId", "chapterIndex");

-- CreateIndex
CREATE INDEX "BookAnalysisCharacterAppearanceSnapshot_characterId_chapter_idx" ON "BookAnalysisCharacterAppearanceSnapshot"("characterId", "chapterIndex");

-- CreateIndex
CREATE INDEX "BookAnalysisCharacterAppearanceSnapshot_chapterIndex_idx" ON "BookAnalysisCharacterAppearanceSnapshot"("chapterIndex");

-- CreateIndex
CREATE UNIQUE INDEX "BookAnalysisCharacterAppearanceSnapshot_characterId_chapter_key" ON "BookAnalysisCharacterAppearanceSnapshot"("characterId", "chapterIndex");

-- CreateIndex
CREATE INDEX "BookAnalysisCharacterAppearanceTerm_characterId_status_upda_idx" ON "BookAnalysisCharacterAppearanceTerm"("characterId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "BookAnalysisCharacterAppearanceTerm_snapshotId_idx" ON "BookAnalysisCharacterAppearanceTerm"("snapshotId");

-- CreateIndex
CREATE INDEX "BookAnalysisCharacterAppearanceTerm_chapterIndex_idx" ON "BookAnalysisCharacterAppearanceTerm"("chapterIndex");

-- CreateIndex
CREATE UNIQUE INDEX "BookAnalysisCharacterAppearanceTerm_snapshotId_text_key" ON "BookAnalysisCharacterAppearanceTerm"("snapshotId", "text");

-- CreateIndex
CREATE INDEX "BookAnalysisCharacterAppearanceImage_generationTaskId_idx" ON "BookAnalysisCharacterAppearanceImage"("generationTaskId");

-- CreateIndex
CREATE INDEX "BookAnalysisCharacterAppearanceImage_snapshotId_idx" ON "BookAnalysisCharacterAppearanceImage"("snapshotId");

-- CreateIndex
CREATE UNIQUE INDEX "BookAnalysisCharacterAppearanceImage_imageAssetId_key" ON "BookAnalysisCharacterAppearanceImage"("imageAssetId");

-- CreateIndex
CREATE INDEX "BookAnalysisCharacterArc_characterId_sortOrder_idx" ON "BookAnalysisCharacterArc"("characterId", "sortOrder");

-- CreateIndex
CREATE INDEX "BookAnalysisCharacterArc_chapterIndex_idx" ON "BookAnalysisCharacterArc"("chapterIndex");

-- CreateIndex
CREATE INDEX "BookAnalysisCharacterScene_characterId_sortOrder_idx" ON "BookAnalysisCharacterScene"("characterId", "sortOrder");

-- CreateIndex
CREATE INDEX "KnowledgeChunk_tenantId_ownerType_ownerId_idx" ON "KnowledgeChunk"("tenantId", "ownerType", "ownerId");

-- CreateIndex
CREATE INDEX "KnowledgeChunk_tenantId_novelId_idx" ON "KnowledgeChunk"("tenantId", "novelId");

-- CreateIndex
CREATE INDEX "KnowledgeChunk_tenantId_worldId_idx" ON "KnowledgeChunk"("tenantId", "worldId");

-- CreateIndex
CREATE INDEX "KnowledgeChunk_facetKeys_idx" ON "KnowledgeChunk"("facetKeys");

-- CreateIndex
CREATE INDEX "KnowledgeChunk_chapterAnchor_idx" ON "KnowledgeChunk"("chapterAnchor");

-- CreateIndex
CREATE INDEX "KnowledgeChunk_chunkHash_idx" ON "KnowledgeChunk"("chunkHash");

-- CreateIndex
CREATE INDEX "RagIndexJob_status_runAfter_idx" ON "RagIndexJob"("status", "runAfter");

-- CreateIndex
CREATE INDEX "RagIndexJob_tenantId_ownerType_ownerId_idx" ON "RagIndexJob"("tenantId", "ownerType", "ownerId");

-- CreateIndex
CREATE INDEX "RagRetrievalTrace_tenantId_createdAt_idx" ON "RagRetrievalTrace"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "RagRetrievalTrace_tenantId_novelId_createdAt_idx" ON "RagRetrievalTrace"("tenantId", "novelId", "createdAt");

-- CreateIndex
CREATE INDEX "RagRetrievalTrace_queryDigest_idx" ON "RagRetrievalTrace"("queryDigest");

-- CreateIndex
CREATE UNIQUE INDEX "NovelSideEffectJob_idempotencyKey_key" ON "NovelSideEffectJob"("idempotencyKey");

-- CreateIndex
CREATE INDEX "NovelSideEffectJob_status_runAfter_idx" ON "NovelSideEffectJob"("status", "runAfter");

-- CreateIndex
CREATE INDEX "NovelSideEffectJob_novelId_status_updatedAt_idx" ON "NovelSideEffectJob"("novelId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "NovelSideEffectJob_leaseOwner_leaseExpiresAt_idx" ON "NovelSideEffectJob"("leaseOwner", "leaseExpiresAt");

-- CreateIndex
CREATE INDEX "NovelSideEffectJob_jobType_status_runAfter_idx" ON "NovelSideEffectJob"("jobType", "status", "runAfter");

-- CreateIndex
CREATE INDEX "TaskCenterArchive_taskKind_archivedAt_idx" ON "TaskCenterArchive"("taskKind", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TaskCenterArchive_taskKind_taskId_key" ON "TaskCenterArchive"("taskKind", "taskId");

-- CreateIndex
CREATE INDEX "StoryTimelineEvent_novelId_chapterIndex_idx" ON "StoryTimelineEvent"("novelId", "chapterIndex");

-- CreateIndex
CREATE INDEX "StoryTimelineEvent_novelId_eventOrder_idx" ON "StoryTimelineEvent"("novelId", "eventOrder");

-- CreateIndex
CREATE INDEX "StoryTimelineEvent_novelId_status_idx" ON "StoryTimelineEvent"("novelId", "status");

-- CreateIndex
CREATE INDEX "StoryTimelineEvent_novelId_eventKey_idx" ON "StoryTimelineEvent"("novelId", "eventKey");

-- CreateIndex
CREATE INDEX "ChapterTimeAnchor_novelId_chapterIndex_idx" ON "ChapterTimeAnchor"("novelId", "chapterIndex");

-- CreateIndex
CREATE UNIQUE INDEX "ChapterTimeAnchor_novelId_chapterId_key" ON "ChapterTimeAnchor"("novelId", "chapterId");

-- CreateIndex
CREATE INDEX "TimelineHook_novelId_status_idx" ON "TimelineHook"("novelId", "status");

-- CreateIndex
CREATE INDEX "TimelineHook_novelId_resolveMode_blocking_idx" ON "TimelineHook"("novelId", "resolveMode", "blocking");

-- CreateIndex
CREATE INDEX "TimelineHook_novelId_createdInChapterIndex_idx" ON "TimelineHook"("novelId", "createdInChapterIndex");

-- CreateIndex
CREATE INDEX "TimelineHook_novelId_expectedResolveByChapterIndex_idx" ON "TimelineHook"("novelId", "expectedResolveByChapterIndex");

-- CreateIndex
CREATE INDEX "TimelineConstraint_novelId_chapterIndex_idx" ON "TimelineConstraint"("novelId", "chapterIndex");

-- CreateIndex
CREATE INDEX "TimelineConstraint_novelId_active_idx" ON "TimelineConstraint"("novelId", "active");

-- CreateIndex
CREATE INDEX "TimelineCheckReport_novelId_chapterIndex_idx" ON "TimelineCheckReport"("novelId", "chapterIndex");

-- CreateIndex
CREATE INDEX "TimelineCheckReport_novelId_status_idx" ON "TimelineCheckReport"("novelId", "status");

-- CreateIndex
CREATE INDEX "NovelFactEntry_novelId_chapterOrder_idx" ON "NovelFactEntry"("novelId", "chapterOrder");

-- CreateIndex
CREATE INDEX "NovelFactEntry_novelId_category_idx" ON "NovelFactEntry"("novelId", "category");

-- CreateIndex
CREATE INDEX "DramaProject_source_idx" ON "DramaProject"("source");

-- CreateIndex
CREATE INDEX "DramaProject_status_idx" ON "DramaProject"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DramaSourceBundle_projectId_key" ON "DramaSourceBundle"("projectId");

-- CreateIndex
CREATE INDEX "DramaCharacter_projectId_idx" ON "DramaCharacter"("projectId");

-- CreateIndex
CREATE INDEX "DramaEpisode_projectId_status_idx" ON "DramaEpisode"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DramaEpisode_projectId_order_key" ON "DramaEpisode"("projectId", "order");

-- CreateIndex
CREATE INDEX "DramaFact_projectId_episodeOrder_idx" ON "DramaFact"("projectId", "episodeOrder");

-- CreateIndex
CREATE INDEX "DramaFact_projectId_category_idx" ON "DramaFact"("projectId", "category");

-- CreateIndex
CREATE INDEX "DramaCharacterLibrary_projectId_idx" ON "DramaCharacterLibrary"("projectId");

-- CreateIndex
CREATE INDEX "DramaCharacterLibrary_name_idx" ON "DramaCharacterLibrary"("name");

-- CreateIndex
CREATE INDEX "DramaStoryboard_projectId_idx" ON "DramaStoryboard"("projectId");

-- CreateIndex
CREATE INDEX "DramaStoryboard_episodeId_idx" ON "DramaStoryboard"("episodeId");

-- CreateIndex
CREATE INDEX "DramaShot_storyboardId_idx" ON "DramaShot"("storyboardId");

-- CreateIndex
CREATE UNIQUE INDEX "DramaShot_storyboardId_order_key" ON "DramaShot"("storyboardId", "order");

-- CreateIndex
CREATE INDEX "DramaVideoPrompt_projectId_idx" ON "DramaVideoPrompt"("projectId");

-- CreateIndex
CREATE INDEX "DramaVideoPrompt_episodeId_idx" ON "DramaVideoPrompt"("episodeId");

-- CreateIndex
CREATE INDEX "DramaVideoPrompt_projectId_shotId_version_idx" ON "DramaVideoPrompt"("projectId", "shotId", "version");

-- CreateIndex
CREATE INDEX "DramaVideoPrompt_provider_status_idx" ON "DramaVideoPrompt"("provider", "status");

-- CreateIndex
CREATE INDEX "DramaBatchJob_projectId_createdAt_idx" ON "DramaBatchJob"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "DramaBatchJob_episodeId_status_idx" ON "DramaBatchJob"("episodeId", "status");

-- CreateIndex
CREATE INDEX "DramaBatchJob_type_status_idx" ON "DramaBatchJob"("type", "status");

-- CreateIndex
CREATE INDEX "ComicProject_sourceType_idx" ON "ComicProject"("sourceType");

-- CreateIndex
CREATE INDEX "ComicProject_status_idx" ON "ComicProject"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ComicSourceBundle_projectId_key" ON "ComicSourceBundle"("projectId");

-- CreateIndex
CREATE INDEX "ComicCharacter_projectId_idx" ON "ComicCharacter"("projectId");

-- CreateIndex
CREATE INDEX "ComicCharacterAsset_characterId_idx" ON "ComicCharacterAsset"("characterId");

-- CreateIndex
CREATE INDEX "ComicCharacterAsset_projectId_idx" ON "ComicCharacterAsset"("projectId");

-- CreateIndex
CREATE INDEX "ComicScene_projectId_idx" ON "ComicScene"("projectId");

-- CreateIndex
CREATE INDEX "ComicEpisode_projectId_status_idx" ON "ComicEpisode"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ComicEpisode_projectId_order_key" ON "ComicEpisode"("projectId", "order");

-- CreateIndex
CREATE INDEX "ComicPanel_episodeId_idx" ON "ComicPanel"("episodeId");

-- CreateIndex
CREATE UNIQUE INDEX "ComicPanel_episodeId_order_key" ON "ComicPanel"("episodeId", "order");

-- CreateIndex
CREATE INDEX "ComicFact_projectId_idx" ON "ComicFact"("projectId");

-- CreateIndex
CREATE INDEX "ComicUploadAsset_projectId_kind_idx" ON "ComicUploadAsset"("projectId", "kind");

-- CreateIndex
CREATE INDEX "ComicExportJob_projectId_createdAt_idx" ON "ComicExportJob"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "ComicExportJob_format_status_idx" ON "ComicExportJob"("format", "status");

-- CreateIndex
CREATE INDEX "ComicBatchJob_projectId_createdAt_idx" ON "ComicBatchJob"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "ComicBatchJob_episodeId_status_idx" ON "ComicBatchJob"("episodeId", "status");

-- CreateIndex
CREATE INDEX "ComicBatchJob_type_status_idx" ON "ComicBatchJob"("type", "status");

-- AddForeignKey
ALTER TABLE "Novel" ADD CONSTRAINT "Novel_genreId_fkey" FOREIGN KEY ("genreId") REFERENCES "NovelGenre"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Novel" ADD CONSTRAINT "Novel_primaryStoryModeId_fkey" FOREIGN KEY ("primaryStoryModeId") REFERENCES "NovelStoryMode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Novel" ADD CONSTRAINT "Novel_secondaryStoryModeId_fkey" FOREIGN KEY ("secondaryStoryModeId") REFERENCES "NovelStoryMode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Novel" ADD CONSTRAINT "Novel_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Novel" ADD CONSTRAINT "Novel_sourceNovelId_fkey" FOREIGN KEY ("sourceNovelId") REFERENCES "Novel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Novel" ADD CONSTRAINT "Novel_derivedFromNovelId_fkey" FOREIGN KEY ("derivedFromNovelId") REFERENCES "Novel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Novel" ADD CONSTRAINT "Novel_sourceKnowledgeDocumentId_fkey" FOREIGN KEY ("sourceKnowledgeDocumentId") REFERENCES "KnowledgeDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Novel" ADD CONSTRAINT "Novel_continuationBookAnalysisId_fkey" FOREIGN KEY ("continuationBookAnalysisId") REFERENCES "BookAnalysis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NovelIntentVersion" ADD CONSTRAINT "NovelIntentVersion_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NovelIntentVersion" ADD CONSTRAINT "NovelIntentVersion_workflowTaskId_fkey" FOREIGN KEY ("workflowTaskId") REFERENCES "NovelWorkflowTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NovelIntentVersion" ADD CONSTRAINT "NovelIntentVersion_previousVersionId_fkey" FOREIGN KEY ("previousVersionId") REFERENCES "NovelIntentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreationStudioConfirmation" ADD CONSTRAINT "CreationStudioConfirmation_workflowTaskId_fkey" FOREIGN KEY ("workflowTaskId") REFERENCES "NovelWorkflowTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreationStudioConfirmation" ADD CONSTRAINT "CreationStudioConfirmation_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShortStoryPlan" ADD CONSTRAINT "ShortStoryPlan_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShortStoryPlan" ADD CONSTRAINT "ShortStoryPlan_intentVersionId_fkey" FOREIGN KEY ("intentVersionId") REFERENCES "NovelIntentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShortStorySegment" ADD CONSTRAINT "ShortStorySegment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ShortStoryPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShortStorySegment" ADD CONSTRAINT "ShortStorySegment_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromptAddendum" ADD CONSTRAINT "PromptAddendum_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromptSlotOverride" ADD CONSTRAINT "PromptSlotOverride_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromptTemplateOverride" ADD CONSTRAINT "PromptTemplateOverride_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromptTemplateVersion" ADD CONSTRAINT "PromptTemplateVersion_overrideId_fkey" FOREIGN KEY ("overrideId") REFERENCES "PromptTemplateOverride"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WritingPlatformProfileVersion" ADD CONSTRAINT "WritingPlatformProfileVersion_overrideId_fkey" FOREIGN KEY ("overrideId") REFERENCES "WritingPlatformProfileOverride"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeDecision" ADD CONSTRAINT "CreativeDecision_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NovelSnapshot" ADD CONSTRAINT "NovelSnapshot_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chapter" ADD CONSTRAINT "Chapter_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterArtifactSyncCheckpoint" ADD CONSTRAINT "ChapterArtifactSyncCheckpoint_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterArtifactSyncCheckpoint" ADD CONSTRAINT "ChapterArtifactSyncCheckpoint_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Character" ADD CONSTRAINT "Character_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterMindSnapshot" ADD CONSTRAINT "CharacterMindSnapshot_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterMindSnapshot" ADD CONSTRAINT "CharacterMindSnapshot_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterMindSnapshot" ADD CONSTRAINT "CharacterMindSnapshot_sourceChapterId_fkey" FOREIGN KEY ("sourceChapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterInfluenceProposal" ADD CONSTRAINT "CharacterInfluenceProposal_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterInfluenceProposal" ADD CONSTRAINT "CharacterInfluenceProposal_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterInfluenceProposal" ADD CONSTRAINT "CharacterInfluenceProposal_sourceMindSnapshotId_fkey" FOREIGN KEY ("sourceMindSnapshotId") REFERENCES "CharacterMindSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterInfluenceProposal" ADD CONSTRAINT "CharacterInfluenceProposal_resolvedChapterId_fkey" FOREIGN KEY ("resolvedChapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterDialogueSession" ADD CONSTRAINT "CharacterDialogueSession_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterDialogueSession" ADD CONSTRAINT "CharacterDialogueSession_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterDialogueSession" ADD CONSTRAINT "CharacterDialogueSession_sourceMindSnapshotId_fkey" FOREIGN KEY ("sourceMindSnapshotId") REFERENCES "CharacterMindSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterDialogueTurn" ADD CONSTRAINT "CharacterDialogueTurn_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CharacterDialogueSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterDialogueInfluence" ADD CONSTRAINT "CharacterDialogueInfluence_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterDialogueInfluence" ADD CONSTRAINT "CharacterDialogueInfluence_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterDialogueInfluence" ADD CONSTRAINT "CharacterDialogueInfluence_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CharacterDialogueSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterDialogueInfluence" ADD CONSTRAINT "CharacterDialogueInfluence_conversationSessionId_fkey" FOREIGN KEY ("conversationSessionId") REFERENCES "CharacterConversationSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterDialogueInfluence" ADD CONSTRAINT "CharacterDialogueInfluence_sourceMindSnapshotId_fkey" FOREIGN KEY ("sourceMindSnapshotId") REFERENCES "CharacterMindSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterDialogueInfluence" ADD CONSTRAINT "CharacterDialogueInfluence_resolvedChapterId_fkey" FOREIGN KEY ("resolvedChapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterConversationTurn" ADD CONSTRAINT "CharacterConversationTurn_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CharacterConversationSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterRelation" ADD CONSTRAINT "CharacterRelation_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterRelation" ADD CONSTRAINT "CharacterRelation_sourceCharacterId_fkey" FOREIGN KEY ("sourceCharacterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterRelation" ADD CONSTRAINT "CharacterRelation_targetCharacterId_fkey" FOREIGN KEY ("targetCharacterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterCastOption" ADD CONSTRAINT "CharacterCastOption_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterCastOptionMember" ADD CONSTRAINT "CharacterCastOptionMember_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "CharacterCastOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterCastOptionRelation" ADD CONSTRAINT "CharacterCastOptionRelation_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "CharacterCastOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterTimeline" ADD CONSTRAINT "CharacterTimeline_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterTimeline" ADD CONSTRAINT "CharacterTimeline_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterTimeline" ADD CONSTRAINT "CharacterTimeline_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterCandidate" ADD CONSTRAINT "CharacterCandidate_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterCandidate" ADD CONSTRAINT "CharacterCandidate_sourceChapterId_fkey" FOREIGN KEY ("sourceChapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterCandidate" ADD CONSTRAINT "CharacterCandidate_matchedCharacterId_fkey" FOREIGN KEY ("matchedCharacterId") REFERENCES "Character"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterVolumeAssignment" ADD CONSTRAINT "CharacterVolumeAssignment_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterVolumeAssignment" ADD CONSTRAINT "CharacterVolumeAssignment_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterVolumeAssignment" ADD CONSTRAINT "CharacterVolumeAssignment_volumeId_fkey" FOREIGN KEY ("volumeId") REFERENCES "VolumePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterFactionTrack" ADD CONSTRAINT "CharacterFactionTrack_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterFactionTrack" ADD CONSTRAINT "CharacterFactionTrack_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterFactionTrack" ADD CONSTRAINT "CharacterFactionTrack_volumeId_fkey" FOREIGN KEY ("volumeId") REFERENCES "VolumePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterFactionTrack" ADD CONSTRAINT "CharacterFactionTrack_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterRelationStage" ADD CONSTRAINT "CharacterRelationStage_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterRelationStage" ADD CONSTRAINT "CharacterRelationStage_relationId_fkey" FOREIGN KEY ("relationId") REFERENCES "CharacterRelation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterRelationStage" ADD CONSTRAINT "CharacterRelationStage_sourceCharacterId_fkey" FOREIGN KEY ("sourceCharacterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterRelationStage" ADD CONSTRAINT "CharacterRelationStage_targetCharacterId_fkey" FOREIGN KEY ("targetCharacterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterRelationStage" ADD CONSTRAINT "CharacterRelationStage_volumeId_fkey" FOREIGN KEY ("volumeId") REFERENCES "VolumePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterRelationStage" ADD CONSTRAINT "CharacterRelationStage_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaseCharacterRevision" ADD CONSTRAINT "BaseCharacterRevision_baseCharacterId_fkey" FOREIGN KEY ("baseCharacterId") REFERENCES "BaseCharacter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterLibraryLink" ADD CONSTRAINT "CharacterLibraryLink_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterLibraryLink" ADD CONSTRAINT "CharacterLibraryLink_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterLibraryLink" ADD CONSTRAINT "CharacterLibraryLink_baseCharacterId_fkey" FOREIGN KEY ("baseCharacterId") REFERENCES "BaseCharacter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterLibraryLink" ADD CONSTRAINT "CharacterLibraryLink_baseRevisionId_fkey" FOREIGN KEY ("baseRevisionId") REFERENCES "BaseCharacterRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterSyncProposal" ADD CONSTRAINT "CharacterSyncProposal_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterSyncProposal" ADD CONSTRAINT "CharacterSyncProposal_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterSyncProposal" ADD CONSTRAINT "CharacterSyncProposal_baseCharacterId_fkey" FOREIGN KEY ("baseCharacterId") REFERENCES "BaseCharacter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterSyncProposal" ADD CONSTRAINT "CharacterSyncProposal_baseRevisionId_fkey" FOREIGN KEY ("baseRevisionId") REFERENCES "BaseCharacterRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImageGenerationTask" ADD CONSTRAINT "ImageGenerationTask_baseCharacterId_fkey" FOREIGN KEY ("baseCharacterId") REFERENCES "BaseCharacter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImageGenerationTask" ADD CONSTRAINT "ImageGenerationTask_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImageGenerationTask" ADD CONSTRAINT "ImageGenerationTask_bookAnalysisCharacterId_fkey" FOREIGN KEY ("bookAnalysisCharacterId") REFERENCES "BookAnalysisCharacter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImageAsset" ADD CONSTRAINT "ImageAsset_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ImageGenerationTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImageAsset" ADD CONSTRAINT "ImageAsset_baseCharacterId_fkey" FOREIGN KEY ("baseCharacterId") REFERENCES "BaseCharacter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImageAsset" ADD CONSTRAINT "ImageAsset_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImageAsset" ADD CONSTRAINT "ImageAsset_bookAnalysisCharacterId_fkey" FOREIGN KEY ("bookAnalysisCharacterId") REFERENCES "BookAnalysisCharacter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NovelGenre" ADD CONSTRAINT "NovelGenre_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "NovelGenre"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NovelStoryMode" ADD CONSTRAINT "NovelStoryMode_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "NovelStoryMode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NovelWorld" ADD CONSTRAINT "NovelWorld_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NovelWorld" ADD CONSTRAINT "NovelWorld_sourceWorldId_fkey" FOREIGN KEY ("sourceWorldId") REFERENCES "World"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldSyncRecord" ADD CONSTRAINT "WorldSyncRecord_novelWorldId_fkey" FOREIGN KEY ("novelWorldId") REFERENCES "NovelWorld"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldAsset" ADD CONSTRAINT "WorldAsset_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldAsset" ADD CONSTRAINT "WorldAsset_novelWorldId_fkey" FOREIGN KEY ("novelWorldId") REFERENCES "NovelWorld"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldPropertyLibrary" ADD CONSTRAINT "WorldPropertyLibrary_sourceWorldId_fkey" FOREIGN KEY ("sourceWorldId") REFERENCES "World"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldSnapshot" ADD CONSTRAINT "WorldSnapshot_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldDeepeningQA" ADD CONSTRAINT "WorldDeepeningQA_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldConsistencyIssue" ADD CONSTRAINT "WorldConsistencyIssue_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StyleProfileAntiAiRule" ADD CONSTRAINT "StyleProfileAntiAiRule_styleProfileId_fkey" FOREIGN KEY ("styleProfileId") REFERENCES "StyleProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StyleProfileAntiAiRule" ADD CONSTRAINT "StyleProfileAntiAiRule_antiAiRuleId_fkey" FOREIGN KEY ("antiAiRuleId") REFERENCES "AntiAiRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StyleBinding" ADD CONSTRAINT "StyleBinding_styleProfileId_fkey" FOREIGN KEY ("styleProfileId") REFERENCES "StyleProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NovelBible" ADD CONSTRAINT "NovelBible_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlotBeat" ADD CONSTRAINT "PlotBeat_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterSummary" ADD CONSTRAINT "ChapterSummary_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterSummary" ADD CONSTRAINT "ChapterSummary_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsistencyFact" ADD CONSTRAINT "ConsistencyFact_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsistencyFact" ADD CONSTRAINT "ConsistencyFact_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationJob" ADD CONSTRAINT "GenerationJob_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentStep" ADD CONSTRAINT "AgentStep_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentApproval" ADD CONSTRAINT "AgentApproval_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentApproval" ADD CONSTRAINT "AgentApproval_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "AgentStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeHubCheckpoint" ADD CONSTRAINT "CreativeHubCheckpoint_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "CreativeHubThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorylineVersion" ADD CONSTRAINT "StorylineVersion_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolumePlanVersion" ADD CONSTRAINT "VolumePlanVersion_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolumePlan" ADD CONSTRAINT "VolumePlan_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolumePlan" ADD CONSTRAINT "VolumePlan_sourceVersionId_fkey" FOREIGN KEY ("sourceVersionId") REFERENCES "VolumePlanVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolumeChapterPlan" ADD CONSTRAINT "VolumeChapterPlan_volumeId_fkey" FOREIGN KEY ("volumeId") REFERENCES "VolumePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolumeChapterPlan" ADD CONSTRAINT "VolumeChapterPlan_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityReport" ADD CONSTRAINT "QualityReport_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityReport" ADD CONSTRAINT "QualityReport_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryMacroPlan" ADD CONSTRAINT "StoryMacroPlan_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookContract" ADD CONSTRAINT "BookContract_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NovelWorkflowTask" ADD CONSTRAINT "NovelWorkflowTask_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectorRunCommand" ADD CONSTRAINT "DirectorRunCommand_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "NovelWorkflowTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectorRunCommand" ADD CONSTRAINT "DirectorRunCommand_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectorRuntimeCommand" ADD CONSTRAINT "DirectorRuntimeCommand_runtimeId_fkey" FOREIGN KEY ("runtimeId") REFERENCES "DirectorRuntimeInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectorRuntimeExecution" ADD CONSTRAINT "DirectorRuntimeExecution_runtimeId_fkey" FOREIGN KEY ("runtimeId") REFERENCES "DirectorRuntimeInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectorRuntimeExecution" ADD CONSTRAINT "DirectorRuntimeExecution_commandId_fkey" FOREIGN KEY ("commandId") REFERENCES "DirectorRuntimeCommand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectorRuntimeCheckpoint" ADD CONSTRAINT "DirectorRuntimeCheckpoint_runtimeId_fkey" FOREIGN KEY ("runtimeId") REFERENCES "DirectorRuntimeInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectorRuntimeCheckpoint" ADD CONSTRAINT "DirectorRuntimeCheckpoint_commandId_fkey" FOREIGN KEY ("commandId") REFERENCES "DirectorRuntimeCommand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectorRuntimeCheckpoint" ADD CONSTRAINT "DirectorRuntimeCheckpoint_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "DirectorRuntimeExecution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectorRuntimeEvent" ADD CONSTRAINT "DirectorRuntimeEvent_runtimeId_fkey" FOREIGN KEY ("runtimeId") REFERENCES "DirectorRuntimeInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectorRuntimeEvent" ADD CONSTRAINT "DirectorRuntimeEvent_commandId_fkey" FOREIGN KEY ("commandId") REFERENCES "DirectorRuntimeCommand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectorRuntimeEvent" ADD CONSTRAINT "DirectorRuntimeEvent_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "DirectorRuntimeExecution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectorRun" ADD CONSTRAINT "DirectorRun_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "NovelWorkflowTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectorRun" ADD CONSTRAINT "DirectorRun_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectorStepRun" ADD CONSTRAINT "DirectorStepRun_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DirectorRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectorStepRun" ADD CONSTRAINT "DirectorStepRun_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "NovelWorkflowTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectorLlmUsageRecord" ADD CONSTRAINT "DirectorLlmUsageRecord_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectorLlmUsageRecord" ADD CONSTRAINT "DirectorLlmUsageRecord_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "NovelWorkflowTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectorLlmUsageRecord" ADD CONSTRAINT "DirectorLlmUsageRecord_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DirectorRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectorLlmUsageRecord" ADD CONSTRAINT "DirectorLlmUsageRecord_stepIdempotencyKey_fkey" FOREIGN KEY ("stepIdempotencyKey") REFERENCES "DirectorStepRun"("idempotencyKey") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectorEvent" ADD CONSTRAINT "DirectorEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DirectorRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectorEvent" ADD CONSTRAINT "DirectorEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "NovelWorkflowTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectorEvent" ADD CONSTRAINT "DirectorEvent_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectorArtifact" ADD CONSTRAINT "DirectorArtifact_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DirectorRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectorArtifact" ADD CONSTRAINT "DirectorArtifact_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "NovelWorkflowTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectorArtifact" ADD CONSTRAINT "DirectorArtifact_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectorArtifactDependency" ADD CONSTRAINT "DirectorArtifactDependency_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "DirectorArtifact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectorArtifactDependency" ADD CONSTRAINT "DirectorArtifactDependency_dependsOnArtifactId_fkey" FOREIGN KEY ("dependsOnArtifactId") REFERENCES "DirectorArtifact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoDirectorAutoApprovalRecord" ADD CONSTRAINT "AutoDirectorAutoApprovalRecord_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "NovelWorkflowTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoDirectorAutoApprovalRecord" ADD CONSTRAINT "AutoDirectorAutoApprovalRecord_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryStateSnapshot" ADD CONSTRAINT "StoryStateSnapshot_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryStateSnapshot" ADD CONSTRAINT "StoryStateSnapshot_sourceChapterId_fkey" FOREIGN KEY ("sourceChapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryStateSnapshotArchive" ADD CONSTRAINT "StoryStateSnapshotArchive_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterState" ADD CONSTRAINT "CharacterState_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "StoryStateSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterState" ADD CONSTRAINT "CharacterState_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RelationState" ADD CONSTRAINT "RelationState_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "StoryStateSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RelationState" ADD CONSTRAINT "RelationState_sourceCharacterId_fkey" FOREIGN KEY ("sourceCharacterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RelationState" ADD CONSTRAINT "RelationState_targetCharacterId_fkey" FOREIGN KEY ("targetCharacterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InformationState" ADD CONSTRAINT "InformationState_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "StoryStateSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForeshadowState" ADD CONSTRAINT "ForeshadowState_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "StoryStateSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForeshadowState" ADD CONSTRAINT "ForeshadowState_setupChapterId_fkey" FOREIGN KEY ("setupChapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForeshadowState" ADD CONSTRAINT "ForeshadowState_payoffChapterId_fkey" FOREIGN KEY ("payoffChapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenConflict" ADD CONSTRAINT "OpenConflict_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenConflict" ADD CONSTRAINT "OpenConflict_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenConflict" ADD CONSTRAINT "OpenConflict_sourceSnapshotId_fkey" FOREIGN KEY ("sourceSnapshotId") REFERENCES "StoryStateSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoffLedgerItem" ADD CONSTRAINT "PayoffLedgerItem_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoffLedgerItem" ADD CONSTRAINT "PayoffLedgerItem_lastTouchedChapterId_fkey" FOREIGN KEY ("lastTouchedChapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoffLedgerItem" ADD CONSTRAINT "PayoffLedgerItem_setupChapterId_fkey" FOREIGN KEY ("setupChapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoffLedgerItem" ADD CONSTRAINT "PayoffLedgerItem_payoffChapterId_fkey" FOREIGN KEY ("payoffChapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoffLedgerItem" ADD CONSTRAINT "PayoffLedgerItem_lastSnapshotId_fkey" FOREIGN KEY ("lastSnapshotId") REFERENCES "StoryStateSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterResourceLedgerItem" ADD CONSTRAINT "CharacterResourceLedgerItem_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterResourceLedgerItem" ADD CONSTRAINT "CharacterResourceLedgerItem_ownerCharacterId_fkey" FOREIGN KEY ("ownerCharacterId") REFERENCES "Character"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterResourceLedgerItem" ADD CONSTRAINT "CharacterResourceLedgerItem_holderCharacterId_fkey" FOREIGN KEY ("holderCharacterId") REFERENCES "Character"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterResourceLedgerItem" ADD CONSTRAINT "CharacterResourceLedgerItem_introducedChapterId_fkey" FOREIGN KEY ("introducedChapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterResourceLedgerItem" ADD CONSTRAINT "CharacterResourceLedgerItem_lastTouchedChapterId_fkey" FOREIGN KEY ("lastTouchedChapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterResourceEvent" ADD CONSTRAINT "CharacterResourceEvent_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterResourceEvent" ADD CONSTRAINT "CharacterResourceEvent_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "CharacterResourceLedgerItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterResourceEvent" ADD CONSTRAINT "CharacterResourceEvent_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterResourceEvent" ADD CONSTRAINT "CharacterResourceEvent_actorCharacterId_fkey" FOREIGN KEY ("actorCharacterId") REFERENCES "Character"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterResourceEvent" ADD CONSTRAINT "CharacterResourceEvent_fromHolderCharacterId_fkey" FOREIGN KEY ("fromHolderCharacterId") REFERENCES "Character"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterResourceEvent" ADD CONSTRAINT "CharacterResourceEvent_toHolderCharacterId_fkey" FOREIGN KEY ("toHolderCharacterId") REFERENCES "Character"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanonicalStateVersion" ADD CONSTRAINT "CanonicalStateVersion_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanonicalStateVersion" ADD CONSTRAINT "CanonicalStateVersion_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StateChangeProposal" ADD CONSTRAINT "StateChangeProposal_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StateChangeProposal" ADD CONSTRAINT "StateChangeProposal_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StateChangeProposal" ADD CONSTRAINT "StateChangeProposal_committedVersionId_fkey" FOREIGN KEY ("committedVersionId") REFERENCES "CanonicalStateVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryPlan" ADD CONSTRAINT "StoryPlan_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryPlan" ADD CONSTRAINT "StoryPlan_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryPlan" ADD CONSTRAINT "StoryPlan_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "StoryPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryPlan" ADD CONSTRAINT "StoryPlan_sourceStateSnapshotId_fkey" FOREIGN KEY ("sourceStateSnapshotId") REFERENCES "StoryStateSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterPlanScene" ADD CONSTRAINT "ChapterPlanScene_planId_fkey" FOREIGN KEY ("planId") REFERENCES "StoryPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplanRun" ADD CONSTRAINT "ReplanRun_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplanRun" ADD CONSTRAINT "ReplanRun_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplanRun" ADD CONSTRAINT "ReplanRun_sourcePlanId_fkey" FOREIGN KEY ("sourcePlanId") REFERENCES "StoryPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditReport" ADD CONSTRAINT "AuditReport_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditReport" ADD CONSTRAINT "AuditReport_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditIssue" ADD CONSTRAINT "AuditIssue_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "AuditReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeDocument" ADD CONSTRAINT "KnowledgeDocument_activeVersionId_fkey" FOREIGN KEY ("activeVersionId") REFERENCES "KnowledgeDocumentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeDocumentVersion" ADD CONSTRAINT "KnowledgeDocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "KnowledgeDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentChapter" ADD CONSTRAINT "DocumentChapter_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "KnowledgeDocumentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeBinding" ADD CONSTRAINT "KnowledgeBinding_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "KnowledgeDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookAnalysis" ADD CONSTRAINT "BookAnalysis_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "KnowledgeDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookAnalysis" ADD CONSTRAINT "BookAnalysis_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "KnowledgeDocumentVersion"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookAnalysis" ADD CONSTRAINT "BookAnalysis_publishedDocumentId_fkey" FOREIGN KEY ("publishedDocumentId") REFERENCES "KnowledgeDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookAnalysisSourceCache" ADD CONSTRAINT "BookAnalysisSourceCache_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "KnowledgeDocumentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookAnalysisSection" ADD CONSTRAINT "BookAnalysisSection_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "BookAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookAnalysisCharacter" ADD CONSTRAINT "BookAnalysisCharacter_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "BookAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookAnalysisCharacterAppearance" ADD CONSTRAINT "BookAnalysisCharacterAppearance_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "BookAnalysisCharacter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookAnalysisCharacterAppearanceSnapshot" ADD CONSTRAINT "BookAnalysisCharacterAppearanceSnapshot_appearanceId_fkey" FOREIGN KEY ("appearanceId") REFERENCES "BookAnalysisCharacterAppearance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookAnalysisCharacterAppearanceSnapshot" ADD CONSTRAINT "BookAnalysisCharacterAppearanceSnapshot_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "BookAnalysisCharacter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookAnalysisCharacterAppearanceTerm" ADD CONSTRAINT "BookAnalysisCharacterAppearanceTerm_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "BookAnalysisCharacter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookAnalysisCharacterAppearanceTerm" ADD CONSTRAINT "BookAnalysisCharacterAppearanceTerm_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "BookAnalysisCharacterAppearanceSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookAnalysisCharacterAppearanceImage" ADD CONSTRAINT "BookAnalysisCharacterAppearanceImage_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "BookAnalysisCharacterAppearanceSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookAnalysisCharacterAppearanceImage" ADD CONSTRAINT "BookAnalysisCharacterAppearanceImage_generationTaskId_fkey" FOREIGN KEY ("generationTaskId") REFERENCES "ImageGenerationTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookAnalysisCharacterAppearanceImage" ADD CONSTRAINT "BookAnalysisCharacterAppearanceImage_imageAssetId_fkey" FOREIGN KEY ("imageAssetId") REFERENCES "ImageAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookAnalysisCharacterArc" ADD CONSTRAINT "BookAnalysisCharacterArc_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "BookAnalysisCharacter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookAnalysisCharacterScene" ADD CONSTRAINT "BookAnalysisCharacterScene_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "BookAnalysisCharacter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NovelSideEffectJob" ADD CONSTRAINT "NovelSideEffectJob_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NovelFactEntry" ADD CONSTRAINT "NovelFactEntry_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DramaSourceBundle" ADD CONSTRAINT "DramaSourceBundle_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "DramaProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DramaCharacter" ADD CONSTRAINT "DramaCharacter_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "DramaProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DramaEpisode" ADD CONSTRAINT "DramaEpisode_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "DramaProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DramaFact" ADD CONSTRAINT "DramaFact_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "DramaProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DramaCharacterLibrary" ADD CONSTRAINT "DramaCharacterLibrary_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "DramaProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DramaStoryboard" ADD CONSTRAINT "DramaStoryboard_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "DramaProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DramaStoryboard" ADD CONSTRAINT "DramaStoryboard_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "DramaEpisode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DramaShot" ADD CONSTRAINT "DramaShot_storyboardId_fkey" FOREIGN KEY ("storyboardId") REFERENCES "DramaStoryboard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DramaVideoPrompt" ADD CONSTRAINT "DramaVideoPrompt_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "DramaProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DramaVideoPrompt" ADD CONSTRAINT "DramaVideoPrompt_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "DramaEpisode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DramaBatchJob" ADD CONSTRAINT "DramaBatchJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "DramaProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DramaBatchJob" ADD CONSTRAINT "DramaBatchJob_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "DramaEpisode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComicSourceBundle" ADD CONSTRAINT "ComicSourceBundle_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ComicProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComicCharacter" ADD CONSTRAINT "ComicCharacter_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ComicProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComicCharacterAsset" ADD CONSTRAINT "ComicCharacterAsset_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "ComicCharacter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComicCharacterAsset" ADD CONSTRAINT "ComicCharacterAsset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ComicProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComicScene" ADD CONSTRAINT "ComicScene_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ComicProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComicEpisode" ADD CONSTRAINT "ComicEpisode_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ComicProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComicPanel" ADD CONSTRAINT "ComicPanel_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "ComicEpisode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComicFact" ADD CONSTRAINT "ComicFact_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ComicProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComicUploadAsset" ADD CONSTRAINT "ComicUploadAsset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ComicProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComicExportJob" ADD CONSTRAINT "ComicExportJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ComicProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComicBatchJob" ADD CONSTRAINT "ComicBatchJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ComicProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComicBatchJob" ADD CONSTRAINT "ComicBatchJob_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "ComicEpisode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
