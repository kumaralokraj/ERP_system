import mongoose from "mongoose";
import Class from "../models/Class.js";
import ClassSession from "../models/ClassSession.js";
import PromotionBatch from "../models/PromotionBatch.js";
import PromotionBatchItem from "../models/PromotionBatchItem.js";
import PromotionLog from "../models/PromotionLog.js";
import Student from "../models/Student.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import StudentResult from "../models/StudentResult.js";
import { isValidObjectId, normalizeAcademicYear, trimString } from "../utils/requestValidation.js";
import {
  createFeesRecordForEnrollment,
  getNextAcademicYear,
  getPreviousAcademicYear,
  serializeClassRecord,
  syncStudentOperationalRecords,
  upsertCurrentEnrollment,
} from "./academicStructureService.js";

const buildSessionLookup = (classSessions = []) => {
  const byId = new Map();
  const byClassSection = new Map();
  const byClass = new Map();

  classSessions.forEach((classSession) => {
    const serializedSession = serializeClassRecord(classSession);
    const sessionId = String(serializedSession._id);
    const classId = String(serializedSession.classId?._id || "");
    const section = serializedSession.section || "";

    byId.set(sessionId, classSession);

    if (!byClass.has(classId)) {
      byClass.set(classId, []);
    }
    byClass.get(classId).push(classSession);

    byClassSection.set(`${classId}::${section}`, classSession);
  });

  return { byId, byClass, byClassSection };
};

const normalizePromotionAction = (value) => {
  const normalizedValue = `${value || ""}`.trim().toLowerCase();
  if (normalizedValue === "retain") {
    return "repeat";
  }
  return normalizedValue;
};

