import express from "express";
import {
  createBatch,
  executeBatch,
  getBatchById,
  getPromotionContext,
  getPromotionLogs,
  previewPromotion,
} from "../controllers/promotionController.js";
import adminAuth from "../middlewares/adminAuth.js";
import { authorizePermissions } from "../middleware/permissions.js";

const promotionRouter = express.Router();

promotionRouter.get("/promotions/context", adminAuth, authorizePermissions("promotions.view"), getPromotionContext);
promotionRouter.post("/promotions/preview", adminAuth, authorizePermissions("promotions.view"), previewPromotion);
promotionRouter.post("/promotions/batches", adminAuth, authorizePermissions("promotions.view"), createBatch);
promotionRouter.get("/promotions/batches/:batchId", adminAuth, authorizePermissions("promotions.view"), getBatchById);
promotionRouter.post(
  "/promotions/batches/:batchId/execute",
  adminAuth,
  authorizePermissions("promotions.view"),
  executeBatch
);
promotionRouter.get("/promotions/logs", adminAuth, authorizePermissions("promotions.view"), getPromotionLogs);

export default promotionRouter;
