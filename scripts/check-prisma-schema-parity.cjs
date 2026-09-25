#!/usr/bin/env node
/**
 * 校验 PostgreSQL(schema.prisma) 与 SQLite(schema.sqlite.prisma) 两份 schema 结构一致。
 * 双 schema 靠人工同步，任何漂移都会让桌面版(SQLite)与服务器版(Postgres)行为不一致。
 *
 * 比较维度：
 *   - model / enum 名称
 *   - 字段名
 *   - 字段类型（含 `?` 可空、`[]` 列表修饰符）
 *   - 字段内联属性（@id / @unique / @default(...) / @relation(... onDelete ...) / @updatedAt / @map ...）
 *   - 模型块级属性（@@id / @@unique / @@index / @@map ...）
 *   - enum 取值（含取值上的 @map）
 *
 * 仅 provider、注释、空白对齐差异属预期（本脚本会剥离，不参与比较）。
 * 说明：两份 schema 目前不使用任何 `@db.*` 原生类型注解；若将来引入，需在此调整类型比较策略。
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const FILES = {
  postgres: path.join(ROOT, "server/src/prisma/schema.prisma"),
  sqlite: path.join(ROOT, "server/src/prisma/schema.sqlite.prisma"),
};

// 去除行尾/整行 `//` 注释，但不误伤字符串字面量内的 `//`（如 @default("a//b")）。
function stripComment(line) {
  let inString = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      inString = !inString;
    } else if (!inString && char === "/" && line[i + 1] === "/") {
      return line.slice(0, i);
    }
  }
  return line;
}

// 从字段属性串中提取每个 `@attr` 或 `@attr(...)`（括号支持嵌套，如 @default(cuid())）。
// 括号内空白统一折叠，返回排序后的属性数组，保证顺序无关。
function parseAttributes(source) {
  const attrs = [];
  let i = 0;
  while (i < source.length) {
    if (source[i] !== "@") {
      i += 1;
      continue;
    }
    let j = i + 1;
    while (j < source.length && /[\w.]/.test(source[j])) {
      j += 1;
    }
    let attr = source.slice(i, j);
    if (source[j] === "(") {
      let depth = 0;
      let k = j;
      for (; k < source.length; k += 1) {
        if (source[k] === "(") {
          depth += 1;
        } else if (source[k] === ")") {
          depth -= 1;
          if (depth === 0) {
            k += 1;
            break;
          }
        }
      }
      attr += source.slice(j, k).replace(/\s+/g, " ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")");
      i = k;
    } else {
      i = j;
    }
    attrs.push(attr);
  }
  return attrs.sort();
}

// 解析单份 schema：
//   models -> Map<modelName, { fields: Map<fieldName, signature>, blockAttrs: Set<string> }>
//   enums  -> Map<enumName, Map<valueName, attrsSignature>>
function parseSchema(file) {
  const src = fs.readFileSync(file, "utf8");
  const models = new Map();
  const enums = new Map();
  let current = null;
  let currentKind = null;

  for (const rawLine of src.split("\n")) {
    const line = stripComment(rawLine).trim();
    if (!line) continue;

    const modelMatch = line.match(/^model\s+(\w+)\s*\{/);
    const enumMatch = line.match(/^enum\s+(\w+)\s*\{/);
    if (modelMatch) {
      current = modelMatch[1];
      currentKind = "model";
      models.set(current, { fields: new Map(), blockAttrs: new Set() });
      continue;
    }
    if (enumMatch) {
      current = enumMatch[1];
      currentKind = "enum";
      enums.set(current, new Map());
      continue;
    }
    if (line.startsWith("}")) {
      current = null;
      currentKind = null;
      continue;
    }
    if (!current) continue;

    if (currentKind === "model") {
      const model = models.get(current);
      if (line.startsWith("@@")) {
        model.blockAttrs.add(line.replace(/\s+/g, " ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")"));
        continue;
      }
      const fieldMatch = line.match(/^(\w+)\s+(\S+)(.*)$/);
      if (fieldMatch) {
        const name = fieldMatch[1];
        const type = fieldMatch[2];
        const attrs = parseAttributes(fieldMatch[3]);
        const signature = attrs.length > 0 ? `${type} ${attrs.join(" ")}` : type;
        model.fields.set(name, signature);
      }
      continue;
    }

    // enum value（可能带 @map）
    const valueMatch = line.match(/^(\w+)(.*)$/);
    if (valueMatch) {
      const value = valueMatch[1];
      const attrs = parseAttributes(valueMatch[2]);
      enums.get(current).set(value, attrs.join(" "));
    }
  }

  return { models, enums };
}

function diffPresence(pgMap, liteMap, label, problems) {
  for (const name of pgMap.keys()) {
    if (!liteMap.has(name)) problems.push(`${label} "${name}" 仅在 postgres 中存在`);
  }
  for (const name of liteMap.keys()) {
    if (!pgMap.has(name)) problems.push(`${label} "${name}" 仅在 sqlite 中存在`);
  }
}

function diffModels(pg, lite, problems) {
  diffPresence(pg, lite, "model", problems);
  for (const [name, pgModel] of pg) {
    const liteModel = lite.get(name);
    if (!liteModel) continue;

    // 字段存在性
    for (const field of pgModel.fields.keys()) {
      if (!liteModel.fields.has(field)) problems.push(`model "${name}" 字段 "${field}" 缺失于 sqlite`);
    }
    for (const field of liteModel.fields.keys()) {
      if (!pgModel.fields.has(field)) problems.push(`model "${name}" 字段 "${field}" 缺失于 postgres`);
    }
    // 字段签名（类型 + 属性）
    for (const [field, pgSig] of pgModel.fields) {
      const liteSig = liteModel.fields.get(field);
      if (liteSig !== undefined && liteSig !== pgSig) {
        problems.push(`model "${name}" 字段 "${field}" 定义漂移：postgres=[${pgSig}] sqlite=[${liteSig}]`);
      }
    }
    // 块级属性（@@index / @@unique / @@id / @@map ...）
    for (const attr of pgModel.blockAttrs) {
      if (!liteModel.blockAttrs.has(attr)) problems.push(`model "${name}" 块级属性缺失于 sqlite：${attr}`);
    }
    for (const attr of liteModel.blockAttrs) {
      if (!pgModel.blockAttrs.has(attr)) problems.push(`model "${name}" 块级属性缺失于 postgres：${attr}`);
    }
  }
}

function diffEnums(pg, lite, problems) {
  diffPresence(pg, lite, "enum", problems);
  for (const [name, pgValues] of pg) {
    const liteValues = lite.get(name);
    if (!liteValues) continue;
    for (const [value, pgSig] of pgValues) {
      if (!liteValues.has(value)) {
        problems.push(`enum "${name}" 取值 "${value}" 缺失于 sqlite`);
      } else if (liteValues.get(value) !== pgSig) {
        problems.push(`enum "${name}" 取值 "${value}" 定义漂移：postgres=[${pgSig}] sqlite=[${liteValues.get(value)}]`);
      }
    }
    for (const value of liteValues.keys()) {
      if (!pgValues.has(value)) problems.push(`enum "${name}" 取值 "${value}" 缺失于 postgres`);
    }
  }
}

const pg = parseSchema(FILES.postgres);
const lite = parseSchema(FILES.sqlite);
const problems = [];
diffModels(pg.models, lite.models, problems);
diffEnums(pg.enums, lite.enums, problems);

if (problems.length > 0) {
  console.error(`Prisma 双 schema 不一致，共 ${problems.length} 处：`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

let fieldCount = 0;
let blockAttrCount = 0;
for (const model of pg.models.values()) {
  fieldCount += model.fields.size;
  blockAttrCount += model.blockAttrs.size;
}
console.log(
  `Prisma 双 schema 校验通过：${pg.models.size} 个 model（${fieldCount} 字段 / ${blockAttrCount} 块级属性）、` +
    `${pg.enums.size} 个 enum，字段类型/属性/索引/级联/默认值均一致。`,
);