export const promoteStudentsForNextYear = async ({
  currentYear,
  nextYear,
  failedStudentIds = [],
  studentDecisions = [],
}) => {
  const normalizedCurrentYear = normalizeAcademicYear(currentYear);
  const normalizedNextYear = normalizeAcademicYear(nextYear);

  const currentEnrollments = await StudentEnrollment.find({
    academicYear: normalizedCurrentYear,
    isCurrent: true,
  }).populate([
    { path: "studentId", select: "firstName lastName studentId status" },
    {
      path: "classSessionId",
      populate: [
        { path: "classId", select: "name order" },
        { path: "classTeacher", select: "name email phone" },
      ],
    },
  ]);

  const nextYearSessions = await ClassSession.find({
    academicYear: normalizedNextYear,
    status: "ACTIVE",
  }).populate([
    { path: "classId", select: "name order" },
    { path: "classTeacher", select: "name email phone" },
  ]);

  const masterClasses = await Class.find().sort({ order: 1 });
  const nextClassByOrder = new Map(masterClasses.map((classRecord) => [Number(classRecord.order), classRecord]));
  const nextYearLookup = buildSessionLookup(nextYearSessions);
  const failedStudentIdSet = new Set(failedStudentIds.map((studentId) => String(studentId)));
  const decisionMap = new Map(
    studentDecisions
      .filter((decision) => decision?.studentId)
      .map((decision) => [String(decision.studentId), decision])
  );

  const summary = {
    currentYear: normalizedCurrentYear,
    nextYear: normalizedNextYear,
    total: currentEnrollments.length,
    promoted: 0,
    repeated: 0,
    graduated: 0,
    skipped: 0,
    details: [],
  };

  for (const enrollment of currentEnrollments) {
    const studentId = String(enrollment.studentId?._id || enrollment.studentId);
    const currentSession = enrollment.classSessionId;
    const currentSessionData = serializeClassRecord(currentSession);
    const currentOrder = Number(currentSessionData?.classId?.order);
    const decision = decisionMap.get(studentId) || {};
    const explicitAction = normalizePromotionAction(decision.action);
    const shouldRepeat = failedStudentIdSet.has(studentId) || explicitAction === "repeat";
    const detail = {
      studentId,
      studentName: `${enrollment.studentId?.firstName || ""} ${enrollment.studentId?.lastName || ""}`.trim(),
      currentClass: currentSessionData?.displayName || currentSessionData?.name || "",
      action: "",
      note: decision.note || "",
    };

    if (!currentSessionData?.classId?._id) {
      detail.action = "skipped";
      detail.reason = "Current enrollment is missing a class session";
      summary.skipped += 1;
      summary.details.push(detail);
      await PromotionLog.create({
        studentId,
        fromEnrollmentId: enrollment._id,
        fromClassSessionId: currentSession?._id,
        currentYear: normalizedCurrentYear,
        nextYear: normalizedNextYear,
        action: "skipped",
        note: detail.reason,
      });
      continue;
    }

    if (!shouldRepeat && !Number.isFinite(currentOrder)) {
      detail.action = "skipped";
      detail.reason = "Current class order is missing";
      summary.skipped += 1;
      summary.details.push(detail);
      await PromotionLog.create({
        studentId,
        fromEnrollmentId: enrollment._id,
        fromClassSessionId: currentSession?._id,
        currentYear: normalizedCurrentYear,
        nextYear: normalizedNextYear,
        action: "skipped",
        note: detail.reason,
      });
      continue;
    }

    let targetSession = null;
    let action = shouldRepeat ? "repeated" : "promoted";

    if (!shouldRepeat) {
      const nextMasterClass = nextClassByOrder.get(currentOrder + 1);
      if (!nextMasterClass) {
        action = "graduated";
      } else if (decision.targetClassSessionId) {
        targetSession = nextYearLookup.byId.get(String(decision.targetClassSessionId)) || null;
      } else {
        const exactSectionMatch =
          nextYearLookup.byClassSection.get(
            `${String(nextMasterClass._id)}::${currentSessionData.section || ""}`
          ) || null;
        targetSession =
          exactSectionMatch ||
          nextYearLookup.byClass.get(String(nextMasterClass._id))?.[0] ||
          null;
      }
    } else if (decision.targetClassSessionId) {
      targetSession = nextYearLookup.byId.get(String(decision.targetClassSessionId)) || null;
    } else {
      const currentClassId = String(currentSessionData.classId._id);
      targetSession =
        nextYearLookup.byClassSection.get(`${currentClassId}::${currentSessionData.section || ""}`) ||
        nextYearLookup.byClass.get(currentClassId)?.[0] ||
        null;
    }

    if (action !== "graduated" && !targetSession) {
      detail.action = "skipped";
      detail.reason = shouldRepeat
        ? "No matching next-year class session found for repeat promotion"
        : "No matching next-year class session found for promotion";
      summary.skipped += 1;
      summary.details.push(detail);
      await PromotionLog.create({
        studentId,
        fromEnrollmentId: enrollment._id,
        fromClassSessionId: currentSession?._id,
        currentYear: normalizedCurrentYear,
        nextYear: normalizedNextYear,
        action: "skipped",
        note: detail.reason,
      });
      continue;
    }

    if (action === "graduated") {
      enrollment.status = "graduated";
      enrollment.isCurrent = false;
      await enrollment.save();

      await Student.findByIdAndUpdate(studentId, { status: "graduated" });

      detail.action = "graduated";
      detail.targetClass = null;
      summary.graduated += 1;
      summary.details.push(detail);

      await PromotionLog.create({
        studentId,
        fromEnrollmentId: enrollment._id,
        fromClassSessionId: currentSession?._id,
        currentYear: normalizedCurrentYear,
        nextYear: normalizedNextYear,
        action: "graduated",
        note: decision.note || "Student reached the final class",
      });
      continue;
    }

    const targetSessionData = serializeClassRecord(targetSession);
    const nextEnrollment = await upsertCurrentEnrollment({
      studentId,
      classSessionId: targetSessionData._id,
      academicYear: normalizedNextYear,
      status: "active",
    });

    enrollment.status = action === "repeated" ? "repeated" : "promoted";
    enrollment.isCurrent = false;
    await enrollment.save();

    await syncStudentOperationalRecords(studentId, targetSession, { studentStatus: "active" });

    detail.action = action;
    detail.targetClass = targetSessionData.displayName;
    summary[action] += 1;
    summary.details.push(detail);

    await PromotionLog.create({
      studentId,
      fromEnrollmentId: enrollment._id,
      toEnrollmentId: nextEnrollment._id,
      fromClassSessionId: currentSession?._id,
      toClassSessionId: targetSessionData._id,
      currentYear: normalizedCurrentYear,
      nextYear: normalizedNextYear,
      action,
      note:
        decision.note ||
        (action === "repeated"
          ? `Student repeated class after ${getPreviousAcademicYear(normalizedNextYear)}`
          : "Student promoted successfully"),
    });
  }

  return summary;
};

