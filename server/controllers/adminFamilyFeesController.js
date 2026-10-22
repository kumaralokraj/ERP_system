import {
  buildClassMonthlyFeesReport,
  buildFamilyStatement,
  collectFamilyPayment,
  getFamilyPaymentReceipt,
  listFamilyCards,
  listFamilyPayments,
  previewFamilyPayment,
  resolveFamilyByStudent,
  searchFamilies,
} from "../services/familyFeeService.js";
import {
  isValidObjectId,
  normalizeAcademicYear,
  sendValidationError,
  toNumber,
  trimString,
} from "../utils/requestValidation.js";

const getRequestAcademicYear = (req) =>
  normalizeAcademicYear(req.query?.academicYear || req.body?.academicYear) ||
  trimString(req.query?.academicYear || req.body?.academicYear);

const getPaymentDate = (value) => {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? null : date;
};

const getUseAdvance = (value) =>
  value === true || value === "true" || value === 1 || value === "1";

export const getFamilyFeesList = async (req, res) => {
  try {
    const query = trimString(req.query.q);
    const academicYear = getRequestAcademicYear(req);
    const result = query
      ? await searchFamilies({ query, academicYear })
      : await listFamilyCards({ academicYear });

    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("Unable to fetch family fee records:", error.stack || error);
    res.status(500).json({
      success: false,
      message: error.message || "Unable to fetch family fee records",
    });
  }
};

export const getFamilyFeesByStudent = async (req, res) => {
  try {
    const studentId = trimString(req.params.studentId);
    if (!studentId || !isValidObjectId(studentId)) {
      return sendValidationError(res, "Valid student ID is required");
    }

    const result = await resolveFamilyByStudent({
      studentId,
      academicYear: getRequestAcademicYear(req),
      includeStatement:
        req.query?.includeStatement === "true" || req.query?.includeStatement === "1",
    });

    if (result.error) {
      return res.status(result.error.statusCode || 404).json({
        success: false,
        message: result.error.message,
      });
    }

    return res.status(200).json({
      success: true,
      familyId: result.familyId,
      family: result.family,
      statement: result.statement,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Unable to resolve family for student",
    });
  }
};

export const getFamilyStatement = async (req, res) => {
  try {
    const familyId = trimString(req.params.familyId);
    if (!familyId || !isValidObjectId(familyId)) {
      return sendValidationError(res, "Valid family ID is required");
    }

    const result = await buildFamilyStatement({
      familyId,
      academicYear: getRequestAcademicYear(req),
    });

    if (result.error) {
      return res.status(result.error.statusCode || 404).json({
        success: false,
        message: result.error.message,
      });
    }

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Unable to fetch family statement",
    });
  }
};

export const previewFamilyFeePayment = async (req, res) => {
  try {
    const familyId = trimString(req.body.familyId);
    const amount = toNumber(req.body.amount);
    const paymentDate = getPaymentDate(req.body.date);
    const useAdvance = getUseAdvance(req.body.useAdvance);

    if (!familyId || !isValidObjectId(familyId)) {
      return sendValidationError(res, "Valid family ID is required");
    }

    if (!Number.isFinite(amount) || amount < 0 || (amount <= 0 && !useAdvance)) {
      return sendValidationError(res, "Enter a valid payment amount");
    }

    if (!paymentDate) {
      return sendValidationError(res, "Payment date is invalid");
    }

    const result = await previewFamilyPayment({
      familyId,
      academicYear: getRequestAcademicYear(req),
      amount,
      paymentDate,
      startFromMonth: req.body.startFromMonth,
      useAdvance,
    });

    if (result.error) {
      return res.status(result.error.statusCode || 400).json({
        success: false,
        message: result.error.message,
      });
    }

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Unable to preview family payment",
    });
  }
};

