import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";
import { payoffLedgerSyncOutputSchema } from "./payoffLedgerSync.promptSchemas";

const PAYOFF_LEDGER_SYNC_EXAMPLE = {
  items: [
    {
      ledgerKey: "system_hidden_rules",
      identityDecision: {
        action: "create",
        existingLedgerKey: null,
        reason: "当前没有语义相同的既有账本项。",
        confidence: 0.92,
      },
      title: "系统隐藏规则浮出水面",
      summary: "主角第一次确认隐藏规则真实存在，后续必须继续推进并兑现其代价。",
      scopeType: "book",
      currentStatus: "setup",
      targetStartChapterOrder: 3,
      targetEndChapterOrder: 40,
      firstSeenChapterOrder: 3,
      lastTouchedChapterOrder: 9,
      setupChapterOrder: 3,
      sourceRefs: [
        {
          kind: "major_payoff",
          refLabel: "第一次看见系统异常提示",
          chapterOrder: 3,
          volumeSortOrder: 1,
        },
      ],
      evidence: [
        {
          summary: "第三章已经明确出现异常提示并影响主角判断。",
          chapterOrder: 3,
        },
      ],
      riskSignals: [
        {
          code: "payoff_missing_progress",
          severity: "medium",
          summary: "已经进入应持续推进阶段，但后续还缺少新的触碰动作。",
        },
      ],
      statusReason: "已建立核心铺垫，但仍未进入明确兑现窗口。",
      confidence: 0.82,
    },
  ],
};

export interface PayoffLedgerSyncPromptInput {
  novelTitle: string;
  existingLedgerItems?: Array<{
    ledgerKey: string;
    title: string;
    summary: string;
    currentStatus: string;
    scopeType: string;
    targetStartChapterOrder: number | null;
    targetEndChapterOrder: number | null;
  }>;
  bookContractPayoffs?: Array<{
    refId: string;
    refLabel: string;
    payoff: string;
    targetStartChapterOrder: number;
    targetEndChapterOrder: number;
  }>;
  activeVolumeSummary: string;
  latestChapterContext: string;
  majorPayoffsText: string;
  openPayoffsText: string;
  chapterPayoffRefsText: string;
  foreshadowStatesText: string;
  payoffConflictsText: string;
  payoffAuditIssuesText: string;
}

function formatExistingLedgerItems(items: PayoffLedgerSyncPromptInput["existingLedgerItems"]): string {
  if (!items?.length) {
    return "无";
  }
  return items.map((item) => [
    `ledgerKey=${item.ledgerKey}`,
    `标题=${item.title}`,
    `状态=${item.currentStatus}`,
    `范围=${item.scopeType}`,
    item.targetStartChapterOrder != null || item.targetEndChapterOrder != null
      ? `窗口=${item.targetStartChapterOrder ?? "?"}-${item.targetEndChapterOrder ?? "?"}`
      : "",
    `摘要=${item.summary}`,
  ].filter(Boolean).join(" | ")).join("\n");
}

export const payoffLedgerSyncPrompt: PromptAsset<
  PayoffLedgerSyncPromptInput,
  z.infer<typeof payoffLedgerSyncOutputSchema>