const ACTIVE_PROMOTION_STUDENT_STATUSES = new Set(["active"]);
const PROMOTION_DECISIONS = new Set(["promote", "repeat", "graduate", "transfer", "drop", "skip"]);

const toId = (value) => String(value?._id || value || "");

const buildBatchNo = ({ currentYear, nextYear }) => {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const randomPart = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `PROM-${currentYear}-${nextYear}-${timestamp}-${randomPart}`;
};

const normalizePromotionDecision = (value) => {
  const normalizedValue = trimString(value).toLowerCase();
  if (normalizedValue === "retain" || normalizedValue === "detain" || normalizedValue === "detained") {
    return "repeat";
  }
  if (normalizedValue === "promoted") return "promote";
  if (normalizedValue === "repeated") return "repeat";
  if (normalizedValue === "graduated") return "graduate";
  if (normalizedValue === "transferred") return "transfer";
  if (normalizedValue === "dropped") return "drop";
  return PROMOTION_DECISIONS.has(normalizedValue) ? normalizedValue : "";
};

const getDecisionFromResult = (resultStatus) => {
  switch (trimString(resultStatus).toLowerCase()) {
    case "pass":
      return "promote";
    case "fail":
    case "detained":
      return "repeat";
    case "absent":
    case "withheld":
    case "pending":
    default:
      return "skip";
  }
};

const shouldRepeatFromResult = (resultStatus) =>
  ["fail", "detained"].includes(trimString(resultStatus).toLowerCase());

const getEnrollmentQueryForPreview = ({ currentYear, classSessionId }) => {
  const query = {
    academicYear: currentYear,
    isCurrent: true,
  };

  if (classSessionId && isValidObjectId(classSessionId)) {
    query.classSessionId = classSessionId;
  }

  return query;
};

const serializePreviewStudent = (student = {}) => ({
  _id: student?._id || student,
  name:
    student?.name ||
    `${student?.firstName || ""} ${student?.lastName || ""}`.trim() ||
    "Student",
  firstName: student?.firstName || "",
  lastName: student?.lastName || "",
  studentId: student?.studentId || "",
  admissionNo: student?.admissionNo || student?.studentId || "",
  status: student?.status || "",
});

const resolveTargetSessionForDecision = ({
  decision,
  manualTargetClassSessionId,
  currentSessionData,
  nextYearLookup,
  classByOrder,
}) => {
  const errors = [];
  const warnings = [];
  let targetSession = null;
  let finalDecision = decision;
  const currentOrder = Number(currentSessionData?.classId?.order);
  const currentClassId = toId(currentSessionData?.classId?._id);
  const currentSection = currentSessionData?.section || "";

  if (["transfer", "drop", "skip"].includes(finalDecision)) {
    return { decision: finalDecision, targetSession, errors, warnings };
  }

  if (finalDecision === "promote") {
    if (!Number.isFinite(currentOrder)) {
      errors.push("Current class order is missing");
      return { decision: finalDecision, targetSession, errors, warnings };
    }

    const nextMasterClass = classByOrder.get(currentOrder + 1);
    if (!nextMasterClass) {
      return { decision: "graduate", targetSession, errors, warnings };
    }

    if (manualTargetClassSessionId) {
      targetSession = nextYearLookup.byId.get(String(manualTargetClassSessionId)) || null;
      if (!targetSession) {
        errors.push("Selected target class session was not found in the target year");
      }
      return { decision: finalDecision, targetSession, errors, warnings };
    }

    targetSession =
      nextYearLookup.byClassSection.get(`${toId(nextMasterClass._id)}::${currentSection}`) ||
      nextYearLookup.byClass.get(toId(nextMasterClass._id))?.[0] ||
      null;
  }

  if (finalDecision === "repeat") {
    if (manualTargetClassSessionId) {
      targetSession = nextYearLookup.byId.get(String(manualTargetClassSessionId)) || null;
      if (!targetSession) {
        errors.push("Selected repeat class session was not found in the target year");
      }
      return { decision: finalDecision, targetSession, errors, warnings };
    }

    targetSession =
      nextYearLookup.byClassSection.get(`${currentClassId}::${currentSection}`) ||
      nextYearLookup.byClass.get(currentClassId)?.[0] ||
      null;
  }

  if (!targetSession && !["graduate", "transfer", "drop", "skip"].includes(finalDecision)) {
    errors.push(
      finalDecision === "repeat"
        ? "No matching target session found for repeat"
        : "No matching target session found for promotion"
    );
  }

  return { decision: finalDecision, targetSession, errors, warnings };
};

