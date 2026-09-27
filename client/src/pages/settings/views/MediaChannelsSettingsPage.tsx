import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, CircleAlert, LoaderCircle, Plus, Radio } from "lucide-react";
import {
  createMediaProvider,
  deleteMediaProvider,
  listMediaProviders,
  updateMediaProvider,
  type CreateMediaProviderInput,
  type MediaProviderKind,
  type MediaProviderKindMeta,
  type MediaProviderOptions,
  type MediaProviderProtocol,
  type MediaProviderView,
  type UpdateMediaProviderInput,
} from "@/api/media";
import { queryKeys } from "@/api/queryKeys";
import SelectControl from "@/components/common/SelectControl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AppDialogContent, Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { SettingsShell } from "../components/SettingsShell";

interface MediaChannelFormState {
  kind: MediaProviderKind;
  label: string;
  providerKey: string;
  protocol: MediaProviderProtocol;
  baseURL: string;
  apiKey: string;
  clearApiKey: boolean;
  model: string;
  costPerSecond: string;
  currency: string;
  supportsRefImages: boolean;
  isActive: boolean;
  synthesizePath: string;
  createPath: string;
  statusPath: string;
  speechPath: string;
  responseFormat: string;
  defaultVoice: string;
  timeoutMs: string;
  headersText: string;
  payloadText: string;
  taskIdPath: string;
  statusValuePath: string;
  resultUrlPath: string;
  statusMapText: string;
}

function createEmptyForm(meta: MediaProviderKindMeta): MediaChannelFormState {
  return {
    kind: meta.kind,
    label: "",
    providerKey: "",
    protocol: meta.protocols[0].protocol,
    baseURL: "",
    apiKey: "",
    clearApiKey: false,
    model: "",
    costPerSecond: "",
    currency: "CNY",
    supportsRefImages: false,
    isActive: true,
    synthesizePath: "",
    createPath: "",
    statusPath: "",
    speechPath: "",
    responseFormat: "",
    defaultVoice: "",
    timeoutMs: "",
    headersText: "",
    payloadText: "",
    taskIdPath: "",
    statusValuePath: "",
    resultUrlPath: "",
    statusMapText: "",
  };
}

function formatJsonRecord(record: Record<string, unknown> | undefined): string {
  if (!record || Object.keys(record).length === 0) {
    return "";
  }
  return JSON.stringify(record, null, 2);
}

function formFromProvider(provider: MediaProviderView): MediaChannelFormState {
  const options = provider.options ?? {};
  return {
    kind: provider.kind,
    label: provider.label,
    providerKey: provider.providerKey,
    protocol: provider.protocol,
    baseURL: provider.baseURL ?? "",
    apiKey: "",
    clearApiKey: false,
    model: provider.model ?? "",
    costPerSecond: provider.costPerSecond ? String(provider.costPerSecond) : "",
    currency: provider.currency || "CNY",
    supportsRefImages: provider.supportsRefImages,
    isActive: provider.isActive,
    synthesizePath: options.synthesizePath ?? "",
    createPath: options.createPath ?? "",
    statusPath: options.statusPath ?? "",
    speechPath: options.speechPath ?? "",
    responseFormat: options.responseFormat ?? "",
    defaultVoice: options.defaultVoice ?? "",
    timeoutMs: options.timeoutMs ? String(options.timeoutMs) : "",
    headersText: formatJsonRecord(options.headers),
    payloadText: formatJsonRecord(options.payload),
    taskIdPath: options.taskIdPath ?? "",
    statusValuePath: options.statusValuePath ?? "",
    resultUrlPath: options.resultUrlPath ?? "",
    statusMapText: formatJsonRecord(options.statusMap),
  };
}

