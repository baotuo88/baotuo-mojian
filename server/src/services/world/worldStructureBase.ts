import type { World as PrismaWorld } from "@prisma/client";
import type { WorldRule } from "@ai-novel/shared/types/world";

/**
 * 世界结构共享原语：schema 版本常量、id 构造、规则文本格式化与旧字段源类型。
 *
 * 这些是 worldStructure.ts（归一化/旧字段摄取）与 worldStructureSerialize.ts
 * （结构化 → 旧字段反序列化/预览）共同依赖的最小原语，抽出到基模块以避免
 * 双向循环 import。不属于业务规则，仅提供确定性工具能力。
 */

export const WORLD_STRUCTURE_SCHEMA_VERSION = 1;

export type WorldStructureSource = Pick<
  PrismaWorld,
  | "id"
  | "name"
  | "worldType"
  | "description"
  | "overviewSummary"
  | "axioms"
  | "background"
  | "geography"
  | "cultures"
  | "magicSystem"
  | "politics"
  | "races"
  | "religions"
  | "technology"
  | "conflicts"
  | "history"
  | "economy"
  | "factions"
  | "selectedElements"
  | "structureJson"
  | "bindingSupportJson"
  | "structureSchemaVersion"
>;

function slugify(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9\u4e00-\u9fff-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || "item";
}

export function makeId(prefix: string, index: number, preferred?: string): string {
  const suffix = preferred ? slugify(preferred) : String(index + 1);
  return `${prefix}-${suffix}`;
}

export function formatRuleText(rule: WorldRule): string {
  const parts = [rule.summary, rule.cost && `代价：${rule.cost}`, rule.boundary && `边界：${rule.boundary}`, rule.enforcement && `约束：${rule.enforcement}`]
    .filter(Boolean);
  return `${rule.name}${parts.length > 0 ? `：${parts.join("；")}` : ""}`;
}