const buildPromotionSummary = (items = []) =>
  items.reduce(
    (summary, item) => {
      summary.total += 1;
      if (item.status === "ready") summary.ready += 1;
      if (item.errors.length > 0) summary.errors += item.errors.length;
      if (item.warnings.length > 0) summary.warnings += item.warnings.length;

      if (item.decision === "promote") summary.promoted += 1;
      if (item.decision === "repeat") summary.repeated += 1;
      if (item.decision === "graduate") summary.graduated += 1;
      if (item.decision === "transfer") summary.transferred += 1;
      if (item.decision === "drop") summary.dropped += 1;
      if (item.decision === "skip") summary.skipped += 1;

      return summary;
    },
    {
      total: 0,
      ready: 0,
      promoted: 0,
      repeated: 0,
      graduated: 0,
      transferred: 0,
      dropped: 0,
      skipped: 0,
      errors: 0,
      warnings: 0,
    }
  );

export const buildPromotionPreview = async ({
  currentYear,
  nextYear,
  scope = { type: "year" },
  classSessionId = "",
  studentDecisions = [],
} = {}) => {
  const normalizedCurrentYear = normalizeAcademicYear(currentYear);
  const normalizedNextYear = normalizeAcademicYear(nextYear);

  if (!normalizedCurrentYear || !normalizedNextYear) {
    return {
      error: { statusCode: 400, message: "Valid current and next academic years are required" },
    };
  }

  if (getNextAcademicYear(normalizedCurrentYear) !== normalizedNextYear) {
    return {
      error: {
        statusCode: 400,
        message: `Next year must be the academic year after ${normalizedCurrentYear}`,
      },
    };
  }

  const scopedClassSessionId = classSessionId || scope?.classSessionId || "";
  const enrollmentQuery = getEnrollmentQueryForPreview({
    currentYear: normalizedCurrentYear,
    classSessionId: scopedClassSessionId,
  });
  const [currentEnrollments, nextYearSessions, masterClasses, nextYearEnrollments] = await Promise.all([
    StudentEnrollment.find(enrollmentQuery).populate([
      { path: "studentId", select: "name firstName lastName studentId admissionNo status feeSettings" },
      {
        path: "classSessionId",
        populate: [
          { path: "classId", select: "name order" },
          { path: "classTeacher", select: "name email phone" },
        ],
      },
    ]),
    ClassSession.find({ academicYear: normalizedNextYear, status: "ACTIVE" }).populate([
      { path: "classId", select: "name order" },
      { path: "classTeacher", select: "name email phone" },
    ]),
    Class.find().sort({ order: 1 }),
    StudentEnrollment.find({
      academicYear: normalizedNextYear,
      isCurrent: true,
    }).lean(),
  ]);

  const studentIds = currentEnrollments.map((enrollment) => toId(enrollment.studentId?._id || enrollment.studentId));
  const results = await StudentResult.find({
    academicYear: normalizedCurrentYear,
    studentId: { $in: studentIds },
  }).lean();
  const resultByStudentId = new Map(results.map((result) => [toId(result.studentId), result]));
  const decisionByStudentId = new Map(
    studentDecisions
      .filter((decision) => decision?.studentId)
      .map((decision) => [String(decision.studentId), decision])
  );
  const existingNextEnrollmentByStudentId = new Map(
    nextYearEnrollments.map((enrollment) => [toId(enrollment.studentId), enrollment])
  );
  const nextYearLookup = buildSessionLookup(nextYearSessions);
  const classByOrder = new Map(masterClasses.map((classRecord) => [Number(classRecord.order), classRecord]));
  const targetCounts = nextYearEnrollments.reduce((counts, enrollment) => {
    const targetId = toId(enrollment.classSessionId);
    counts.set(targetId, (counts.get(targetId) || 0) + 1);
    return counts;
  }, new Map());

  const items = currentEnrollments.map((enrollment) => {
    const student = serializePreviewStudent(enrollment.studentId);
    const studentId = toId(student._id);
    const result = resultByStudentId.get(studentId);
    const manualDecision = decisionByStudentId.get(studentId) || {};
    const requestedDecision = normalizePromotionDecision(manualDecision.decision || manualDecision.action);
    const currentSessionData = serializeClassRecord(enrollment.classSessionId);
    const warnings = [];
    const errors = [];
    const resultStatus = result?.resultStatus || "pending";
    const defaultDecision = getDecisionFromResult(resultStatus);
    let decision = requestedDecision || defaultDecision;
    const decisionSource = requestedDecision ? "manual" : result ? "result" : "system";

    if (requestedDecision && !trimString(manualDecision.note)) {
      warnings.push("Manual decision has no note");
    }

    if (!ACTIVE_PROMOTION_STUDENT_STATUSES.has(student.status)) {
      decision = "skip";
      warnings.push(`Student status is ${student.status || "unknown"}`);
    }

    if (!result && !requestedDecision) {
      errors.push("No saved result or manual decision found");
    }

    const targetResolution = resolveTargetSessionForDecision({
      decision,
      manualTargetClassSessionId: manualDecision.targetClassSessionId,
      currentSessionData,
      nextYearLookup,
      classByOrder,
    });
    decision = targetResolution.decision;
    errors.push(...targetResolution.errors);
    warnings.push(...targetResolution.warnings);

    const targetSessionData = serializeClassRecord(targetResolution.targetSession);
    const existingNextEnrollment = existingNextEnrollmentByStudentId.get(studentId);
    if (existingNextEnrollment) {
      const existingTargetId = toId(existingNextEnrollment.classSessionId);
      const intendedTargetId = toId(targetSessionData?._id);
      if (["promote", "repeat"].includes(decision) && existingTargetId !== intendedTargetId) {
        errors.push("Student already has a different current enrollment in the target year");
      } else {
        warnings.push("Student already has a current enrollment in the target year");
      }
    }

    if (targetSessionData?._id && ["promote", "repeat"].includes(decision)) {
      const targetId = toId(targetSessionData._id);
      const nextCount = (targetCounts.get(targetId) || 0) + 1;
      targetCounts.set(targetId, nextCount);
      if (targetSessionData.capacity && nextCount > targetSessionData.capacity) {
        errors.push("Target class session capacity would be exceeded");
      }
    }

    const status = errors.length > 0 ? "pending" : decision === "skip" ? "skipped" : "ready";

    return {
      studentId,
      student,
      fromEnrollmentId: toId(enrollment._id),
      fromClassSessionId: toId(currentSessionData?._id),
      fromClass: currentSessionData?.displayName || "",
      resultId: result?._id || null,
      resultStatus,
      decision,
      targetClassSessionId: targetSessionData?._id || null,
      targetClass: targetSessionData?.displayName || null,
      decisionSource,
      manualOverride: Boolean(requestedDecision),
      status,
      note: manualDecision.note || "",
      warnings,
      errors,
    };
  });

  return {
    currentYear: normalizedCurrentYear,
    nextYear: normalizedNextYear,
    scope: scopedClassSessionId
      ? { type: "classSession", classSessionId: scopedClassSessionId }
      : { type: "year", classSessionId: null },
    summary: buildPromotionSummary(items),
    items,
  };
};

