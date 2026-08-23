import ClassSession from "../models/ClassSession.js";
import PromotionBatch from "../models/PromotionBatch.js";
import PromotionBatchItem from "../models/PromotionBatchItem.js";
import PromotionLog from "../models/PromotionLog.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import {
  isValidObjectId,
  normalizeAcademicYear,
  sendValidationError,
  trimString,
} from "../utils/requestValidation.js";
import { serializeClassRecord } from "../services/academicStructureService.js";
import {
  buildPromotionPreview,
  createPromotionBatch,
  executePromotionBatch,
} from "../services/promotionService.js";

const CLASS_SESSION_POPULATION = [
  { path: "classId", select: "name order" },
  { path: "classTeacher", select: "name email phone" },
];

const serializeBatch = (batchRecord) => {
  const batch = batchRecord?.toObject ? batchRecord.toObject() : batchRecord;
  if (!batch) {
    return null;
  }

  return {
    _id: batch._id,
    batchNo: batch.batchNo,
    currentYear: batch.currentYear,
    nextYear: batch.nextYear,
    scope: batch.scope,
    status: batch.status,
    counts: batch.counts,
    summary: batch.summary,
    requestedBy: batch.requestedBy,
    startedAt: batch.startedAt,
    completedAt: batch.completedAt,
    failureReason: batch.failureReason || "",
    createdAt: batch.createdAt,
    updatedAt: batch.updatedAt,
  };
};

const serializeBatchItem = (itemRecord) => {
  const item = itemRecord?.toObject ? itemRecord.toObject() : itemRecord;
  if (!item) {
    return null;
  }

  return {
    _id: item._id,
    batchId: item.batchId,
    studentId: item.studentId,
    fromEnrollmentId: item.fromEnrollmentId,
    toEnrollmentId: item.toEnrollmentId,
    fromClassSessionId: item.fromClassSessionId,
    recommendedToClassSessionId: item.recommendedToClassSessionId,
    finalToClassSessionId: item.finalToClassSessionId,
    resultId: item.resultId,
    resultStatus: item.resultStatus,
    sourceResultStatus: item.sourceResultStatus || "",
    decision: item.decision,
    decisionSource: item.decisionSource || "system",
    manualOverride: Boolean(item.manualOverride),
    status: item.status,
    validationMessages: item.validationMessages || [],
    warningMessages: item.warningMessages || [],
    errorMessages: item.errorMessages || [],
    note: item.note || "",
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
};

export const getPromotionContext = async (req, res) => {
  try {
    const currentYear = normalizeAcademicYear(req.query.currentYear);
    const nextYear = normalizeAcademicYear(req.query.nextYear);

    if (!currentYear || !nextYear) {
      return sendValidationError(res, "Valid current and next academic years are required");
    }

    const [sourceSessions, targetSessions, currentEnrollments, targetEnrollments, existingBatches] =
      await Promise.all([
        ClassSession.find({ academicYear: currentYear }).populate(CLASS_SESSION_POPULATION),
        ClassSession.find({ academicYear: nextYear }).populate(CLASS_SESSION_POPULATION),
        StudentEnrollment.find({ academicYear: currentYear, isCurrent: true }).select("classSessionId"),
        StudentEnrollment.find({ academicYear: nextYear, isCurrent: true }).select("classSessionId"),
        PromotionBatch.find({ currentYear, nextYear }).sort({ createdAt: -1 }).limit(10).lean(),
      ]);

    const countByClassSession = (enrollments = []) =>
      enrollments.reduce((counts, enrollment) => {
        const classSessionId = String(enrollment.classSessionId || "");
        counts[classSessionId] = (counts[classSessionId] || 0) + 1;
        return counts;
      }, {});

    return res.status(200).json({
      success: true,
      currentYear,
      nextYear,
      sourceSessions: sourceSessions.map(serializeClassRecord),
      targetSessions: targetSessions.map(serializeClassRecord),
      sourceEnrollmentCounts: countByClassSession(currentEnrollments),
      targetEnrollmentCounts: countByClassSession(targetEnrollments),
      existingBatches: existingBatches.map(serializeBatch),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to load promotion context",
    });
  }
};

export const previewPromotion = async (req, res) => {
  try {
    const preview = await buildPromotionPreview({
      currentYear: req.body.currentYear,
      nextYear: req.body.nextYear,
      scope: req.body.scope,
      classSessionId: req.body.classSessionId,
      studentDecisions: Array.isArray(req.body.studentDecisions) ? req.body.studentDecisions : [],
    });

    if (preview.error) {
      return res.status(preview.error.statusCode).json({
        success: false,
        message: preview.error.message,
      });
    }

    return res.status(200).json({
      success: true,
      ...preview,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to preview promotion",
    });
  }
};

export const createBatch = async (req, res) => {
  try {
    const result = await createPromotionBatch({
      currentYear: req.body.currentYear,
      nextYear: req.body.nextYear,
      scope: req.body.scope,
      studentDecisions: Array.isArray(req.body.studentDecisions) ? req.body.studentDecisions : [],
      requestedBy: req.user?.id || null,
    });

    if (result.error) {
      return res.status(result.error.statusCode).json({
        success: false,
        message: result.error.message,
        preview: result.preview || null,
      });
    }

    return res.status(201).json({
      success: true,
      message: "Promotion batch created",
      batch: serializeBatch(result.batch),
      preview: result.preview,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to create promotion batch",
    });
  }
};

export const getBatchById = async (req, res) => {
  try {
    const batchId = trimString(req.params.batchId);

    if (!isValidObjectId(batchId)) {
      return sendValidationError(res, "Valid promotion batch ID is required");
    }

    const [batch, items] = await Promise.all([
      PromotionBatch.findById(batchId).lean(),
      PromotionBatchItem.find({ batchId }).sort({ createdAt: 1 }).lean(),
    ]);

    if (!batch) {
      return res.status(404).json({
        success: false,
        message: "Promotion batch not found",
      });
    }

    return res.status(200).json({
      success: true,
      batch: serializeBatch(batch),
      items: items.map(serializeBatchItem),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to load promotion batch",
    });
  }
};

export const executeBatch = async (req, res) => {
  try {
    const idempotencyKey = req.headers["idempotency-key"] || req.body.idempotencyKey || "";
    const result = await executePromotionBatch({
      batchId: req.params.batchId,
      idempotencyKey,
      performedBy: req.user?.id || null,
    });

    if (result.error) {
      return res.status(result.error.statusCode).json({
        success: false,
        message: result.error.message,
        batch: serializeBatch(result.batch),
      });
    }

    return res.status(200).json({
      success: true,
      message: result.alreadyProcessed ? "Promotion batch already executed" : "Promotion batch executed",
      batch: serializeBatch(result.batch),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to execute promotion batch",
    });
  }
};

export const getPromotionLogs = async (req, res) => {
  try {
    const query = {};
    const studentId = trimString(req.query.studentId);
    const batchId = trimString(req.query.batchId);

    if (studentId) {
      if (!isValidObjectId(studentId)) {
        return sendValidationError(res, "Valid student ID is required");
      }
      query.studentId = studentId;
    }

    if (batchId) {
      if (!isValidObjectId(batchId)) {
        return sendValidationError(res, "Valid batch ID is required");
      }
      query.batchId = batchId;
    }

    const logs = await PromotionLog.find(query)
      .sort({ createdAt: -1 })
      .limit(200)
      .populate("studentId", "firstName lastName studentId admissionNo")
      .lean();

    return res.status(200).json({
      success: true,
      logs,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to load promotion logs",
    });
  }
};
