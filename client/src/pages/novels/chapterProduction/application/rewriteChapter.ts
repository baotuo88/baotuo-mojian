/** Keep the existing chapter until generation successfully commits its replacement. */
export async function rewriteChapterWithBackup(input: {
  backup: () => Promise<{ data?: { id: string } | null }>;
  generate: () => void | Promise<void>;
}): Promise<void> {
  const snapshot = await input.backup();
  if (!snapshot.data?.id) throw new Error("原稿备份尚未确认，未开始重写，请重试。");
  await input.generate();
}