export const createPromotionBatch = async ({
  currentYear,
  nextYear,
  scope = { type: "year" },
  studentDecisions = [],
  requestedBy = null,
} = {}) => {
  const preview = await buildPromotionPreview({
    currentYear,
    nextYear,
    scope,
    studentDecisions,
  });

  if (preview.error) {
    return preview;
  }

  if (preview.summary.errors > 0) {
    return {
      error: {
        statusCode: 400,
        message: "Promotion batch cannot be created until preview errors are fixed",
      },
      preview,
    };
  }

  const batch = await PromotionBatch.create({
    batchNo: buildBatchNo(preview),
    currentYear: preview.currentYear,
    nextYear: preview.nextYear,
    scope: preview.scope,
    status: "validated",
    requestedBy,
    counts: preview.summary,
    summary: {
      createdFromPreviewAt: new Date(),
    },
  });

  const itemDocs = preview.items.map((item) => ({
    batchId: batch._id,
    studentId: item.studentId,
    fromEnrollmentId: item.fromEnrollmentId,
    fromClassSessionId: item.fromClassSessionId,
    recommendedToClassSessionId: item.targetClassSessionId,
    finalToClassSessionId: item.targetClassSessionId,
    resultId: item.resultId,
    resultStatus: item.resultStatus,
    sourceResultStatus: item.resultStatus,
    decision: item.decision,
    decisionSource: item.decisionSource,
    manualOverride: item.manualOverride,
    status: item.status === "skipped" ? "skipped" : "ready",
    validationMessages: [],
    warningMessages: item.warnings,
    errorMessages: item.errors,
    note: item.note,
  }));

  if (itemDocs.length > 0) {
    await PromotionBatchItem.insertMany(itemDocs, { ordered: true });
  }

  return {
    batch,
    preview,
  };
};

