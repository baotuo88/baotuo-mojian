/**
 * 环境变量校验模块
 * 在应用启动前检查必需的环境变量，提供友好的错误提示
 */

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

interface EnvVariable {
  name: string;
  required: boolean;
  description: string;
  validator?: (value: string) => boolean;
  errorMessage?: string;
}

/**
 * 必需和可选的环境变量配置
 */
const ENV_SCHEMA: EnvVariable[] = [
  // 数据库配置：开发环境可省略（默认回落到 SQLite file:./dev.db，见 config/database.ts），
  // 生产环境必填，由下方 validateEnvironment() 单独强制。
  {
    name: "DATABASE_URL",
    required: false,
    description: "数据库连接 URL（留空时开发环境默认使用 SQLite file:./dev.db）",
    validator: (value) => {
      return /^(postgresql|postgres|file):/.test(value);
    },
    errorMessage: "DATABASE_URL 必须是有效的 PostgreSQL 或 SQLite 连接字符串",
  },

  // Node 环境（可选，但建议设置）
  {
    name: "NODE_ENV",
    required: false,
    description: "运行环境（development | production）",
    validator: (value) => ["development", "production", "test"].includes(value),
    errorMessage: "NODE_ENV 必须是 development、production 或 test 之一",
  },

  // LLM 提供商密钥不在此处逐个声明：它们既可以来自环境变量，
  // 也可以在产品内「设置 → 模型供应商」页面录入并加密存库。
  // 环境变量键名的唯一事实源是 server/src/llm/providers.ts。
];

/**
 * 内置模型供应商的环境变量键名。
 * 必须与 server/src/llm/providers.ts 中的 PROVIDERS[*].envKey 保持一致。
 */
const PROVIDER_ENV_KEYS: readonly string[] = [
  "OPENAI_API_KEY",
  "DEEPSEEK_API_KEY",
  "SILICONFLOW_API_KEY",
  "ANTHROPIC_API_KEY",
  "XAI_API_KEY",
  "KIMI_API_KEY",
  "MINIMAX_API_KEY",
  "GLM_API_KEY",
  "QWEN_API_KEY",
  "GEMINI_API_KEY",
  "OLLAMA_API_KEY",
];

/**
 * RAG 相关的环境变量（当 RAG_ENABLED=true 时需要）
 */
const RAG_ENV_SCHEMA: EnvVariable[] = [
  {
    name: "QDRANT_URL",
    required: true,
    description: "Qdrant 向量数据库 URL",
    validator: (value) => /^https?:\/\/.+/.test(value),
    errorMessage: "QDRANT_URL 必须是有效的 HTTP/HTTPS URL",
  },
  {
    name: "EMBEDDING_PROVIDER",
    required: true,
    description: "Embedding 模型提供商",
  },
  {
    name: "EMBEDDING_MODEL",
    required: true,
    description: "Embedding 模型名称",
  },
];

/**
 * 检查是否至少配置了一个 LLM 提供商。
 * 未配置不是启动错误：密钥可以在产品内设置页录入，此处只给出提示。
 */
function checkLLMProviders(): { configured: string[]; message?: string } {
  const configured = PROVIDER_ENV_KEYS.filter((key) => process.env[key]?.trim());

  if (configured.length === 0) {
    return {
      configured,
      message: `⚠️  未从环境变量读取到任何模型供应商密钥。
   可以在产品内「设置 → 模型供应商」页面录入密钥，
   或在 .env 中配置以下变量之一：
   ${PROVIDER_ENV_KEYS.join("、")}
   （Ollama 本地部署无需密钥，配置 OLLAMA_BASE_URL 即可）`,
    };
  }

  return { configured };
}

/**
 * 打印用值：隐藏连接串中的账号密码，避免把凭据写进启动日志
 */
function maskSensitiveValue(value: string): string {
  const masked = value.replace(/:\/\/[^/@\s]+@/, "://***:***@");
  return masked.length > 50 ? `${masked.substring(0, 50)}...` : masked;
}

/**
 * 校验单个环境变量
 */
function validateEnvVariable(variable: EnvVariable): string | null {
  const value = process.env[variable.name];

  // 检查必需变量
  if (variable.required && !value) {
    return `❌ 缺少必需的环境变量：${variable.name}
   说明：${variable.description}`;
  }

  // 如果变量存在且有校验器，执行校验
  if (value && variable.validator && !variable.validator(value)) {
    return `❌ ${variable.errorMessage || `${variable.name} 格式不正确`}
   当前值：${maskSensitiveValue(value)}`;
  }

  return null;
}

