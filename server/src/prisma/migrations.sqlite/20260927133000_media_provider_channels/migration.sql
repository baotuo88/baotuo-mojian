-- 媒体通道（MediaProvider）：短剧/漫画/漫剧的配音、视频、配乐统一走可配置通道。
-- 一家供应商一条记录，支持 OpenAI 兼容自定义端点（NewAPI、One-API、中转站等）。
-- SQLite 侧等价于 Postgres 迁移，仅类型与主键写法不同。
CREATE TABLE "MediaProvider" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "protocol" TEXT NOT NULL DEFAULT 'http_json',
    "baseURL" TEXT,
    "apiKey" TEXT,
    "model" TEXT,
    "options" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isBuiltin" BOOLEAN NOT NULL DEFAULT false,
    "supportsRefImages" BOOLEAN NOT NULL DEFAULT false,
    "costPerSecond" REAL NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "MediaProvider_kind_providerKey_key" ON "MediaProvider"("kind", "providerKey");
CREATE INDEX "MediaProvider_kind_isActive_idx" ON "MediaProvider"("kind", "isActive");
