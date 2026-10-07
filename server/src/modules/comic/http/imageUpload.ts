import { raw, type RequestHandler } from "express";
import { AppError } from "../../../middleware/errorHandler";

const parseImage = raw({
  type: ["image/png", "image/jpeg", "image/webp"],
  limit: "20mb",
  inflate: false,
});

/** Keep the API limit effective even when clients bypass the reverse proxy. */
export const comicImageUpload: RequestHandler = (req, res, next) => {
  if (!req.is(["image/png", "image/jpeg", "image/webp"])) {
    next(new AppError("请上传 PNG、JPEG 或 WebP 图片。", 415));
    return;
  }
  parseImage(req, res, (error?: unknown) => {
    if (error) {
      const status = (error as { status?: number }).status;
      next(
        new AppError(
          status === 413
            ? "图片不能超过 20 MB，请缩小后上传。"
            : "图片上传失败，请使用未压缩的图片文件重试。",
          status === 413 ? 413 : 400,
        ),
      );
      return;
    }
    if (!Buffer.isBuffer(req.body) || !req.body.length) {
      next(new AppError("未收到图片数据，请重新选择图片。", 400));
      return;
    }
    next();
  });
};
