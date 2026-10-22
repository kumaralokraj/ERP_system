import express from "express";
import {
  collectFamilyFeePayment,
  getClassMonthlyFeesReport,
  getFamilyFeesByStudent,
  getFamilyFeesList,
  getFamilyPaymentsHistory,
  getFamilyReceipt,
  getFamilyStatement,
  previewFamilyFeePayment,
} from "../../controllers/adminFamilyFeesController.js";
import adminAuth from "../../middlewares/adminAuth.js";
import { authorizeAnyPermission, authorizePermissions } from "../../middleware/permissions.js";

const adminFamilyFeesRouter = express.Router();

adminFamilyFeesRouter.get(
  "/families",
  adminAuth,
  authorizeAnyPermission("fees.view", "dashboard.view"),
  getFamilyFeesList
);
adminFamilyFeesRouter.get(
  "/families/search",
  adminAuth,
  authorizeAnyPermission("fees.view", "dashboard.view"),
  getFamilyFeesList
);
adminFamilyFeesRouter.get(
  "/families/by-student/:studentId",
  adminAuth,
  authorizePermissions("fees.view"),
  getFamilyFeesByStudent
);
adminFamilyFeesRouter.get(
  "/families/:familyId/statement",
  adminAuth,
  authorizePermissions("fees.view"),
  getFamilyStatement
);
adminFamilyFeesRouter.get(
  "/families/:familyId/payments",
  adminAuth,
  authorizePermissions("fees.view"),
  getFamilyPaymentsHistory
);
adminFamilyFeesRouter.post(
  "/classes/monthly-fees-report",
  adminAuth,
  authorizePermissions("fees.view"),
  getClassMonthlyFeesReport
);
adminFamilyFeesRouter.post(
  "/family/payment/preview",
  adminAuth,
  authorizeAnyPermission("fees.collect", "fees.view"),
  previewFamilyFeePayment
);
adminFamilyFeesRouter.post(
  "/family/payment",
  adminAuth,
  authorizePermissions("fees.collect"),
  collectFamilyFeePayment
);
adminFamilyFeesRouter.get(
  "/family/payment/:transactionId/receipt",
  adminAuth,
  authorizePermissions("fees.view"),
  getFamilyReceipt
);

export default adminFamilyFeesRouter;
