import { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { validate } from "../../../middleware/validate";
import { mediaProviderService } from "../application/MediaProviderService";
import {
  MEDIA_PROTOCOLS_BY_KIND,
  MEDIA_PROVIDER_KIND_LABELS,
  MEDIA_PROVIDER_PROTOCOL_LABELS,
  createMediaProviderSchema,
  mediaProviderIdSchema,
  updateMediaProviderSchema,
  type CreateMediaProviderInput,
  type MediaProviderKind,
  type MediaProviderView,
  type UpdateMediaProviderInput,
} from "../domain/mediaProviderContracts";

const router = Router();

type MediaProviderKindMeta = {
  kind: MediaProviderKind;
  label: string;
  protocols: Array<{ protocol: string; label: string }>;
};

function listKindMeta(): MediaProviderKindMeta[] {
  return (Object.keys(MEDIA_PROTOCOLS_BY_KIND) as MediaProviderKind[]).map((kind) => ({
    kind,
    label: MEDIA_PROVIDER_KIND_LABELS[kind],
    protocols: MEDIA_PROTOCOLS_BY_KIND[kind].map((protocol) => ({
      protocol,
      label: MEDIA_PROVIDER_PROTOCOL_LABELS[protocol],
    })),
  }));
}

type MediaProviderListPayload = {
  providers: MediaProviderView[];
  kinds: MediaProviderKindMeta[];
};

router.get("/providers", async (_req, res, next) => {
  try {
    const providers = await mediaProviderService.list();
    res.status(200).json({
      success: true,
      data: { providers, kinds: listKindMeta() },
      message: "媒体通道已加载。",
    } satisfies ApiResponse<MediaProviderListPayload>);
  } catch (error) {
    next(error);
  }
});

router.post("/providers", validate({ body: createMediaProviderSchema }), async (req, res, next) => {
  try {
    const data = await mediaProviderService.create(req.body as CreateMediaProviderInput);
    res.status(201).json({
      success: true,
      data,
      message: "媒体通道已创建。",
    } satisfies ApiResponse<MediaProviderView>);
  } catch (error) {
    next(error);
  }
});

router.patch(
  "/providers/:id",
  validate({ params: mediaProviderIdSchema, body: updateMediaProviderSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as { id: string };
      const data = await mediaProviderService.update(id, req.body as UpdateMediaProviderInput);
      res.status(200).json({
        success: true,
        data,
        message: "媒体通道已更新。",
      } satisfies ApiResponse<MediaProviderView>);
    } catch (error) {
      next(error);
    }
  },
);

router.delete("/providers/:id", validate({ params: mediaProviderIdSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };
    const data = await mediaProviderService.remove(id);
    res.status(200).json({
      success: true,
      data,
      message: "媒体通道已删除。",
    } satisfies ApiResponse<{ id: string }>);
  } catch (error) {
    next(error);
  }
});

export default router;