const mapDecisionToEnrollmentStatus = (decision) => {
  if (decision === "promote") return "promoted";
  if (decision === "repeat") return "repeated";
  if (decision === "graduate") return "graduated";
  if (decision === "transfer") return "transferred";
  if (decision === "drop") return "dropped";
  return "active";
};

const mapDecisionToStudentStatus = (decision) => {
  if (decision === "graduate") return "graduated";
  if (decision === "transfer") return "transferred";
  if (decision === "drop") return "dropped";
  return "active";
};

const getLatestResultForPromotionItem = async ({ item, batch, session }) =>
  StudentResult.findOne({
    studentId: item.studentId,
    academicYear: batch.currentYear,
  }).session(session);

const getSameClassTargetSessionForRepeat = async ({ enrollment, batch, session }) => {
  const sourceSession = await ClassSession.findById(enrollment.classSessionId)
    .populate([
      { path: "classId", select: "name order" },
      { path: "classTeacher", select: "name email phone" },
    ])
    .session(session);
  const sourceSessionData = serializeClassRecord(sourceSession);
  const sourceClassId = toId(sourceSessionData?.classId?._id);

  if (!sourceClassId) {
    return null;
  }

  const exactSectionTarget = await ClassSession.findOne({
    academicYear: batch.nextYear,
    classId: sourceClassId,
    section: sourceSessionData.section || null,
    status: "ACTIVE",
  })
    .populate([
      { path: "classId", select: "name order" },
      { path: "classTeacher", select: "name email phone" },
    ])
    .session(session);

  if (exactSectionTarget) {
    return exactSectionTarget;
  }

  return ClassSession.findOne({
    academicYear: batch.nextYear,
    classId: sourceClassId,
    status: "ACTIVE",
  })
    .populate([
      { path: "classId", select: "name order" },
      { path: "classTeacher", select: "name email phone" },
    ])
    .session(session);
};

const getPromotionTargetSessionForExecution = async ({ item, batch, enrollment, decision, session }) => {
  if (decision === "repeat") {
    return getSameClassTargetSessionForRepeat({ enrollment, batch, session });
  }

  const targetClassSessionId = item.finalToClassSessionId || item.recommendedToClassSessionId;
  if (!targetClassSessionId) {
    return null;
  }

  return ClassSession.findById(targetClassSessionId)
    .populate([
      { path: "classId", select: "name order" },
      { path: "classTeacher", select: "name email phone" },
    ])
    .session(session);
};