export const collectFamilyFeePayment = async (req, res) => {
  try {
    const familyId = trimString(req.body.familyId);
    const amount = toNumber(req.body.amount);
    const paymentDate = getPaymentDate(req.body.date);
    const mode = trimString(req.body.mode) || "cash";
    const useAdvance = getUseAdvance(req.body.useAdvance);

    if (!familyId || !isValidObjectId(familyId)) {
      return sendValidationError(res, "Valid family ID is required");
    }

    if (!Number.isFinite(amount) || amount < 0 || (amount <= 0 && !useAdvance)) {
      return sendValidationError(res, "Enter a valid payment amount");
    }

    if (!paymentDate) {
      return sendValidationError(res, "Payment date is invalid");
    }

    const result = await collectFamilyPayment({
      familyId,
      academicYear: getRequestAcademicYear(req),
      amount,
      paymentDate,
      mode,
      note: req.body.note,
      startFromMonth: req.body.startFromMonth,
      useAdvance,
      adminId: req.user?.id || null,
      idempotencyKey: req.headers["idempotency-key"] || req.body.idempotencyKey,
    });

    if (result.error) {
      return res.status(result.error.statusCode || 400).json({
        success: false,
        message: result.error.message,
      });
    }

    return res.status(result.alreadyProcessed ? 200 : 201).json({
      success: true,
      alreadyProcessed: Boolean(result.alreadyProcessed),
      message: result.alreadyProcessed ? "Family payment already processed" : "Family payment recorded successfully",
      data: {
        familyPayment: result.familyPayment,
        transactionId: result.familyPayment.transactionId,
        amountCollected: result.familyPayment.amountCollected,
        allocatedAmount: result.familyPayment.allocatedAmount,
        advanceCreated: result.familyPayment.advanceCreated,
        advanceBalanceAfter: result.familyPayment.advanceBalanceAfter,
        monthsCovered: result.familyPayment.monthSummary,
        siblingsUpdated: result.familyPayment.siblingSummary,
        allocations: result.familyPayment.allocations,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Unable to collect family payment",
    });
  }
};

export const getFamilyReceipt = async (req, res) => {
  try {
    const transactionId = trimString(req.params.transactionId);
    if (!transactionId) {
      return sendValidationError(res, "Transaction ID is required");
    }

    const result = await getFamilyPaymentReceipt({ transactionId });
    if (result.error) {
      return res.status(result.error.statusCode || 404).json({
        success: false,
        message: result.error.message,
      });
    }

    return res.status(200).json({
      success: true,
      data: result.payment,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Unable to fetch family receipt",
    });
  }
};

export const getFamilyPaymentsHistory = async (req, res) => {
  try {
    const familyId = trimString(req.params.familyId);
    if (!familyId || !isValidObjectId(familyId)) {
      return sendValidationError(res, "Valid family ID is required");
    }

    const result = await listFamilyPayments({
      familyId,
      academicYear: getRequestAcademicYear(req),
    });

    if (result.error) {
      return res.status(result.error.statusCode || 400).json({
        success: false,
        message: result.error.message,
      });
    }

    return res.status(200).json({
      success: true,
      data: result.payments,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Unable to fetch family payment history",
    });
  }
};

export const getClassMonthlyFeesReport = async (req, res) => {
  try {
    const rawStudentIds = Array.isArray(req.body?.studentIds) ? req.body.studentIds : [];
    const studentIds = rawStudentIds
      .map((value) => trimString(value))
      .filter((value) => value && isValidObjectId(value));

    if (studentIds.length === 0) {
      return sendValidationError(res, "At least one valid studentId is required");
    }

    const monthKeys = Array.isArray(req.body?.monthKeys)
      ? req.body.monthKeys.map((value) => trimString(value)).filter(Boolean)
      : [];

    const result = await buildClassMonthlyFeesReport({
      studentIds,
      academicYear: getRequestAcademicYear(req),
      monthKeys,
    });

    if (result?.error) {
      return res.status(result.error.statusCode || 400).json({
        success: false,
        message: result.error.message,
      });
    }

    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Unable to build monthly fees report",
    });
  }
};
