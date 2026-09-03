// 单章正文生成的输出 token 预算。
// 背景：writer 调用点此前不传 maxTokens——Anthropic 协议缺省会硬落回 4096
// （约 3000 汉字），整章正文在中途被 max_tokens 截断；DeepSeek 等开放兼容
// 协议缺省时也由服务商按约 4K 输出。本预算按章节目标字数保守放大
//（中文约 1 字≈1.5~2 token，另计场景结构开销），factory 侧再按内置
// provider 上限钳制（如 deepseek 8192）。

export const WRITER_MIN_OUTPUT_TOKENS = 8192;
export const WRITER_MAX_OUTPUT_TOKENS = 16384;

export function deriveWriterOutputTokens(targetWordCount?: number | null): number {
  const words = Math.max(0, Math.floor(targetWordCount ?? 0));
  if (words <= 0) {
    return WRITER_MIN_OUTPUT_TOKENS;
  }
  const needed = Math.ceil(words * 2.2) + 512;
  return Math.min(Math.max(needed, WRITER_MIN_OUTPUT_TOKENS), WRITER_MAX_OUTPUT_TOKENS);
}
