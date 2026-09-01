import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const clientRoot = fileURLToPath(new URL("..", import.meta.url));
const viteCli = fileURLToPath(new URL("../node_modules/vite/dist/node/cli.js", import.meta.url));
const result = spawnSync(process.execPath, [viteCli, "build"], {
  cwd: clientRoot,
  stdio: "inherit",
  env: {
    ...process.env,
    AI_NOVEL_CLIENT_BASE: "relative",
  },
});

if (result.error) {
  throw result.error;
}
if (typeof result.status === "number" && result.status !== 0) {
  process.exit(result.status);
}