function parseJsonObjectRecord(text: string, label: string): Record<string, unknown> | undefined {
  const trimmed = text.trim();
  if (!trimmed) {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error(`${label} 需要填写合法的 JSON 对象。`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} 需要填写 JSON 对象，例如多行花括号内容。`);
  }
  return Object.keys(parsed as Record<string, unknown>).length ? (parsed as Record<string, unknown>) : undefined;
}

function parseStringRecord(text: string, label: string): Record<string, string> | undefined {
  const parsed = parseJsonObjectRecord(text, label);
  if (!parsed) {
    return undefined;
  }
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    const name = key.trim();
    if (!name) {
      continue;
    }
    result[name] = typeof value === "string" ? value : String(value);
  }
  return Object.keys(result).length ? result : undefined;
}

function Field(props: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground">{props.label}</div>
      {props.children}
      {props.hint ? <div className="text-xs text-muted-foreground">{props.hint}</div> : null}
    </div>
  );
}

const TEXTAREA_CLASS =
  "flex min-h-[84px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

export default function MediaChannelsSettingsPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<MediaProviderView | null>(null);
  const [form, setForm] = useState<MediaChannelFormState | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const providersQuery = useQuery({
    queryKey: queryKeys.media.providers,
    queryFn: listMediaProviders,
  });

  const providers = useMemo(() => providersQuery.data?.data?.providers ?? [], [providersQuery.data]);
  const kinds = useMemo(() => providersQuery.data?.data?.kinds ?? [], [providersQuery.data]);

  const providersByKind = useMemo(() => {
    const map = new Map<MediaProviderKind, MediaProviderView[]>();
    for (const provider of providers) {
      const list = map.get(provider.kind) ?? [];
      list.push(provider);
      map.set(provider.kind, list);
    }
    return map;
  }, [providers]);

  const activeKindMeta = useMemo(
    () => (form ? kinds.find((item) => item.kind === form.kind) : undefined),
    [form, kinds],
  );
  const protocolOptions = activeKindMeta?.protocols ?? [];

  const invalidateProviders = () => queryClient.invalidateQueries({ queryKey: queryKeys.media.providers });

  const saveMutation = useMutation({
    mutationFn: (input: { id?: string; payload: CreateMediaProviderInput | UpdateMediaProviderInput }) =>
      input.id
        ? updateMediaProvider(input.id, input.payload as UpdateMediaProviderInput)
        : createMediaProvider(input.payload as CreateMediaProviderInput),
    onSuccess: async (_data, variables) => {
      await invalidateProviders();
      toast.success(variables.id ? "通道已保存。" : "通道已创建。");
      setDialogOpen(false);
      setEditingProvider(null);
      setForm(null);
      setShowAdvanced(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteMediaProvider(id),
    onSuccess: async () => {
      await invalidateProviders();
      toast.success("通道已删除。");
    },
  });

  const updateForm = (patch: Partial<MediaChannelFormState>) => {
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const handleKindChange = (nextKind: MediaProviderKind) => {
    const meta = kinds.find((item) => item.kind === nextKind);
    setForm((prev) => {
      if (!prev) {
        return prev;
      }
      const keepsProtocol = meta?.protocols.some((item) => item.protocol === prev.protocol);
      return {
        ...prev,
        kind: nextKind,
        protocol: keepsProtocol ? prev.protocol : (meta?.protocols[0]?.protocol ?? prev.protocol),
      };
    });
  };

  const openCreateDialog = () => {
    const firstKind = kinds[0];
    if (!firstKind || firstKind.protocols.length === 0) {
      toast.error("通道能力信息还在加载，请稍后再试。");
      return;
    }
    setEditingProvider(null);
    setForm(createEmptyForm(firstKind));
    setShowAdvanced(false);
    setDialogOpen(true);
  };

  const openEditDialog = (provider: MediaProviderView) => {
    setEditingProvider(provider);
    setForm(formFromProvider(provider));
    setShowAdvanced(false);
    setDialogOpen(true);
  };

  const handleDialogOpenChange = (next: boolean) => {
    setDialogOpen(next);
    if (!next) {
      setEditingProvider(null);
      setForm(null);
      setShowAdvanced(false);
    }
  };

  const handleDelete = (provider: MediaProviderView) => {
    const confirmed = window.confirm(`确认删除通道「${provider.label}」？删除后依赖它的创作会改用其他可用通道。`);
    if (!confirmed) {
      return;
    }
    deleteMutation.mutate(provider.id);
  };

  const handleSubmit = () => {
    if (!form) {
      return;
    }
    const label = form.label.trim();
    if (!label) {
      toast.error("请填写显示名称。");
      return;
    }

    let headers: Record<string, string> | undefined;
    let payload: Record<string, unknown> | undefined;
    let statusMap: Record<string, string> | undefined;
    try {
      headers = parseStringRecord(form.headersText, "附加请求头");
      payload = parseJsonObjectRecord(form.payloadText, "请求体模板");
      statusMap = parseStringRecord(form.statusMapText, "状态映射");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "高级设置填写有误。");
      return;
    }

    const options: MediaProviderOptions = {};
    if (form.synthesizePath.trim()) options.synthesizePath = form.synthesizePath.trim();
    if (form.createPath.trim()) options.createPath = form.createPath.trim();
    if (form.statusPath.trim()) options.statusPath = form.statusPath.trim();
    if (form.speechPath.trim()) options.speechPath = form.speechPath.trim();
    if (form.responseFormat.trim()) options.responseFormat = form.responseFormat.trim();
    if (form.defaultVoice.trim()) options.defaultVoice = form.defaultVoice.trim();
    if (form.taskIdPath.trim()) options.taskIdPath = form.taskIdPath.trim();
    if (form.statusValuePath.trim()) options.statusValuePath = form.statusValuePath.trim();
    if (form.resultUrlPath.trim()) options.resultUrlPath = form.resultUrlPath.trim();
    if (headers) options.headers = headers;
    if (payload) options.payload = payload;
    if (statusMap) options.statusMap = statusMap;

    const timeoutText = form.timeoutMs.trim();
    if (timeoutText) {
      const timeout = Number(timeoutText);
      if (!Number.isFinite(timeout) || timeout <= 0) {
        toast.error("超时时间需要填写大于 0 的毫秒数。");
        return;
      }
      options.timeoutMs = Math.floor(timeout);
    }

    const costText = form.costPerSecond.trim();
    let costPerSecond = 0;
    if (costText) {
      const cost = Number(costText);
      if (!Number.isFinite(cost) || cost < 0) {
        toast.error("每秒成本需要填写不小于 0 的数字。");
        return;
      }
      costPerSecond = cost;
    }

    const shared = {
      kind: form.kind,
      label,
      providerKey: form.providerKey.trim() || undefined,
      protocol: form.protocol,
      baseURL: form.baseURL.trim(),
      model: form.model.trim(),
      options,
      isActive: form.isActive,
      supportsRefImages: form.kind === "video" ? form.supportsRefImages : false,
      costPerSecond,
      currency: form.currency.trim(),
    };

    if (editingProvider) {
      const payloadInput: UpdateMediaProviderInput = { ...shared };
      if (form.clearApiKey) {
        payloadInput.apiKey = null;
      } else if (form.apiKey.trim()) {
        payloadInput.apiKey = form.apiKey.trim();
      }
      saveMutation.mutate({ id: editingProvider.id, payload: payloadInput });
      return;
    }

    saveMutation.mutate({ payload: { ...shared, apiKey: form.apiKey.trim() || undefined } });
  };

  const dialogTitle = editingProvider ? "编辑通道" : "新增通道";
  const dialogDescription = editingProvider
    ? "调整这个通道的名称、接口和请求细节，保存后立即生效。"
    : "填写通道名称、接口地址和密钥，保存后即可在创作中使用。";

  return (
    <SettingsShell
      title="媒体通道"
      description="配置配音、视频和配乐使用哪些服务商，支持自定义接口地址与请求细节。"
    >
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <Radio className="h-4 w-4" />
                通道列表
              </CardTitle>
              <CardDescription>
                每种能力可以有多个通道，启用的通道会按能力参与配音、视频或配乐生成。
              </CardDescription>
            </div>
            <Button onClick={openCreateDialog} disabled={kinds.length === 0}>
              <Plus className="h-4 w-4" />
              新增通道
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {providersQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              正在读取通道配置...
            </div>
          ) : providersQuery.isError ? (
            <div className="flex flex-col gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-4">
              <div className="flex items-center gap-2 text-sm text-destructive">
                <CircleAlert className="h-4 w-4" />
                暂时无法读取通道配置。
              </div>
              <div>
                <Button variant="outline" size="sm" onClick={() => void providersQuery.refetch()}>
                  重新加载
                </Button>
              </div>
            </div>
          ) : providers.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-md border border-dashed p-8 text-center">
              <Radio className="h-6 w-6 text-muted-foreground" />
              <div className="space-y-1">
                <div className="font-medium">还没有配置通道</div>
                <div className="text-sm text-muted-foreground">
                  点击「新增通道」，选择配音、视频或配乐能力，填写服务商接口地址和密钥后就能在创作中使用。
                </div>
              </div>
              <Button onClick={openCreateDialog} disabled={kinds.length === 0}>
                <Plus className="h-4 w-4" />
                新增通道
              </Button>
            </div>
          ) : (
            kinds.map((meta) => {
              const kindProviders = providersByKind.get(meta.kind) ?? [];
              return (
                <section key={meta.kind} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-foreground">{meta.label}</h2>
                    <Badge variant="outline">{kindProviders.length}</Badge>
                  </div>
                  {kindProviders.length === 0 ? (
                    <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                      还没有配置{meta.label}通道。
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {kindProviders.map((provider) => {
                        const protocolLabel = meta.protocols.find((item) => item.protocol === provider.protocol)?.label
                          ?? provider.protocol;
                        return (
                          <div
                            key={provider.id}
                            className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="min-w-0 space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium">{provider.label}</span>
                                <Badge variant={provider.isActive ? "default" : "outline"}>
                                  {provider.isActive ? "启用中" : "未启用"}
                                </Badge>
                                {provider.isBuiltin ? <Badge variant="secondary">系统内置</Badge> : null}
                              </div>
                              <div className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                                标识 {provider.providerKey} · 协议 {protocolLabel}
                              </div>
                              <div className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                                接口地址 {provider.baseURL || "未填写"}
                              </div>
                              <div className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                                密钥 {provider.hasApiKey ? provider.apiKeyMasked : "未配置"}
                                {" · "}
                                单价 {provider.costPerSecond}
                                {provider.currency ? ` ${provider.currency}` : ""}
                                {provider.kind === "video"
                                  ? provider.supportsRefImages
                                    ? " · 支持参考图"
                                    : " · 不支持参考图"
                                  : ""}
                              </div>
                              {provider.description ? (
                                <div className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                                  {provider.description}
                                </div>
                              ) : null}
                            </div>
                            <div className="flex shrink-0 gap-2">
                              <Button variant="outline" size="sm" onClick={() => openEditDialog(provider)}>
                                编辑
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={provider.isBuiltin || deleteMutation.isPending}
                                title={provider.isBuiltin ? "系统内置通道不能删除，可以停用。" : undefined}
                                onClick={() => handleDelete(provider)}
                              >
                                删除
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <AppDialogContent
          className="max-w-2xl"
          title={dialogTitle}
          description={dialogDescription}
          footer={(
            <>
              <Button variant="outline" onClick={() => handleDialogOpenChange(false)}>
                取消
              </Button>
              <Button onClick={handleSubmit} disabled={saveMutation.isPending || !form}>
                {saveMutation.isPending ? "保存中..." : "保存"}
              </Button>
            </>
          )}
          footerClassName="gap-2"
        >
          {form ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="能力类型">
                  <SelectControl
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={form.kind}
                    onChange={(event) => handleKindChange(event.target.value as MediaProviderKind)}
                  >
                    {kinds.map((meta) => (
                      <option key={meta.kind} value={meta.kind}>
                        {meta.label}
                      </option>
                    ))}
                  </SelectControl>
                </Field>

                <Field label="协议" hint="可选协议来自所选能力，用于决定请求方式。">
                  <SelectControl
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={form.protocol}
                    onChange={(event) => updateForm({ protocol: event.target.value as MediaProviderProtocol })}
                  >
                    {protocolOptions.map((meta) => (
                      <option key={meta.protocol} value={meta.protocol}>
                        {meta.label}
                      </option>
                    ))}
                  </SelectControl>
                </Field>

                <Field label="显示名称">
                  <Input
                    value={form.label}
                    placeholder="例如：我的语音网关"
                    onChange={(event) => updateForm({ label: event.target.value })}
                  />
                </Field>

                <Field label="通道标识（可选）" hint="留空会按显示名称自动生成，用于和业务里的通道对应。">
                  <Input
                    value={form.providerKey}
                    placeholder="例如：my_voice_gateway"
                    onChange={(event) => updateForm({ providerKey: event.target.value })}
                  />
                </Field>

                <Field
                  label="接口地址"
                  hint="填写服务商的 OpenAI 兼容地址或自定义端点地址，通常以 /v1 结尾。"
                >
                  <Input
                    value={form.baseURL}
                    placeholder="https://api.example.com/v1"
                    onChange={(event) => updateForm({ baseURL: event.target.value })}
                  />
                </Field>

                <Field label="模型名">
                  <Input
                    value={form.model}
                    placeholder="例如：seedance-1-0-pro"
                    onChange={(event) => updateForm({ model: event.target.value })}
                  />
                </Field>
              </div>

              <Field
                label="API Key"
                hint={editingProvider?.hasApiKey && !form.clearApiKey
                  ? "留空表示保持当前密钥不变。"
                  : "服务商要求的密钥，仅用于请求上游接口。"}
              >
                <Input
                  type="password"
                  value={form.apiKey}
                  disabled={form.clearApiKey}
                  placeholder={editingProvider?.hasApiKey ? form.apiKey ? "" : `当前密钥：${editingProvider.apiKeyMasked ?? "已保存"}` : "输入 API Key"}
                  onChange={(event) => updateForm({ apiKey: event.target.value })}
                />
              </Field>

              {editingProvider?.hasApiKey ? (
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={form.clearApiKey}
                    onChange={(event) => updateForm({ clearApiKey: event.target.checked, apiKey: "" })}
                  />
                  清除已保存的密钥
                </label>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="每秒成本" hint="用于估算生成费用，可填写 0。">
                  <Input
                    type="number"
                    min={0}
                    value={form.costPerSecond}
                    placeholder="例如：0.02"
                    onChange={(event) => updateForm({ costPerSecond: event.target.value })}
                  />
                </Field>

                <Field label="币种">
                  <Input
                    value={form.currency}
                    placeholder="例如：CNY"
                    onChange={(event) => updateForm({ currency: event.target.value })}
                  />
                </Field>
              </div>

              {form.kind === "video" ? (
                <div className="flex items-center justify-between gap-3 rounded-md border p-3">
                  <div className="space-y-0.5">
                    <div className="text-sm">支持参考图</div>
                    <div className="text-xs text-muted-foreground">
                      开启后，生成视频时可以上传参考图控制画面。
                    </div>
                  </div>
                  <Switch
                    aria-label="是否支持参考图"
                    checked={form.supportsRefImages}
                    onCheckedChange={(checked) => updateForm({ supportsRefImages: checked })}
                  />
                </div>
              ) : null}

              <div className="flex items-center justify-between gap-3 rounded-md border p-3">
                <div className="space-y-0.5">
                  <div className="text-sm">启用通道</div>
                  <div className="text-xs text-muted-foreground">
                    停用后这个通道不参与生成，可随时再开启。
                  </div>
                </div>
                <Switch
                  aria-label="是否启用通道"
                  checked={form.isActive}
                  onCheckedChange={(checked) => updateForm({ isActive: checked })}
                />
              </div>

              <div className="rounded-md border">
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium"
                  onClick={() => setShowAdvanced((prev) => !prev)}
                >
                  高级设置
                  <ChevronDown className={`h-4 w-4 transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
                </button>
                {showAdvanced ? (
                  <div className="space-y-3 border-t p-3">
                    <p className="text-xs text-muted-foreground">
                      接口路径、请求体模板和取值路径按服务商文档填写，留空时使用协议内置约定。
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="合成路径">
                        <Input
                          value={form.synthesizePath}
                          placeholder="/tts/synthesize"
                          onChange={(event) => updateForm({ synthesizePath: event.target.value })}
                        />
                      </Field>
                      <Field label="创建任务路径">
                        <Input
                          value={form.createPath}
                          placeholder="/video/tasks"
                          onChange={(event) => updateForm({ createPath: event.target.value })}
                        />
                      </Field>
                      <Field label="查询任务路径" hint="支持 {taskId} 占位符。">
                        <Input
                          value={form.statusPath}
                          placeholder="/tasks/{taskId}"
                          onChange={(event) => updateForm({ statusPath: event.target.value })}
                        />
                      </Field>
                      <Field label="语音合成路径">
                        <Input
                          value={form.speechPath}
                          placeholder="/audio/speech"
                          onChange={(event) => updateForm({ speechPath: event.target.value })}
                        />
                      </Field>
                      <Field label="返回音频格式">
                        <Input
                          value={form.responseFormat}
                          placeholder="例如：mp3"
                          onChange={(event) => updateForm({ responseFormat: event.target.value })}
                        />
                      </Field>
                      <Field label="默认音色">
                        <Input
                          value={form.defaultVoice}
                          placeholder="例如：alloy"
                          onChange={(event) => updateForm({ defaultVoice: event.target.value })}
                        />
                      </Field>
                      <Field label="单次请求超时（毫秒）">
                        <Input
                          type="number"
                          min={1}
                          value={form.timeoutMs}
                          placeholder="例如：60000"
                          onChange={(event) => updateForm({ timeoutMs: event.target.value })}
                        />
                      </Field>
                      <Field label="任务标识取值路径">
                        <Input
                          value={form.taskIdPath}
                          placeholder="例如：data.task_id"
                          onChange={(event) => updateForm({ taskIdPath: event.target.value })}
                        />
                      </Field>
                      <Field label="状态取值路径">
                        <Input
                          value={form.statusValuePath}
                          placeholder="例如：data.status"
                          onChange={(event) => updateForm({ statusValuePath: event.target.value })}
                        />
                      </Field>
                      <Field label="结果地址取值路径">
                        <Input
                          value={form.resultUrlPath}
                          placeholder="例如：data.output.url"
                          onChange={(event) => updateForm({ resultUrlPath: event.target.value })}
                        />
                      </Field>
                    </div>

                    <Field label="附加请求头（JSON 对象）">
                      <textarea
                        className={TEXTAREA_CLASS}
                        value={form.headersText}
                        placeholder={'{\n  "Authorization": "Bearer 密钥"\n}'}
                        onChange={(event) => updateForm({ headersText: event.target.value })}
                      />
                    </Field>

                    <Field label="请求体模板（JSON 对象）">
                      <textarea
                        className={TEXTAREA_CLASS}
                        value={form.payloadText}
                        placeholder={'{\n  "model": "${model}",\n  "prompt": "${prompt}"\n}'}
                        onChange={(event) => updateForm({ payloadText: event.target.value })}
                      />
                    </Field>

                    <Field label="状态映射（JSON 对象）" hint="把上游返回的状态文字映射为排队、进行中、成功、失败。">
                      <textarea
                        className={TEXTAREA_CLASS}
                        value={form.statusMapText}
                        placeholder={'{\n  "SUCCESS": "succeeded",\n  "FAILED": "failed"\n}'}
                        onChange={(event) => updateForm({ statusMapText: event.target.value })}
                      />
                    </Field>
                  </div>
                ) : null}
              </div>

              {saveMutation.isError ? (
                <div className="text-sm text-destructive">
                  保存失败，请检查填写内容后重试。
                </div>
              ) : null}
            </div>
          ) : null}
        </AppDialogContent>
      </Dialog>
    </SettingsShell>
  );
}
