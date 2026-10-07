import os from "node:os";
import { prisma } from "../db/prisma";
import { DirectorCommandService } from "../services/novel/director/commands/DirectorCommandService";
import { resourceClassForCommand } from "../services/novel/director/commands/DirectorCommandServiceHelpers";
import { taskDispatcher } from "./TaskDispatcher";
import { ExecutionStoppedError } from "../platform/execution";

const ACTIVE_COMMAND_STATUSES = ["leased", "running"] as const;

function resolveNumberEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function resolveDefaultSlots(): number {
  return Math.max(4, os.cpus().length);
}

class ResourceGate {
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(private readonly limit: number) {}

  async acquire(signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    if (this.limit <= 0) return;
    if (this.active < this.limit) {
      this.active += 1;
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        const index = this.waiters.indexOf(onReady);
        if (index >= 0) this.waiters.splice(index, 1);
        reject(signal?.reason ?? new ExecutionStoppedError());
      };
      const onReady = () => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      };
      this.waiters.push(onReady);
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }

  release(): void {
    if (this.limit <= 0) return;
    this.active = Math.max(0, this.active - 1);
    const next = this.waiters.shift();
    if (next) {
      this.active += 1;
      next();
    }
  }
}

const PER_NOVEL_RESOURCE_LIMITS: Record<string, number> = {
  planner: 2,
  writer: 2,
  repair: 2,
  state_resolution: 2,
};

export interface DirectorTaskQueueOptions {
  workerId?: string;
  leaseMs?: number;
  staleScanMs?: number;
  executionSlots?: number;
  pollMs?: number;
}

export type LeaseRenewalHandle = (() => void) & {
  isLost: () => boolean;
  signal: AbortSignal;
  ready: Promise<void>;
};

export interface LeasedTask {
  command: NonNullable<Awaited<ReturnType<typeof prisma.directorRunCommand.findUnique>>>;
}

export class DirectorTaskQueue {
  readonly workerId: string;
  readonly leaseMs: number;
  readonly staleScanMs: number;
  readonly executionSlots: number;
  readonly pollMs: number;

  private readonly gates = new Map<string, ResourceGate>();
  private readonly commandService: DirectorCommandService;
  private lastStaleScan = 0;

  constructor(
    options: DirectorTaskQueueOptions = {},
    commandService = new DirectorCommandService(),
  ) {
    this.workerId =
      options.workerId ??
      process.env.DIRECTOR_WORKER_ID?.trim() ??
      `director-worker-${os.hostname()}-${process.pid}`;
    this.leaseMs = resolveNumberEnv("DIRECTOR_WORKER_LEASE_MS", options.leaseMs ?? 120_000);
    this.staleScanMs = resolveNumberEnv(
      "DIRECTOR_WORKER_STALE_SCAN_MS",
      options.staleScanMs ?? 30_000,
    );
    this.executionSlots = resolveNumberEnv(
      "DIRECTOR_WORKER_EXECUTION_SLOTS",
      options.executionSlots ?? resolveDefaultSlots(),
    );
    this.pollMs = resolveNumberEnv("DIRECTOR_WORKER_POLL_MS", options.pollMs ?? 5_000);
    this.commandService = commandService;
  }

