const path = require("node:path");

function requireDist(relativePath) {
  return require(path.join(process.cwd(), "dist", relativePath));
}

async function main() {
  const { startServer } = requireDist("app.js");
  const started = await startServer({ host: "127.0.0.1", port: 0, allowLan: false });
  try {
    const response = await fetch(`${started.url}/api/health/live`);
    const payload = await response.json();
    if (response.status !== 200 || payload?.data?.status !== "ok") {
      throw new Error(`Unexpected liveness response: status=${response.status} payload=${JSON.stringify(payload)}`);
    }
    process.stdout.write(`${JSON.stringify({ status: response.status, payload })}\n`);
  } finally {
    await started.close();
    const { prisma } = requireDist("db/prisma.js");
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
