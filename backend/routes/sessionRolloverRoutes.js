import express from "express";
import {
  cloneSessionRollover,
  getSessionRolloverPreview,
} from "../controllers/sessionRolloverController.js";
import adminAuth from "../middlewares/adminAuth.js";
import { authorizePermissions } from "../middleware/permissions.js";

const sessionRolloverRouter = express.Router();

sessionRolloverRouter.get(
  "/session-rollover/preview",
  adminAuth,
  authorizePermissions("promotions.view"),
  getSessionRolloverPreview
);
sessionRolloverRouter.post(
  "/session-rollover/clone",
  adminAuth,
  authorizePermissions("promotions.view"),
  cloneSessionRollover
);

export default sessionRolloverRouter;
