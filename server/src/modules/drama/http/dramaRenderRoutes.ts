import { Router } from "express";
import { z } from "zod";
import { validate } from "../../../middleware/validate";
import { dramaRenderService } from "../../../services/drama/render";

const router = Router();
const episodeParams = z.object({ id: z.string().trim().min(1), order: z.coerce.number().int().min(1) });
const jobParams = z.object({ id: z.string().trim().min(1), jobId: z.string().trim().min(1) });

router.get("/projects/:id/episodes/:order/renders", validate({ params: episodeParams }), async (req, res, next) => {
  try {
    const { id, order } = req.params as unknown as z.infer<typeof episodeParams>;
    res.json({ success: true, data: await dramaRenderService.list(id, order) });
  } catch (error) { next(error); }
});

router.post("/projects/:id/episodes/:order/renders", validate({ params: episodeParams }), async (req, res, next) => {
  try {
    const { id, order } = req.params as unknown as z.infer<typeof episodeParams>;
    res.status(202).json({ success: true, data: await dramaRenderService.start(id, order) });
  } catch (error) { next(error); }
});

router.post("/projects/:id/renders/:jobId/cancel", validate({ params: jobParams }), async (req, res, next) => {
  try {
    const { id, jobId } = req.params as z.infer<typeof jobParams>;
    res.json({ success: true, data: await dramaRenderService.cancel(id, jobId) });
  } catch (error) { next(error); }
});

export default router;
