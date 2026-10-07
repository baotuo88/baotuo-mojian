import { prisma } from "../../../db/prisma";
import { AppError } from "../../../middleware/errorHandler";
import { throwIfExecutionAborted } from "../../../platform/execution";

export const EXPORT_LEASE_MS = 90_000;
const HEARTBEAT_MS = 15_000;
const interrupted = "导出中断，请重新导出。本次未完成的文件不会作为成品提供下载。";

/** Read-side recovery uses the same lease predicate as the worker's final publication. */
export async function recoverInterruptedExports(scope: {
  id?: string;
  projectId?: string;
}): Promise<void> {
  await prisma.comicExportJob.updateMany({
    where: {
      ...scope,
      status: "processing",
      updatedAt: { lt: new Date(Date.now() - EXPORT_LEASE_MS) },
    },
    data: { status: "error", artifacts: JSON.stringify({ error: interrupted, retryable: true }) },
  });
}

export class ExportJobLease {
  private timer?: ReturnType<typeof setTimeout>;
  private pending?: Promise<void>;
  private lost = false;
  private stopped = false;
  constructor(private readonly jobId: string) {
    this.schedule();
  }

  private schedule() {
    this.timer = setTimeout(() => {
      this.pending = this.heartbeat()
        .catch(() => {
          this.lost = true;
        })
        .finally(() => {
          if (!this.stopped && !this.lost) this.schedule();
        });
    }, HEARTBEAT_MS);
    this.timer.unref?.();
  }

  private where() {
    return {
      id: this.jobId,
      status: "processing",
      updatedAt: { gte: new Date(Date.now() - EXPORT_LEASE_MS) },
    };
  }

  private async heartbeat() {
    const result = await prisma.comicExportJob.updateMany({
      where: this.where(),
      data: { updatedAt: new Date() },
    });
    if (result.count !== 1) this.lost = true;
  }

  private async stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    await this.pending;
  }

  async complete(artifacts: unknown): Promise<void> {
    await this.stop();
    throwIfExecutionAborted();
    if (this.lost) throw new AppError(interrupted, 409);
    const result = await prisma.comicExportJob.updateMany({
      where: this.where(),
      data: { status: "done", artifacts: JSON.stringify(artifacts) },
    });
    if (result.count !== 1) throw new AppError(interrupted, 409);
  }

  async fail(error: unknown): Promise<void> {
    await this.stop();
    await prisma.comicExportJob.updateMany({
      where: { id: this.jobId, status: "processing" },
      data: {
        status: "error",
        artifacts: JSON.stringify({ error: String(error), retryable: true }),
      },
    });
  }
}
