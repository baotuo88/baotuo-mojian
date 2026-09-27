-- 媒体通道（MediaProvider）：短剧/漫画/漫剧的配音、视频、配乐统一走可配置通道。
-- 一家供应商一条记录，支持 OpenAI 兼容自定义端点（NewAPI、One-API、中转站等）。
-- apiKey 只在服务端读取，HTTP 层一律脱敏返回；协议差异由 protocol + options 描述。
CREATE TABLE "MediaProvider" (
    "id" TEXT NOT NULL,
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
    "costPerSecond" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MediaProvider_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MediaProvider_kind_providerKey_key" ON "MediaProvider"("kind", "providerKey");
CREATE INDEX "MediaProvider_kind_isActive_idx" ON "MediaProvider"("kind", "isActive");