const executePromotionItem = async ({ item, batch, performedBy, idempotencyKey, session }) => {
  const studentId = item.studentId;
  let decision = item.decision;
  const enrollment = await StudentEnrollment.findById(item.fromEnrollmentId).session(session);

  if (!enrollment) {
    item.status = "failed";
    item.errorMessages = ["Source enrollment not found"];
    await item.save({ session });
    return { action: "failed" };
  }

  const latestResult = await getLatestResultForPromotionItem({ item, batch, session });
  if (latestResult) {
    item.resultId = latestResult._id;
    item.resultStatus = latestResult.resultStatus;

    if (!item.manualOverride && shouldRepeatFromResult(latestResult.resultStatus)) {
      decision = "repeat";
      item.decision = "repeat";
      item.decisionSource = "execution";
      item.sourceResultStatus = latestResult.resultStatus;
      item.warningMessages = [
        ...new Set([
          ...(item.warningMessages || []),
          "Execution changed decision to repeat because the latest saved result is fail/detained",
        ]),
      ];
    }
  }

  if (decision === "skip" || item.status === "skipped") {
    await PromotionLog.create(
      [
        {
          batchId: batch._id,
          resultId: item.resultId,
          studentId,
          fromEnrollmentId: enrollment._id,
          fromClassSessionId: enrollment.classSessionId,
          currentYear: batch.currentYear,
          nextYear: batch.nextYear,
          action: "skipped",
          performedBy,
          idempotencyKey,
          note: item.note || "Student skipped during promotion",
        },
      ],
      { session }
    );
    item.status = "skipped";
    await item.save({ session });
    return { action: "skipped" };
  }

  if (["graduate", "transfer", "drop"].includes(decision)) {
    enrollment.status = mapDecisionToEnrollmentStatus(decision);
    enrollment.isCurrent = false;
    await enrollment.save({ session });

    await Student.findByIdAndUpdate(
      studentId,
      { status: mapDecisionToStudentStatus(decision) },
      { session }
    );

    await PromotionLog.create(
      [
        {
          batchId: batch._id,
          resultId: item.resultId,
          studentId,
          fromEnrollmentId: enrollment._id,
          fromClassSessionId: enrollment.classSessionId,
          currentYear: batch.currentYear,
          nextYear: batch.nextYear,
          action: mapDecisionToEnrollmentStatus(decision),
          performedBy,
          idempotencyKey,
          note: item.note || `Student marked ${decision}`,
        },
      ],
      { session }
    );

    item.status = "processed";
    await item.save({ session });
    return { action: mapDecisionToEnrollmentStatus(decision) };
  }

  const targetSession = await getPromotionTargetSessionForExecution({
    item,
    batch,
    enrollment,
    decision,
    session,
  });

  if (!targetSession) {
    item.status = "failed";
    item.errorMessages = [
      decision === "repeat"
        ? "Target same-class session was not found for repeat"
        : "Target class session not found",
    ];
    await item.save({ session });
    return { action: "failed" };
  }

  const existingTargetEnrollment = await StudentEnrollment.findOne({
    studentId,
    academicYear: batch.nextYear,
  }).session(session);

  if (
    existingTargetEnrollment &&
    toId(existingTargetEnrollment.classSessionId) !== toId(targetSession._id)
  ) {
    item.status = "failed";
    item.errorMessages = [
      decision === "repeat"
        ? "Student already has a different target-year enrollment; repair is required before repeating"
        : "Student already has a different target-year enrollment",
    ];
    await item.save({ session });
    return { action: "failed" };
  }

  let targetEnrollment = existingTargetEnrollment;
  if (targetEnrollment) {
    targetEnrollment.classSessionId = targetSession._id;
    targetEnrollment.status = "active";
    targetEnrollment.isCurrent = true;
    await targetEnrollment.save({ session });
  } else {
    targetEnrollment = await upsertCurrentEnrollment(
      {
        studentId,
        classSessionId: targetSession._id,
        academicYear: batch.nextYear,
        status: "active",
        isCurrent: true,
      },
      { session }
    );
  }

  enrollment.status = mapDecisionToEnrollmentStatus(decision);
  enrollment.isCurrent = false;
  await enrollment.save({ session });

  await createFeesRecordForEnrollment(
    {
      student: studentId,
      enrollment: targetEnrollment,
      classSession: targetSession,
    },
    { session }
  );
  await syncStudentOperationalRecords(
    studentId,
    targetSession,
    { studentStatus: "active", createFeesIfMissing: true },
    { session }
  );

  await PromotionLog.create(
    [
      {
        batchId: batch._id,
        resultId: item.resultId,
        studentId,
        fromEnrollmentId: enrollment._id,
        toEnrollmentId: targetEnrollment._id,
        fromClassSessionId: enrollment.classSessionId,
        toClassSessionId: targetSession._id,
        currentYear: batch.currentYear,
        nextYear: batch.nextYear,
        action: mapDecisionToEnrollmentStatus(decision),
        performedBy,
        idempotencyKey,
        note: item.note || (decision === "repeat" ? "Student repeated class" : "Student promoted"),
      },
    ],
    { session }
  );

  item.toEnrollmentId = targetEnrollment._id;
  item.finalToClassSessionId = targetSession._id;
  item.status = "processed";
  await item.save({ session });

  return { action: mapDecisionToEnrollmentStatus(decision) };
};

