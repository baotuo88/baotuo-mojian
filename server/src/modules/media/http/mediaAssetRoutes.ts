import { Router } from "express";
import { AppError } from "../../../middleware/errorHandler";
import { validate } from "../../../middleware/validate";
import { mediaAssetParamsSchema } from "../domain/mediaProviderContracts";
import { contentTypeForFileName, resolveMediaAssetPath } from "../infrastructure/mediaAssetStore";

const router = Router();

/** 读取落盘的媒体资产。文件名由后端生成并严格校验，避免路径穿越。 */
router.get("/assets/:kind/:fileName", validate({ params: mediaAssetParamsSchema }), (req, res, next) => {
  const { kind, fileName } = req.params as { kind: string; fileName: string };
  let filePath: string;
  try {
    filePath = resolveMediaAssetPath(kind, fileName);
  } catch {
    next(new AppError("媒体资产地址不合法。", 400));
    return;
  }
  res.type(contentTypeForFileName(fileName));
  res.sendFile(filePath, (error) => {
    if (error) {
      next(new AppError("媒体资产不存在或已清理。", 404));
    }
  });
});

export default router;
