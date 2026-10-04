/**
 * 生图确认弹窗触发 hook
 *
 * 使用方式：
 *   const flow = useImageGenerationFlow();
 *   <button onClick={() => flow.start({
 *     prepare: () => prepareCharacterAssetImage(asset.id, provider),
 *     generate: (overrides) => generateCharacterAssetImage(asset.id, provider, overrides),
 *     onSuccess: () => refresh(),
 *   })}>AI 生图</button>
 *   <ImageGenerationConfirmDialog {...flow.dialogProps} />
 *
 * 流程：start → prepare 拿预览 → 弹窗 → 用户 confirm/取消 → 确认时 generate
 */
import { useEffect, useRef, useState } from "react";

import { toast } from "@/components/ui/toast";
import type { ImageGenerationOverrides, ImageGenerationPreview } from "@/api/comic";

interface StartOptions<TResult = unknown> {
  prepare: () => Promise<ImageGenerationPreview>;
  generate: (overrides: ImageGenerationOverrides) => Promise<TResult>;
  onSuccess?: (result: TResult) => void;
  onError?: (err: unknown) => void;
}

export function useImageGenerationFlow() {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<ImageGenerationPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const requestVersion = useRef(0);
  const submitLock = useRef(false);
  const activeGenerate = useRef<((overrides: ImageGenerationOverrides) => Promise<void>) | null>(null);

  useEffect(() => () => {
    requestVersion.current += 1;
    activeGenerate.current = null;
  }, []);

  const start = async <TResult>({ prepare, generate, onSuccess, onError }: StartOptions<TResult>) => {
    if (submitLock.current) return;
    const version = ++requestVersion.current;
    activeGenerate.current = null;
    setOpen(true);
    setLoading(true);
    setPreview(null);
    try {
      const prepared = await prepare();
      if (version !== requestVersion.current) return;
      setPreview(prepared);
      setLoading(false);
      let completed = false;
      activeGenerate.current = async (overrides) => {
        if (version !== requestVersion.current || submitLock.current || completed) return;
        submitLock.current = true;
        setSubmitting(true);
        try {
          const result = await generate(overrides);
          completed = true;
          if (version !== requestVersion.current) return;
          activeGenerate.current = null;
          setOpen(false);
          setPreview(null);
          onSuccess?.(result);
        } catch (err) {
          if (version !== requestVersion.current) return;
          toast.error(err instanceof Error ? err.message : String(err));
          onError?.(err);
        } finally {
          submitLock.current = false;
          if (version === requestVersion.current) setSubmitting(false);
        }
      };
    } catch (err) {
      if (version !== requestVersion.current) return;
      setLoading(false);
      setOpen(false);
      toast.error(err instanceof Error ? err.message : String(err));
      onError?.(err);
    }
  };

  const cancel = () => {
    if (submitLock.current) return;
    requestVersion.current += 1;
    activeGenerate.current = null;
    setOpen(false);
    setLoading(false);
    setPreview(null);
  };

  const confirm = activeGenerate.current;
  return {
    start,
    dialogProps: {
      open,
      preview,
      loading,
      submitting,
      onCancel: cancel,
      onConfirm: (overrides: ImageGenerationOverrides) => {
        void confirm?.(overrides);
      },
    },
  };
}
