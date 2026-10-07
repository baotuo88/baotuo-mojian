import { Link } from "react-router-dom";
import { Pause, Play } from "lucide-react";
import type { DramaBatchJob } from "@/api/drama";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  batchCompletion,
  isActiveBatch,
  isRecoverableBatch,
  parseBatchProgress,
} from "./projection";

const STATUS_LABELS: Record<DramaBatchJob["status"], string> = {
  pending: "等待中",
  running: "执行中",
  paused: "已暂停",
  done: "已完成",
  failed: "有未完成镜头",
};

export function DramaBatchJobCard(props: {
  job: DramaBatchJob;
  title: string;
  busy: boolean;
  storyboardCurrent: boolean;
  onPause: (job: DramaBatchJob) => void;
  onResume: (job: DramaBatchJob) => void;
  onOpen?: () => void;
}) {
  const progress = parseBatchProgress(props.job.progress);
  const completion = batchCompletion(props.job);
  const active = isActiveBatch(props.job);
  return (
    <section className="rounded-md border p-3 text-sm" aria-label={props.title}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-medium">{props.title}</div>
        <Badge variant={props.job.status === "failed" ? "destructive" : "outline"}>
          {active && progress.pauseRequested
            ? "等待当前镜头结束后暂停"
            : STATUS_LABELS[props.job.status]}
        </Badge>
      </div>
      <div
        className="mt-3 h-2 overflow-hidden rounded bg-muted"
        role="progressbar"
        aria-label="镜头处理进度"
        aria-valuemin={0}
        aria-valuemax={completion.total}
        aria-valuenow={completion.processed}
      >
        <div className="h-full bg-primary" style={{ width: `${completion.percent}%` }} />
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span>
          已处理 {completion.processed}/{completion.total} · 完成 {completion.done}
          {progress.skipped ? `（其中复用 ${progress.skipped}）` : ""}
        </span>
        {progress.failed ? <span>失败 {progress.failed}</span> : null}
        {progress.provider ? <span>通道：{progress.provider}</span> : null}
        {progress.cost ? (
          <span>
            费用估算：{progress.cost.currency} {progress.cost.estimated.toFixed(2)} · 已用估算：
            {progress.cost.currency} {progress.cost.actual.toFixed(2)}
          </span>
        ) : null}
      </div>
      {progress.interruptionReason ? (
        <p className="mt-2 text-muted-foreground">{progress.interruptionReason}</p>
      ) : null}
      {!props.storyboardCurrent && isRecoverableBatch(props.job) ? (
        <p className="mt-2 text-muted-foreground">
          本集分镜与此任务不同，请进入本集，基于当前分镜创建制作任务。
        </p>
      ) : null}
      {progress.errors?.length ? (
        <details className="mt-2 text-xs text-muted-foreground">
          <summary className="cursor-pointer">查看失败原因（{progress.errors.length}）</summary>
          <ul className="mt-2 space-y-1">
            {progress.errors.map((error, index) => (
              <li key={`${error.shotId}-${index}`}>{error.message}</li>
            ))}
          </ul>
        </details>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {active ? (
          <Button
            size="sm"
            variant="outline"
            disabled={props.busy || progress.pauseRequested}
            onClick={() => props.onPause(props.job)}
          >
            <Pause className="h-4 w-4" />
            暂停制作
          </Button>
        ) : null}
        {isRecoverableBatch(props.job) ? (
          <Button
            size="sm"
            disabled={props.busy || !props.storyboardCurrent}
            onClick={() => props.onResume(props.job)}
          >
            <Play className="h-4 w-4" />
            继续未完成镜头
          </Button>
        ) : null}
        {props.onOpen ? (
          <Button size="sm" variant="outline" onClick={props.onOpen}>
            进入本集
          </Button>
        ) : null}
        {isRecoverableBatch(props.job) ? (
          <Button asChild size="sm" variant="ghost">
            <Link to={props.job.type === "keyframes" ? "/settings/models" : "/settings/media"}>
              检查生成通道
            </Link>
          </Button>
        ) : null}
      </div>
      {active ? (
        <p className="mt-2 text-xs text-muted-foreground">
          暂停会等待正在处理的镜头结束；任务进度会自动刷新。
        </p>
      ) : null}
    </section>
  );
}
