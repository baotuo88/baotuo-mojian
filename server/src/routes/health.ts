import { Router, type Request, type Response } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { authMiddleware } from "../middleware/auth";

const router = Router();

function sendLiveness(_req: Request, res: Response) {
  const response: ApiResponse<{ status: string; timestamp: string }> = {
    success: true,
    data: {
      status: "ok",
      timestamp: new Date().toISOString(),
    },
    message: "服务运行正常。",
  };
  res.status(200).json(response);
}

router.get("/live", sendLiveness);
router.use(authMiddleware);
router.get("/", sendLiveness);

export default router;
