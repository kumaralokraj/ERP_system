import express from "express";
import {
  getResultsForClassSession,
  saveBulkResults,
  updateResult,
} from "../controllers/resultController.js";
import adminAuth from "../middlewares/adminAuth.js";
import { authorizeAnyPermission } from "../middleware/permissions.js";

const resultRouter = express.Router();

resultRouter.get(
  "/results/class-session/:classSessionId",
  adminAuth,
  authorizeAnyPermission("classes.view", "promotions.view"),
  getResultsForClassSession
);
resultRouter.post(
  "/results/bulk",
  adminAuth,
  authorizeAnyPermission("classes.view", "promotions.view"),
  saveBulkResults
);
resultRouter.put(
  "/results/:resultId",
  adminAuth,
  authorizeAnyPermission("classes.view", "promotions.view"),
  updateResult
);

export default resultRouter;