> = {
  id: "novel.payoff_ledger.sync",
  version: "v7",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  semanticRetryPolicy: {
    maxAttempts: 1,
  },
  structuredOutputHint: {
    example: PAYOFF_LEDGER_SYNC_EXAMPLE,
    note: [
      "sourceRefs、evidence、riskSignals 始终必须是数组。",
      "sourceRefs.kind 只能是 major_payoff、volume_open_payoff、chapter_payoff_ref、foreshadow_state、open_conflict、audit_issue。",
      "禁止输出旧别名 chapter_payoff 或 volume_open。",
      "scopeType 只能是 book、volume、chapter。",
      "identityDecision.action 只能是 reuse 或 create；reuse 时 existingLedgerKey 必须来自输入的既有账本 key，create 时 existingLedgerKey 必须为空。",
      "identityDecision.reason 必须说明语义上为何复用或新建；confidence 只能是 0-1 数字，拿不准就省略。",
    ].join(" "),
  },
  outputSchema: payoffLedgerSyncOutputSchema,
  render: (input) => [
    new SystemMessage([
      "你是小说伏笔账本同步器，负责把多个来源中的伏笔、兑现安排、兑现证据和异常信号，收敛成唯一的 canonical payoff ledger。",
      "产品服务对象是写作新手，所以你的输出必须稳定、可执行、易于后续系统继续规划，而不是写成长篇分析。",
      "",
      "只输出一个合法 JSON 对象，不要输出 Markdown、解释、注释或任何额外文本。",
      "顶层固定格式只能是 {\"items\":[...]}。",
      "",
      "硬性字段约束：",
      "1. sourceRefs.kind 只能是：major_payoff、volume_open_payoff、chapter_payoff_ref、foreshadow_state、open_conflict、audit_issue。",
      "2. 不要输出旧别名 chapter_payoff 或 volume_open。",
      "3. scopeType 只能是：book、volume、chapter。",
      "4. identityDecision.action 只能是 reuse 或 create。reuse 时 existingLedgerKey 必须来自输入的既有账本 key，create 时 existingLedgerKey 必须为空。",
      "5. identityDecision.reason 必须说明语义上为何复用或新建；confidence 只能是 0-1 数字，拿不准就省略。",
      "6. sourceRefs、evidence、riskSignals 即使只有一项也必须输出数组，不能输出对象或字符串。",
      "",
      "任务目标：",
      "1. 把 major payoffs、open payoffs、chapter payoff refs、foreshadow states、open conflicts 和 payoff audit issues 归并成唯一账本项。",
      "2. 避免把同义重复项拆成多个 ledger item，也不要把明显不同的伏笔强行合并。",
      "3. 对每个输出项先判断其是否与既有账本中的同一线索语义等价：等价时 reuse 并填写该既有 ledgerKey；不等价时 create。不得仅因词面相似合并不同线索。",
      "4. 账本项必须保守、稳定，不能编造输入中不存在的新剧情。",
      "",
      "状态定义：",
      "- setup：刚建立，还未形成明确兑现窗口。",
      "- hinted：已经有铺垫，但还未进入明确待兑现阶段。",
      "- pending_payoff：已经进入应持续跟进、临近兑现或正在推进的阶段。",
      "- paid_off：已经被明确兑现。",
      "- failed：已经明确失效、作废或被推翻。",
      "- overdue：已经超过合理目标窗口仍未兑现，必须被系统重点提醒。",
      "",
      "章节定位规则：",
      "1. 优先返回 setupChapterOrder / payoffChapterOrder。",
      "2. 只有当输入里明确出现了可验证的真实 chapterId 时，才填写 setupChapterId / payoffChapterId。",
      "3. 不要编造 chapterId；拿不准时返回 chapterOrder，不要伪造 ID。",
      "",
      "压缩输出规则：",
      "1. sourceRefs 只保留最强的 0-4 个来源；Book Contract 固定来源不得在压缩时丢失。",
      "2. evidence 最多保留 4 条有章节定位的关键生命周期证据，优先覆盖首次铺垫、最近触碰、部分兑现和最终回收；不要用同义句重复同一证据。",
      "3. riskSignals 只在确有风险时填写，最多保留 2 条。",
      "4. statusReason 用一句短句说明当前状态判断依据，不要写长段。",
      "",
      "判断原则：",
      "0. Book Contract 第 3/10/30 章回报是稳定书级承诺。每个非空来源都必须出现在某个账项的 sourceRefs 中，kind=major_payoff，refId 必须原样保留；允许与语义相同的其他承诺合并，但不得遗漏来源或放宽其截止章。",
      "1. major payoffs 是书级提示源，但只有映射到卷/章窗口后，才允许进入 pending_payoff 或 overdue。",
      "2. 同一 canonical payoff 若同时有卷级窗口和章节窗口，以章节窗口为更强约束。",
      "3. 如果已经有明确兑现证据，应优先标成 paid_off。",
      "4. 如果没有足够铺垫就直接兑现，要保留该项并输出风险信号。",
      "5. 如果已经过了明确目标窗口仍未兑现，要标成 overdue；没有 targetStartChapterOrder / targetEndChapterOrder / payoffChapterOrder / payoffChapterId 时，不要标成 overdue，只能用 pending_payoff 加 riskSignals 提醒。",
      "6. 如果输入里只有提示和铺垫，没有明确兑现证据，不要误判为 paid_off。",
      "",
      "输出必须严格符合 payoffLedgerSyncOutputSchema。",
    ].join("\n")),
    new HumanMessage([
      `小说标题：${input.novelTitle}`,
      "",
      "既有 canonical payoff ledger（只可复用这里列出的 ledgerKey）：",
      formatExistingLedgerItems(input.existingLedgerItems),
      "",
      "Book Contract 阶段回报（稳定书级来源）：",
      (input.bookContractPayoffs ?? []).length > 0
        ? (input.bookContractPayoffs ?? []).map((item) => (
            `${item.refLabel} | refId=${item.refId} | 目标窗口=${item.targetStartChapterOrder}-${item.targetEndChapterOrder} | 承诺=${item.payoff}`
          )).join("\n")
        : "无",
      "",
      "当前激活卷与章节窗口：",
      input.activeVolumeSummary,
      "",
      "最近章节上下文：",
      input.latestChapterContext,
      "",
      "书级 major payoffs：",
      input.majorPayoffsText,
      "",
      "当前卷 open payoffs：",
      input.openPayoffsText,
      "",
      "当前卷 chapter payoff refs：",
      input.chapterPayoffRefsText,
      "",
      "最新 foreshadow states：",
      input.foreshadowStatesText,
      "",
      "相关 open conflicts：",
      input.payoffConflictsText,
      "",
      "最近 payoff 审校问题：",
      input.payoffAuditIssuesText,
      "",
      "输出提醒：",
      "1. kind 只能用规定枚举，禁止使用 chapter_payoff / volume_open。",
      "2. identityDecision.reuse 只能引用上方既有 canonical ledger 的 key。",
      "3. identityDecision.create 时 existingLedgerKey 必须为 null 或省略。",
      "4. confidence 如填写，必须是数字，不要写成字符串。",
      "5. scopeType 只能是 book、volume、chapter。",
    ].join("\n")),
  ],
  postValidate: (output, input) => {
    const ledgerKeySet = new Set<string>();
    const claimedExistingLedgerKeys = new Set<string>();
    const existingByKey = new Map((input?.existingLedgerItems ?? []).map((item) => [item.ledgerKey, item]));
    for (const item of output.items) {
      if (ledgerKeySet.has(item.ledgerKey)) {
        throw new Error(`重复的 ledgerKey：${item.ledgerKey}`);
      }
      ledgerKeySet.add(item.ledgerKey);
      if (item.identityDecision.action === "reuse") {
        const existingLedgerKey = item.identityDecision.existingLedgerKey;
        const existing = existingLedgerKey ? existingByKey.get(existingLedgerKey) : null;
        if (!existing || !existingLedgerKey) {
          throw new Error(`伏笔 ${item.ledgerKey} 引用了不存在的既有账本项。`);
        }
        if (existing.currentStatus === "paid_off" || existing.currentStatus === "failed") {
          throw new Error(`伏笔 ${item.ledgerKey} 不能复用已终态账本项 ${existingLedgerKey}。`);
        }
        if (claimedExistingLedgerKeys.has(existingLedgerKey)) {
          throw new Error(`多个伏笔项重复复用既有账本项：${existingLedgerKey}`);
        }
        claimedExistingLedgerKeys.add(existingLedgerKey);
      } else if (item.identityDecision.existingLedgerKey) {
        throw new Error(`新建伏笔 ${item.ledgerKey} 不应引用既有账本项。`);
      }
      if (
        item.targetStartChapterOrder
        && item.targetEndChapterOrder
        && item.targetStartChapterOrder > item.targetEndChapterOrder
      ) {
        throw new Error(`伏笔 ${item.ledgerKey} 的目标章节窗口非法。`);
      }
      if (item.currentStatus === "paid_off" && !item.payoffChapterId && item.payoffChapterOrder == null) {
        throw new Error(`伏笔 ${item.ledgerKey} 已兑现时必须返回 payoffChapterOrder 或 payoffChapterId。`);
      }
    }
    for (const requiredSource of input?.bookContractPayoffs ?? []) {
      const coveringItem = output.items.find((item) => item.sourceRefs.some((source) => (
        source.kind === "major_payoff" && source.refId === requiredSource.refId
      )));
      if (!coveringItem) {
        throw new Error(`缺少 Book Contract 承诺来源：${requiredSource.refId}`);
      }
      if (
        coveringItem.scopeType !== "book"
        || coveringItem.targetEndChapterOrder == null
        || coveringItem.targetEndChapterOrder > requiredSource.targetEndChapterOrder
      ) {
        throw new Error(`Book Contract 承诺 ${requiredSource.refId} 必须保持书级范围和不晚于第 ${requiredSource.targetEndChapterOrder} 章的截止窗口。`);
      }
    }
    return output;
  },
};