/**
 * 校验环境变量配置
 */
export function validateEnvironment(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. 校验基础环境变量
  for (const variable of ENV_SCHEMA) {
    const error = validateEnvVariable(variable);
    if (error) {
      errors.push(error);
    }
  }

  // 2. 检查 LLM 提供商配置（缺失只警告，不阻断启动）
  const llmCheck = checkLLMProviders();
  if (llmCheck.message) {
    warnings.push(llmCheck.message);
  }

  // 3. 如果启用了 RAG，检查 RAG 相关配置
  const ragEnabled = process.env.RAG_ENABLED === "true" || process.env.RAG_ENABLED === "1";
  if (ragEnabled) {
    // RAG 配置项在 config/rag.ts 中都有默认值，缺失只警告，不阻断启动
    for (const variable of RAG_ENV_SCHEMA) {
      const issue = validateEnvVariable(variable);
      if (issue) {
        warnings.push(issue.replace(/^❌/, "⚠️ "));
      }
    }
  }

  // 4. 生产环境的额外检查
  if (process.env.NODE_ENV === "production") {
    // 生产环境必须显式提供数据库连接串，不允许回落到本地 SQLite 默认值
    const dbUrl = process.env.DATABASE_URL?.trim();
    if (!dbUrl) {
      errors.push(`❌ 缺少必需的环境变量：DATABASE_URL
   说明：生产环境必须显式配置数据库连接 URL，不会回落到本地 SQLite 默认值`);
    }

    // 检查数据库密码强度
    if (dbUrl && /password|:.*@/.test(dbUrl)) {
      const passwordMatch = dbUrl.match(/:([^:@]+)@/);
      if (passwordMatch) {
        const password = passwordMatch[1];
        if (password.length < 12) {
          warnings.push(
            `⚠️  警告：生产环境数据库密码过短（少于 12 位），建议使用更强的密码`,
          );
        }
        if (/^(password|123456|admin|root)$/i.test(password)) {
          errors.push(`❌ 错误：生产环境不允许使用弱密码`);
        }
      }
    }

    // 检查是否配置了 CORS
    if (!process.env.CORS_ORIGIN) {
      warnings.push(
        `⚠️  警告：生产环境未配置 CORS_ORIGIN，建议设置允许的来源域名`,
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * 校验环境变量并在失败时退出进程
 */
export function validateEnvironmentOrExit(): void {
  const result = validateEnvironment();

  // 打印警告
  if (result.warnings.length > 0) {
    console.warn("\n配置警告：");
    for (const warning of result.warnings) {
      console.warn(warning);
    }
    console.warn("");
  }

  // 如果有错误，打印并退出
  if (!result.valid) {
    console.error("\n❌ 环境变量校验失败：\n");
    for (const error of result.errors) {
      console.error(error);
      console.error("");
    }
    console.error("💡 提示：本地开发请检查 server/.env（参考 server/.env.example）");
    console.error("📖 Docker Compose 部署请检查仓库根目录 .env（参考 .env.example）\n");
    process.exit(1);
  }

  // 校验通过
  if (process.env.NODE_ENV !== "test") {
    console.log("✓ 环境变量校验通过");
  }
}

/**
 * 打印当前配置摘要（不包含敏感信息）
 */
export function printConfigSummary(): void {
  if (process.env.NODE_ENV === "test") {
    return;
  }

  const rawDbUrl = process.env.DATABASE_URL?.trim();
  const dbType = !rawDbUrl
    ? "SQLite（默认 file:./dev.db）"
    : /^(postgresql|postgres):/.test(rawDbUrl)
      ? "PostgreSQL"
      : rawDbUrl.startsWith("file:")
        ? "SQLite"
        : "未知";

  const llmProviders = PROVIDER_ENV_KEYS.filter((key) => process.env[key]?.trim()).map((key) =>
    key.replace(/_API_KEY$/, ""),
  );

  const ragStatus = process.env.RAG_ENABLED === "true" || process.env.RAG_ENABLED === "1"
    ? "已启用"
    : "已禁用";

  console.log("\n📋 当前配置摘要：");
  console.log(`   运行环境：${process.env.NODE_ENV || "development"}`);
  console.log(`   数据库类型：${dbType}`);
  console.log(`   LLM 提供商：${llmProviders.length > 0 ? llmProviders.join(", ") : "未从环境变量读取（可在设置页录入）"}`);
  console.log(`   RAG 状态：${ragStatus}`);
  console.log("");
}
