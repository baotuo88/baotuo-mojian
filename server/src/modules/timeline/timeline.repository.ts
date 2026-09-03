import type {
  ChapterTimeAnchor,
  StoryTimelineEvent,
  TimelineCheckReport,
  TimelineConstraint,
  TimelineHook,
  TimelineHookResolveMode,
  TimelineIssue,
} from "@ai-novel/shared/types/timeline";
import { prisma } from "../../db/prisma";

function parseJsonArray(value: string | null | undefined): string[] {
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) {
    return fallback;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function stringifyJson(value: unknown): string {
  return JSON.stringify(value ?? []);
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function hookResolveModeRank(mode: TimelineHookResolveMode): number {
  if (mode === "immediate") {
    return 0;
  }
  if (mode === "short_arc") {
    return 1;
  }
  return 2;
}

function hookPriorityRank(priority: TimelineHook["priority"]): number {
  if (priority === "critical") {
    return 0;
  }
  if (priority === "high") {
    return 1;
  }
  if (priority === "medium") {
    return 2;
  }
  return 3;
}

function deriveHookDeadline(
  resolveMode: TimelineHookResolveMode,
  createdInChapterIndex: number,
): number | null {
  if (resolveMode === "immediate") {
    return createdInChapterIndex + 1;
  }
  if (resolveMode === "short_arc") {
    return createdInChapterIndex + 2;
  }
  return null;
}

// 钩子上下文窗口边界：先扫描最新的一批钩子，再按优先级/最近处理分窗截取，
// 避免超长篇下按"最旧优先"截断会静默丢弃最新连续性线索。
const HOOK_WINDOW_SCAN_LIMIT = 200;
const OPEN_HOOK_CONTEXT_LIMIT = 8;
const ADDRESSED_HOOK_CONTEXT_LIMIT = 5;

function compareOpenHooks(left: TimelineHook, right: TimelineHook): number {
  const blockingDiff = Number(right.blocking) - Number(left.blocking);
  if (blockingDiff !== 0) {
    return blockingDiff;
  }
  const resolveDiff = hookResolveModeRank(left.resolveMode) - hookResolveModeRank(right.resolveMode);
  if (resolveDiff !== 0) {
    return resolveDiff;
  }
  const priorityDiff = hookPriorityRank(left.priority) - hookPriorityRank(right.priority);
  if (priorityDiff !== 0) {
    return priorityDiff;
  }
  if (left.createdInChapterIndex !== right.createdInChapterIndex) {
    // 同等优先级下保留最新，避免丢弃当前连续性线索
    return right.createdInChapterIndex - left.createdInChapterIndex;
  }
  return right.updatedAt.localeCompare(left.updatedAt);
}

function compareAddressedHooks(left: TimelineHook, right: TimelineHook): number {
  const leftIndex = left.resolvedInChapterIndex ?? left.createdInChapterIndex;
  const rightIndex = right.resolvedInChapterIndex ?? right.createdInChapterIndex;
  if (leftIndex !== rightIndex) {
    // 最近处理的优先
    return rightIndex - leftIndex;
  }
  return right.updatedAt.localeCompare(left.updatedAt);
}

/**
 * 从"最新一批"钩子中选取本章上下文窗口。open 与 addressed 分窗：
 * - open：blocking > resolveMode > priority，最新优先兜底，默认上限 8；
 * - addressed：最近处理优先，默认上限 5。
 * 输出顺序保证 open 在前、addressed 在后，且各自已按优先级排序。
 */
export function selectHookContextWindow(
  hooks: TimelineHook[],
  limits: { open?: number; addressed?: number } = {},
): TimelineHook[] {
  const openLimit = limits.open ?? OPEN_HOOK_CONTEXT_LIMIT;
  const addressedLimit = limits.addressed ?? ADDRESSED_HOOK_CONTEXT_LIMIT;
  const open = hooks.filter((hook) => hook.status === "open");
  const addressed = hooks.filter((hook) => hook.status === "addressed");
  return [
    ...[...open].sort(compareOpenHooks).slice(0, openLimit),
    ...[...addressed].sort(compareAddressedHooks).slice(0, addressedLimit),
  ];
}

type EventRow = Awaited<ReturnType<typeof prisma.storyTimelineEvent.findMany>>[number];
type AnchorRow = Awaited<ReturnType<typeof prisma.chapterTimeAnchor.findFirst>>;
type HookRow = Awaited<ReturnType<typeof prisma.timelineHook.findMany>>[number];
type ConstraintRow = Awaited<ReturnType<typeof prisma.timelineConstraint.findMany>>[number];
type ReportRow = Awaited<ReturnType<typeof prisma.timelineCheckReport.findFirst>>;

export function mapTimelineEvent(row: EventRow): StoryTimelineEvent {
  return {
    id: row.id,
    novelId: row.novelId,
    eventOrder: row.eventOrder,
    chapterId: row.chapterId,
    chapterIndex: row.chapterIndex,
    storyDayIndex: row.storyDayIndex,
    storyTimeLabel: row.storyTimeLabel,
    title: row.title,
    summary: row.summary,
    type: row.type as StoryTimelineEvent["type"],
    status: row.status as StoryTimelineEvent["status"],
    visibility: row.visibility as StoryTimelineEvent["visibility"],
    source: row.source as StoryTimelineEvent["source"],
    participantIds: parseJsonArray(row.participantIdsJson),
    locationId: row.locationId,
    factionIds: parseJsonArray(row.factionIdsJson),
    prerequisiteEventIds: parseJsonArray(row.prerequisiteIdsJson),
    consequenceEventIds: parseJsonArray(row.consequenceIdsJson),
    stateChanges: parseJson(row.stateChangesJson, []),
    eventKey: row.eventKey,
    confidence: row.confidence,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function mapAnchor(row: NonNullable<AnchorRow>): ChapterTimeAnchor {
  return {
    id: row.id,
    novelId: row.novelId,
    chapterId: row.chapterId,
    chapterIndex: row.chapterIndex,
    storyDayIndex: row.storyDayIndex,
    timeLabel: row.timeLabel,
    startsAfterEventIds: parseJsonArray(row.startsAfterIdsJson),
    plannedEventIds: parseJsonArray(row.plannedEventIdsJson),
    endedWithEventIds: parseJsonArray(row.endedWithIdsJson),
    previousHookIds: parseJsonArray(row.previousHookIdsJson),
    nextHookIds: parseJsonArray(row.nextHookIdsJson),
    forbiddenEventIds: parseJsonArray(row.forbiddenEventIdsJson),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

export function mapTimelineHook(row: HookRow): TimelineHook {
  const resolveMode = (row.resolveMode as TimelineHookResolveMode | null | undefined) ?? "long_arc";
  const blocking = row.blocking ?? false;
  return {
    id: row.id,
    novelId: row.novelId,
    createdInChapterId: row.createdInChapterId,
    createdInChapterIndex: row.createdInChapterIndex,
    expectedResolveByChapterIndex: row.expectedResolveByChapterIndex,
    resolveMode,
    blocking,
    resolvedInChapterId: row.resolvedInChapterId,
    resolvedInChapterIndex: row.resolvedInChapterIndex,
    title: row.title,
    description: row.description,
    status: row.status as TimelineHook["status"],
    priority: row.priority as TimelineHook["priority"],
    relatedEventIds: parseJsonArray(row.relatedEventIdsJson),
    participantIds: parseJsonArray(row.participantIdsJson),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function mapConstraint(row: ConstraintRow): TimelineConstraint {
  return {
    id: row.id,
    novelId: row.novelId,
    chapterId: row.chapterId,
    chapterIndex: row.chapterIndex,
    type: row.type as TimelineConstraint["type"],
    severity: row.severity as TimelineConstraint["severity"],
    description: row.description,
    relatedEventIds: parseJsonArray(row.relatedEventIdsJson),
    relatedHookIds: parseJsonArray(row.relatedHookIdsJson),
    relatedCharacterIds: parseJsonArray(row.relatedCharacterIdsJson),
    active: row.active,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function mapReport(row: NonNullable<ReportRow>): TimelineCheckReport {
  return {
    id: row.id,
    novelId: row.novelId,
    chapterId: row.chapterId,
    chapterIndex: row.chapterIndex,
    status: row.status as TimelineCheckReport["status"],
    score: row.score,
    issues: parseJson<TimelineIssue[]>(row.issuesJson, []),
    createdAt: toIso(row.createdAt),
  };
}

export interface TimelineRepository {
  listEventsBeforeChapter(input: {
    novelId: string;
    chapterIndex: number;
    limit?: number;
  }): Promise<StoryTimelineEvent[]>;
  listPlannedEventsForChapter(input: { novelId: string; chapterIndex: number }): Promise<StoryTimelineEvent[]>;
  listForbiddenEventsForChapter(input: { novelId: string; chapterIndex: number }): Promise<StoryTimelineEvent[]>;
  listOpenHooks(input: { novelId: string; chapterIndex: number }): Promise<TimelineHook[]>;
  listActiveConstraints(input: { novelId: string; chapterId?: string; chapterIndex: number }): Promise<TimelineConstraint[]>;
  getChapterTimeAnchor(input: { novelId: string; chapterId: string }): Promise<ChapterTimeAnchor | null>;
  getLatestCheckReport(input: { novelId: string; chapterId: string }): Promise<TimelineCheckReport | null>;
  upsertChapterTimeAnchor(input: Omit<ChapterTimeAnchor, "id" | "createdAt" | "updatedAt">): Promise<ChapterTimeAnchor>;
  saveExtractedEvents(events: Array<Omit<StoryTimelineEvent, "id" | "createdAt" | "updatedAt">>): Promise<StoryTimelineEvent[]>;
  createHooks(hooks: Array<{
    novelId: string;
    createdInChapterId: string;
    createdInChapterIndex: number;
    expectedResolveByChapterIndex?: number | null;
    title: string;
    description: string;
    priority: TimelineHook["priority"];
    resolveMode?: TimelineHookResolveMode;
    blocking?: boolean;
    relatedEventIds?: string[];
    participantIds?: string[];
  }>): Promise<void>;
  markHooksAddressed(input: { hookIds: string[]; chapterId: string; chapterIndex: number; resolved?: boolean }): Promise<void>;
  expireOverdueImmediateHooks(input: { novelId: string; chapterId: string; chapterIndex: number }): Promise<void>;
  saveCheckReport(report: Omit<TimelineCheckReport, "id" | "createdAt">): Promise<TimelineCheckReport>;
}

export class PrismaTimelineRepository implements TimelineRepository {
  async listEventsBeforeChapter(input: { novelId: string; chapterIndex: number; limit?: number }): Promise<StoryTimelineEvent[]> {
    const rows = await prisma.storyTimelineEvent.findMany({
      where: {
        novelId: input.novelId,
        status: { in: ["occurred", "foreshadowed", "resolved"] },
        OR: [
          { chapterIndex: { lt: input.chapterIndex } },
          { chapterIndex: null, eventOrder: { lt: input.chapterIndex * 1000 } },
        ],
      },
      orderBy: [{ eventOrder: "desc" }, { updatedAt: "desc" }],
      take: input.limit ?? 20,
    });
    return rows.reverse().map(mapTimelineEvent);
  }

  async listPlannedEventsForChapter(input: { novelId: string; chapterIndex: number }): Promise<StoryTimelineEvent[]> {
    const rows = await prisma.storyTimelineEvent.findMany({
      where: {
        novelId: input.novelId,
        status: "planned",
        chapterIndex: input.chapterIndex,
      },
      orderBy: [{ eventOrder: "asc" }, { createdAt: "asc" }],
    });
    return rows.map(mapTimelineEvent);
  }

  async listForbiddenEventsForChapter(input: { novelId: string; chapterIndex: number }): Promise<StoryTimelineEvent[]> {
    const rows = await prisma.storyTimelineEvent.findMany({
      where: {
        novelId: input.novelId,
        status: "planned",
        chapterIndex: { gt: input.chapterIndex },
      },
      orderBy: [{ chapterIndex: "asc" }, { eventOrder: "asc" }],
      take: 12,
    });
    return rows.map(mapTimelineEvent);
  }

  async listOpenHooks(input: { novelId: string; chapterIndex: number }): Promise<TimelineHook[]> {
    // 超长篇窗口策略：不再按 createdInChapterIndex asc + take 12（那会保留最旧钩子、
    // 静默丢弃最新连续性线索）。改为先取最新一批，再在内存按优先级分窗选取。
    const rows = await prisma.timelineHook.findMany({
      where: {
        novelId: input.novelId,
        status: { in: ["open", "addressed"] },
        createdInChapterIndex: { lt: input.chapterIndex },
      },
      orderBy: [{ createdInChapterIndex: "desc" }, { updatedAt: "desc" }],
      take: HOOK_WINDOW_SCAN_LIMIT,
    });
    return selectHookContextWindow(rows.map(mapTimelineHook));
  }

  async listActiveConstraints(input: { novelId: string; chapterId?: string; chapterIndex: number }): Promise<TimelineConstraint[]> {
    const rows = await prisma.timelineConstraint.findMany({
      where: {
        novelId: input.novelId,
        active: true,
        OR: [
          { chapterId: input.chapterId ?? undefined },
          { chapterIndex: input.chapterIndex },
          { chapterId: null, chapterIndex: null },
        ],
      },
      orderBy: [{ severity: "desc" }, { updatedAt: "desc" }],
      take: 20,
    });
    return rows.map(mapConstraint);
  }

  async getChapterTimeAnchor(input: { novelId: string; chapterId: string }): Promise<ChapterTimeAnchor | null> {
    const row = await prisma.chapterTimeAnchor.findUnique({
      where: { novelId_chapterId: { novelId: input.novelId, chapterId: input.chapterId } },
    });
    return row ? mapAnchor(row) : null;
  }

  async getLatestCheckReport(input: { novelId: string; chapterId: string }): Promise<TimelineCheckReport | null> {
    const row = await prisma.timelineCheckReport.findFirst({
      where: { novelId: input.novelId, chapterId: input.chapterId },
      orderBy: { createdAt: "desc" },
    });
    return row ? mapReport(row) : null;
  }

  async upsertChapterTimeAnchor(input: Omit<ChapterTimeAnchor, "id" | "createdAt" | "updatedAt">): Promise<ChapterTimeAnchor> {
    const data = {
      chapterIndex: input.chapterIndex,
      storyDayIndex: input.storyDayIndex ?? null,
      timeLabel: input.timeLabel,
      startsAfterIdsJson: stringifyJson(input.startsAfterEventIds),
      plannedEventIdsJson: stringifyJson(input.plannedEventIds),
      endedWithIdsJson: stringifyJson(input.endedWithEventIds),
      previousHookIdsJson: stringifyJson(input.previousHookIds),
      nextHookIdsJson: stringifyJson(input.nextHookIds),
      forbiddenEventIdsJson: stringifyJson(input.forbiddenEventIds),
    };
    const row = await prisma.chapterTimeAnchor.upsert({
      where: { novelId_chapterId: { novelId: input.novelId, chapterId: input.chapterId } },
      create: {
        novelId: input.novelId,
        chapterId: input.chapterId,
        ...data,
      },
      update: data,
    });
    return mapAnchor(row);
  }

  async saveExtractedEvents(events: Array<Omit<StoryTimelineEvent, "id" | "createdAt" | "updatedAt">>): Promise<StoryTimelineEvent[]> {
    const created: StoryTimelineEvent[] = [];
    for (const event of events) {
      const row = await prisma.storyTimelineEvent.create({
        data: {
          novelId: event.novelId,
          chapterId: event.chapterId ?? null,
          chapterIndex: event.chapterIndex ?? null,
          eventOrder: event.eventOrder,
          storyDayIndex: event.storyDayIndex ?? null,
          storyTimeLabel: event.storyTimeLabel ?? null,
          title: event.title,
          summary: event.summary,
          type: event.type,
          status: event.status,
          visibility: event.visibility,
          source: event.source,
          participantIdsJson: stringifyJson(event.participantIds),
          locationId: event.locationId ?? null,
          factionIdsJson: stringifyJson(event.factionIds),
          prerequisiteIdsJson: stringifyJson(event.prerequisiteEventIds),
          consequenceIdsJson: stringifyJson(event.consequenceEventIds),
          stateChangesJson: stringifyJson(event.stateChanges),
          eventKey: event.eventKey ?? null,
          confidence: event.confidence,
        },
      });
      created.push(mapTimelineEvent(row));
    }
    return created;
  }

  async createHooks(hooks: Array<{
    novelId: string;
    createdInChapterId: string;
    createdInChapterIndex: number;
    expectedResolveByChapterIndex?: number | null;
    title: string;
    description: string;
    priority: TimelineHook["priority"];
    resolveMode?: TimelineHookResolveMode;
    blocking?: boolean;
    relatedEventIds?: string[];
    participantIds?: string[];
  }>): Promise<void> {
    if (hooks.length === 0) {
      return;
    }
    await prisma.timelineHook.createMany({
      data: hooks.map((hook) => ({
        novelId: hook.novelId,
        createdInChapterId: hook.createdInChapterId,
        createdInChapterIndex: hook.createdInChapterIndex,
        expectedResolveByChapterIndex: hook.expectedResolveByChapterIndex ?? deriveHookDeadline(
          hook.resolveMode ?? "long_arc",
          hook.createdInChapterIndex,
        ),
        resolveMode: hook.resolveMode ?? "long_arc",
        blocking: hook.blocking ?? (hook.resolveMode === "immediate"),
        title: hook.title,
        description: hook.description,
        status: "open",
        priority: hook.priority,
        relatedEventIdsJson: stringifyJson(hook.relatedEventIds ?? []),
        participantIdsJson: stringifyJson(hook.participantIds ?? []),
      })),
    });
  }

  async markHooksAddressed(input: { hookIds: string[]; chapterId: string; chapterIndex: number; resolved?: boolean }): Promise<void> {
    if (input.hookIds.length === 0) {
      return;
    }
    await prisma.timelineHook.updateMany({
      where: { id: { in: input.hookIds } },
      data: {
        status: input.resolved ? "resolved" : "addressed",
        resolvedInChapterId: input.chapterId,
        resolvedInChapterIndex: input.chapterIndex,
      },
    });
  }

  async expireOverdueImmediateHooks(input: { novelId: string; chapterId: string; chapterIndex: number }): Promise<void> {
    await prisma.timelineHook.updateMany({
      where: {
        novelId: input.novelId,
        status: { in: ["open", "addressed"] },
        blocking: true,
        resolveMode: "immediate",
        createdInChapterIndex: { lt: input.chapterIndex },
        OR: [
          { expectedResolveByChapterIndex: null },
          { expectedResolveByChapterIndex: { lte: input.chapterIndex } },
        ],
      },
      data: {
        status: "expired",
        resolvedInChapterId: input.chapterId,
        resolvedInChapterIndex: input.chapterIndex,
      },
    });
  }

  async saveCheckReport(report: Omit<TimelineCheckReport, "id" | "createdAt">): Promise<TimelineCheckReport> {
    const row = await prisma.timelineCheckReport.create({
      data: {
        novelId: report.novelId,
        chapterId: report.chapterId,
        chapterIndex: report.chapterIndex,
        status: report.status,
        score: report.score,
        issuesJson: stringifyJson(report.issues),
      },
    });
    return mapReport(row);
  }
}

export const timelineRepository = new PrismaTimelineRepository();