  async leaseNext(slotId: string): Promise<LeasedTask | null> {
    await this.maybeScanStale();
    const now = new Date();
    const leaseOwner = `${this.workerId}:${slotId}`;
    const leaseExpiresAt = new Date(now.getTime() + this.leaseMs);
    const candidate = await prisma.directorRunCommand.findFirst({
      where: {
        status: "queued",
        runAfter: { lte: now },
      },
      orderBy: [{ runAfter: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    });
    if (!candidate) {
      return null;
    }
    const claimed = await prisma.directorRunCommand.updateMany({
      where: {
        id: candidate.id,
        status: "queued",
      },
      data: {
        status: "leased",
        leaseOwner,
        leaseExpiresAt,
        attempt: { increment: 1 },
      },
    });
    if (claimed.count !== 1) {
      return null;
    }
    const command = await prisma.directorRunCommand.findUnique({
      where: { id: candidate.id },
    });
    return command ? { command } : null;
  }

  async acquireResourceGate(
    novelId: string | null | undefined,
    commandType: string,
    signal?: AbortSignal,
  ): Promise<void> {
    const resourceClass = resourceClassForCommand(commandType);
    const key = `${novelId?.trim() || "_global"}:${resourceClass}`;
    let gate = this.gates.get(key);
    if (!gate) {
      const envName = `DIRECTOR_WORKER_RESOURCE_${resourceClass.toUpperCase()}_LIMIT`;
      gate = new ResourceGate(
        resolveNumberEnv(envName, PER_NOVEL_RESOURCE_LIMITS[resourceClass] ?? 2),
      );
      this.gates.set(key, gate);
    }
    await gate.acquire(signal);
  }

  releaseResourceGate(novelId: string | null | undefined, commandType: string): void {
    const resourceClass = resourceClassForCommand(commandType);
    const key = `${novelId?.trim() || "_global"}:${resourceClass}`;
    this.gates.get(key)?.release();
  }

  startLeaseRenewal(commandId: string, slotId: string): LeaseRenewalHandle {
    const controller = new AbortController();
    let stopped = false;
    let renewing = false;
    let expiryTimer: ReturnType<typeof setTimeout>;
    const loseLease = () => {
      if (!stopped && !controller.signal.aborted) {
        controller.abort(new ExecutionStoppedError("自动导演已失去执行租约，停止本次执行。"));
      }
    };
    const armExpiry = (deadline = Date.now() + this.leaseMs) => {
      clearTimeout(expiryTimer);
      expiryTimer = setTimeout(loseLease, Math.max(0, deadline - Date.now()));
    };
    const renew = async () => {
      if (stopped || renewing || controller.signal.aborted) return;
      renewing = true;
      const renewalStartedAt = Date.now();
      try {
        const renewed = await this.commandService.renewLease(
          commandId,
          `${this.workerId}:${slotId}`,
          this.leaseMs,
        );
        if (!renewed) loseLease();
        else if (!stopped && !controller.signal.aborted) armExpiry(renewalStartedAt + this.leaseMs);
      } catch (error) {
        loseLease();
        console.warn(`[task-queue] failed to renew command lease commandId=${commandId}`, error);
      } finally {
        renewing = false;
      }
    };
    armExpiry();
    const initialRenewal = renew();
    const ready = new Promise<void>((resolve) => {
      const finish = () => {
        controller.signal.removeEventListener("abort", finish);
        resolve();
      };
      controller.signal.addEventListener("abort", finish, { once: true });
      void initialRenewal.then(finish);
    });
    const timer = setInterval(
      () => {
        void renew();
      },
      Math.max(100, Math.floor(this.leaseMs / 3)),
    );
    const stop = (() => {
      stopped = true;
      clearInterval(timer);
      clearTimeout(expiryTimer);
    }) as LeaseRenewalHandle;
    stop.isLost = () => controller.signal.aborted;
    stop.signal = controller.signal;
    stop.ready = ready;
    return stop;
  }

  async markRunning(commandId: string, slotId: string): Promise<void> {
    await this.commandService.markCommandRunning(
      commandId,
      `${this.workerId}:${slotId}`,
      this.leaseMs,
    );
  }

  assertLeaseActive(stopRenewal: { isLost?: () => boolean }): void {
    if (stopRenewal.isLost?.()) {
      throw new Error("Director command lease was lost before execution started.");
    }
  }

  async completeTask(commandId: string, slotId: string): Promise<void> {
    await this.commandService.markCommandSucceeded(commandId, `${this.workerId}:${slotId}`);
    const command = await this.commandService.getCommandById(commandId);
    taskDispatcher.notify({ taskId: command?.taskId });
  }

  async cancelTask(commandId: string, slotId: string): Promise<void> {
    await this.commandService.markCommandCancelled(commandId, `${this.workerId}:${slotId}`);
  }

  async failTask(commandId: string, slotId: string, error: unknown): Promise<void> {
    await this.commandService.markCommandFailed(commandId, `${this.workerId}:${slotId}`, error);
  }

  async waitForWork(): Promise<void> {
    await taskDispatcher.waitForSignal(this.pollMs);
  }

  private async maybeScanStale(): Promise<void> {
    const now = Date.now();
    if (now - this.lastStaleScan < this.staleScanMs) {
      return;
    }
    this.lastStaleScan = now;
    const recovered = await this.commandService.recoverStaleLeases(new Date());
    if (recovered > 0) {
      taskDispatcher.notify();
    }
  }
}
