import path from "node:path";

const SERVER_ROOT = path.resolve(__dirname, "..", "..");
const WORKSPACE_ROOT = path.resolve(SERVER_ROOT, "..");

export function resolveServerRoot(): string {
  return SERVER_ROOT;
}

export function resolveWorkspaceRoot(): string {
  return WORKSPACE_ROOT;
}

export function resolveDataRoot(): string {
  return resolveServerRoot();
}

export function resolveLogsRoot(): string {
  return path.join(resolveWorkspaceRoot(), ".logs");
}

export function resolveGeneratedImagesRoot(): string {
  return path.join(resolveServerRoot(), "storage", "generated-images");
}

export function resolveDatabaseFilePath(filePath: string): string {
  const baseDir = resolveDataRoot();
  return path.isAbsolute(filePath) ? filePath : path.resolve(baseDir, filePath);
}