export const executePromotionBatch = async ({ batchId, idempotencyKey, performedBy = null } = {}) => {
  if (!isValidObjectId(batchId)) {
    return { error: { statusCode: 400, message: "Valid promotion batch ID is required" } };
  }

  const normalizedIdempotencyKey = trimString(idempotencyKey);
  if (!normalizedIdempotencyKey) {
    return { error: { statusCode: 400, message: "Idempotency-Key header is required" } };
  }

  const existingBatchForKey = await PromotionBatch.findOne({ idempotencyKey: normalizedIdempotencyKey });
  if (existingBatchForKey && toId(existingBatchForKey._id) !== String(batchId)) {
    if (existingBatchForKey.status === "completed") {
      return {
        batch: existingBatchForKey,
        alreadyProcessed: true,
      };
    }

    return {
      error: {
        statusCode: 409,
        message: "This idempotency key has already been used",
      },
      batch: existingBatchForKey,
    };
  }

  const session = await mongoose.startSession();
  try {
    let finalBatch = null;
    await session.withTransaction(async () => {
      const batch = await PromotionBatch.findById(batchId).session(session);
      if (!batch) {
        throw Object.assign(new Error("Promotion batch not found"), { statusCode: 404 });
      }

      if (batch.status === "completed" && batch.idempotencyKey === normalizedIdempotencyKey) {
        finalBatch = batch;
        return;
      }

      if (batch.status !== "validated") {
        throw Object.assign(new Error("Promotion batch is not ready for execution"), { statusCode: 409 });
      }

      batch.status = "processing";
      batch.startedAt = new Date();
      batch.idempotencyKey = normalizedIdempotencyKey;
      await batch.save({ session });

      const items = await PromotionBatchItem.find({ batchId: batch._id }).session(session);
      const executionCounts = {
        total: items.length,
        ready: 0,
        promoted: 0,
        repeated: 0,
        graduated: 0,
        transferred: 0,
        dropped: 0,
        skipped: 0,
        errors: 0,
        warnings: items.reduce((count, item) => count + (item.warningMessages?.length || 0), 0),
      };

      for (const item of items) {
        const result = await executePromotionItem({
          item,
          batch,
          performedBy,
          idempotencyKey: normalizedIdempotencyKey,
          session,
        });

        if (result.action === "promoted") executionCounts.promoted += 1;
        else if (result.action === "repeated") executionCounts.repeated += 1;
        else if (result.action === "graduated") executionCounts.graduated += 1;
        else if (result.action === "transferred") executionCounts.transferred += 1;
        else if (result.action === "dropped") executionCounts.dropped += 1;
        else if (result.action === "skipped") executionCounts.skipped += 1;
        else if (result.action === "failed") executionCounts.errors += 1;
      }

      batch.status = executionCounts.errors > 0 ? "failed" : "completed";
      batch.completedAt = new Date();
      batch.counts = executionCounts;
      if (executionCounts.errors > 0) {
        batch.failureReason = "One or more students failed during promotion execution";
      }
      await batch.save({ session });
      finalBatch = batch;

      if (executionCounts.errors > 0) {
        throw Object.assign(new Error(batch.failureReason), { statusCode: 500 });
      }
    });

    return {
      batch: finalBatch,
    };
  } catch (error) {
    return {
      error: {
        statusCode: error.statusCode || 500,
        message: error.message || "Failed to execute promotion batch",
      },
    };
  } finally {
    await session.endSession();
  }
};
