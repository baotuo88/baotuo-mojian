#!/usr/bin/env node
/**
 * 校验 PostgreSQL(schema.prisma) 与 SQLite(schema.sqlite.prisma) 两份 schema 的模型清单一致。
 * 双 schema 靠人工同步，模型漂移会让桌面版(SQLite)与服务器版(Postgres)行为不一致。
 * 仅比较结构标识（model/enum 名称、字段名），provider/原生类型差异属预期。
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const FILES = {
  postgres: path.join(ROOT, "server/src/prisma/schema.prisma"),
  sqlite: path.join(ROOT, "server/src/prisma/schema.sqlite.prisma"),
};

function parseSchema(file) {
  const src = fs.readFileSync(file, "utf8");
  const models = new Map(); // name -> Set<field>
  const enums = new Map();
  let current = null;
  let currentKind = null;
  for (const rawLine of src.split("\n")) {
    const line = rawLine.trim();
    const modelMatch = line.match(/^model\s+(\w+)\s*\{/);
    const enumMatch = line.match(/^enum\s+(\w+)\s*\{/);
    if (modelMatch) {
      current = modelMatch[1];
      currentKind = "model";
      models.set(current, new Set());
      continue;
    }
    if (enumMatch) {
      current = enumMatch[1];
      currentKind = "enum";
      enums.set(current, new Set());
      continue;
    }
    if (line.startsWith("}")) {
      current = null;
      currentKind = null;
      continue;
    }
    if (!current) continue;
    const fieldMatch = line.match(/^(\w+)\s/);
    if (fieldMatch && fieldMatch[1] !== "@@") {
      if (currentKind === "model") models.get(current).add(fieldMatch[1]);
      else enums.get(current).add(fieldMatch[1]);
    }
  }
  return { models, enums };
}

function diffMaps(a, b, label) {
  const problems = [];
  for (const name of a.keys()) {
    if (!b.has(name)) problems.push(`${label} "${name}" 仅在 postgres 中存在`);
  }
  for (const name of b.keys()) {
    if (!a.has(name)) problems.push(`${label} "${name}" 仅在 sqlite 中存在`);
  }
  for (const [name, fields] of a) {
    if (!b.has(name)) continue;
    for (const f of fields) if (!b.get(name).has(f)) problems.push(`${label} "${name}" 字段/取值 "${f}" 缺失于 sqlite`);
    for (const f of b.get(name)) if (!fields.has(f)) problems.push(`${label} "${name}" 字段/取值 "${f}" 缺失于 postgres`);
  }
  return problems;
}

const pg = parseSchema(FILES.postgres);
const lite = parseSchema(FILES.sqlite);
const problems = [
  ...diffMaps(pg.models, lite.models, "model"),
  ...diffMaps(pg.enums, lite.enums, "enum"),
];

if (problems.length > 0) {
  console.error(`Prisma 双 schema 不一致，共 ${problems.length} 处：`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`Prisma 双 schema 校验通过：${pg.models.size} 个 model、${pg.enums.size} 个 enum 结构一致。`);
