// services/novel 模块 facade：外部模块只允许从这里导入根目录能力，不再深入内部文件。
// 分层守则：prompting/ 及 llm/ 属于更底层，禁止 import 本 facade——
// 根服务在模块加载期会实例化单例，底层再回到 facade 会形成加载环；
// 底层需要的纯函数放 @ai-novel/shared/utils/jsonText，schema 直接引用所属源文件。
export {
  buildBookFramingSummary,
} from "./bookFraming";
export {
  chapterConcreteFactSchema,
  chapterSummaryOutputSchema,
} from "./chapterSummarySchemas";
export {
  NovelChapterSummaryService,
} from "./NovelChapterSummaryService";
export {
  characterEvolutionOutputSchema,
  characterWorldCheckOutputSchema,
  novelBiblePayloadSchema,
} from "./novelCoreSchemas";
export {
  novelCreateResourceRecommendationService,
} from "./NovelCreateResourceRecommendationService";
export {
  novelDecisionService,
} from "./NovelDecisionService";
export {
  NovelDraftOptimizeService,
} from "./NovelDraftOptimizeService";
export {
  novelFramingSuggestionService,
} from "./NovelFramingSuggestionService";
export {
  toText,
} from "./novelP0Utils";
export {
  NovelPipelineRuntimeService,
} from "./NovelPipelineRuntimeService";
export {
  novelProductionService,
} from "./NovelProductionService";
export {
  ProductionStatusResult,
  novelProductionStatusService,
} from "./NovelProductionStatusService";
export {
  novelSetupStatusService,
} from "./NovelSetupStatusService";
