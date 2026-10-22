import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../configs/mongodb.js";
import ClassSession from "../models/ClassSession.js";
import Fees from "../models/Fees.js";
import PromotionBatch from "../models/PromotionBatch.js";
import PromotionBatchItem from "../models/PromotionBatchItem.js";
import PromotionLog from "../models/PromotionLog.js";
import Student from "../models/Student.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import StudentResult from "../models/StudentResult.js";
import "../models/Teacher.js";
import {
  createFeesRecordForEnrollment,
  getNextAcademicYear,
  normalizeFeesPayload,
  serializeClassRecord,
  syncStudentOperationalRecords,
  upsertCurrentEnrollment,
} from "../services/academicStructureService.js";
import { isValidObjectId, normalizeAcademicYear, parseAcademicYear, trimString } from "../utils/requestValidation.js";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run") || !args.has("--commit");
const createMissingRepeatSessions = args.has("--create-missing-repeat-sessions");
const reportAllItems = args.has("--report-all");
const forceRepeat = args.has("--force-repeat");

const getArgValue = (name, fallback = "") => {
  const prefix = `--${name}=`;
  const match = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
};

const getDefaultAcademicYear = () => {
  const today = new Date();
  const startYear = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
  return `${startYear}-${String(startYear + 1).slice(-2)}`;
};

const toId = (value) => String(value?._id || value || "");
const isRepeatResultStatus = (value) => ["fail", "detained"].includes(trimString(value).toLowerCase());
const withSession = (query, session) => (session ? query.session(session) : query);
const normalizeRepairResultStatus = (value) => {
  const normalizedValue = trimString(value).toLowerCase() || "fail";
  return ["fail", "detained"].includes(normalizedValue) ? normalizedValue : "fail";
};

const CLASS_SESSION_POPULATION = [
  { path: "classId", select: "name order" },
  { path: "classTeacher", select: "name email phone" },
];

const findRepeatTargetSession = async ({ sourceSession, nextYear, session }) => {
  const sourceSessionData = serializeClassRecord(sourceSession);
  const sourceClassId = toId(sourceSessionData?.classId?._id);

  if (!sourceClassId) {
    return null;
  }

  const exactTarget = await withSession(
    ClassSession.findOne({
      academicYear: nextYear,
      classId: sourceClassId,
      section: sourceSessionData.section || null,
      status: "ACTIVE",
    }).populate(CLASS_SESSION_POPULATION),
    session
  );

  if (exactTarget) {
    return exactTarget;
  }

  return withSession(
    ClassSession.findOne({
      academicYear: nextYear,
      classId: sourceClassId,
      status: "ACTIVE",
    }).populate(CLASS_SESSION_POPULATION),
    session
  );
};

const createRepeatTargetSession = async ({ sourceSession, nextYear, session }) => {
  const sourceSessionData = serializeClassRecord(sourceSession);
  const sourceClassId = sourceSessionData?.classId?._id || sourceSession.classId;

  if (!sourceClassId) {
    return null;
  }

  const [createdSession] = await ClassSession.create(
    [
      {
        classId: sourceClassId,
        academicYear: nextYear,
        section: sourceSessionData.section || null,
        capacity: sourceSessionData.capacity || 40,
        classTeacher: sourceSession.classTeacher?._id || sourceSession.classTeacher || null,
        fees: normalizeFeesPayload(sourceSessionData.fees),
        status: "ACTIVE",
      },
    ],
    { session }
  );

  return ClassSession.findById(createdSession._id).populate(CLASS_SESSION_POPULATION).session(session);
};

const getTargetSession = async ({ sourceSession, nextYear, session }) => {
  const existingTarget = await findRepeatTargetSession({ sourceSession, nextYear, session });
  if (existingTarget || !createMissingRepeatSessions || dryRun) {
    return existingTarget;
  }

  return createRepeatTargetSession({ sourceSession, nextYear, session });
};

const buildBatchQuery = ({ batchId, currentYear, nextYear }) => {
  if (batchId) {
    if (!isValidObjectId(batchId)) {
      throw new Error("Valid --batch-id value is required");
    }
    return { _id: batchId };
  }

  return {
    currentYear,
    nextYear,
    status: { $in: ["completed", "failed", "validated"] },
  };
};

const resolveStudentSelector = async (selector) => {
  const normalizedSelector = trimString(selector);
  if (!normalizedSelector) {
    return null;
  }

  const query = isValidObjectId(normalizedSelector)
    ? {
        $or: [
          { _id: normalizedSelector },
          { studentId: normalizedSelector },
          { admissionNo: normalizedSelector },
        ],
      }
    : {
        $or: [
          { studentId: normalizedSelector },
          { admissionNo: normalizedSelector },
        ],
      };

  return Student.findOne(query).select("_id studentId admissionNo firstName lastName name").lean();
};

const rebuildBatchCounts = async (batch, { session } = {}) => {
  const items = await withSession(PromotionBatchItem.find({ batchId: batch._id }), session);
  const counts = items.reduce(
    (summary, item) => {
      summary.total += 1;
      if (item.status === "ready") summary.ready += 1;
      if (item.errorMessages?.length > 0 || item.status === "failed") summary.errors += item.errorMessages?.length || 1;
      if (item.warningMessages?.length > 0) summary.warnings += item.warningMessages.length;
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

  batch.counts = counts;
  if (batch.status === "failed" && counts.errors === 0) {
    batch.status = "completed";
    batch.failureReason = "";
  }
  await batch.save(session ? { session } : undefined);
};

const inspectRepeatItem = async ({ batch, item, forceRepeatItem = false, includeReportOnly = false }) => {
  const result = await StudentResult.findOne({
    studentId: item.studentId,
    academicYear: batch.currentYear,
  }).lean();
  const effectiveResultStatus = result?.resultStatus || item.resultStatus || "";

  if (!isRepeatResultStatus(effectiveResultStatus) && !forceRepeatItem && !includeReportOnly) {
    return null;
  }

  const [sourceEnrollment, nextEnrollment, student, nextFeesRecord] = await Promise.all([
    StudentEnrollment.findById(item.fromEnrollmentId).populate({
      path: "classSessionId",
      populate: CLASS_SESSION_POPULATION,
    }),
    StudentEnrollment.findOne({
      studentId: item.studentId,
      academicYear: batch.nextYear,
    }).populate({
      path: "classSessionId",
      populate: CLASS_SESSION_POPULATION,
    }),
    Student.findById(item.studentId).select("name firstName lastName studentId admissionNo class section status").lean(),
    Fees.findOne({ student: item.studentId, academicYear: batch.nextYear }).lean(),
  ]);

  const sourceSession = sourceEnrollment?.classSessionId || null;
  const repeatTargetSession = sourceSession
    ? await findRepeatTargetSession({ sourceSession, nextYear: batch.nextYear })
    : null;
  const repeatTargetSessionData = serializeClassRecord(repeatTargetSession);
  const nextEnrollmentSessionData = serializeClassRecord(nextEnrollment?.classSessionId);
  const sourceSessionData = serializeClassRecord(sourceSession);

  const messages = [];
  const desiredTargetId = toId(repeatTargetSessionData?._id);
  const shouldBeRepeat = isRepeatResultStatus(effectiveResultStatus) || forceRepeatItem;

  if (forceRepeatItem && !isRepeatResultStatus(effectiveResultStatus)) {
    messages.push(`Manual force-repeat requested; saved result is ${effectiveResultStatus || "missing"}`);
  }
  if (!sourceEnrollment && shouldBeRepeat) {
    messages.push("Source enrollment not found");
  }
  if (!sourceSession && shouldBeRepeat) {
    messages.push("Source class session not found");
  }
  if (!repeatTargetSession && shouldBeRepeat) {
    messages.push("Same-class target session for failed student is missing");
  }
  if (shouldBeRepeat && item.decision !== "repeat") {
    messages.push(`Batch item decision is ${item.decision}, expected repeat`);
  }
  if (shouldBeRepeat && desiredTargetId && toId(item.finalToClassSessionId || item.recommendedToClassSessionId) !== desiredTargetId) {
    messages.push("Batch item target is not the same-class repeat target");
  }
  if (shouldBeRepeat && !nextEnrollment) {
    messages.push("Next-year enrollment is missing");
  } else if (shouldBeRepeat && desiredTargetId && toId(nextEnrollment.classSessionId?._id || nextEnrollment.classSessionId) !== desiredTargetId) {
    messages.push("Next-year enrollment points to the wrong class session");
  }
  if (shouldBeRepeat && sourceEnrollment && (sourceEnrollment.status !== "repeated" || sourceEnrollment.isCurrent)) {
    messages.push("Source enrollment is not closed as repeated");
  }
  if (shouldBeRepeat && desiredTargetId && toId(student?.class) !== desiredTargetId) {
    messages.push("Student master current class is wrong");
  }
  if (shouldBeRepeat && desiredTargetId && nextFeesRecord && toId(nextFeesRecord.classSessionId || nextFeesRecord.class) !== desiredTargetId) {
    messages.push("Next-year fee record points to the wrong class session");
  }

  return {
    needsRepair: shouldBeRepeat && messages.length > 0,
    reportOnly: !shouldBeRepeat,
    batchId: toId(batch._id),
    batchNo: batch.batchNo,
    itemId: toId(item._id),
    studentId: toId(item.studentId),
    admissionNo: student?.admissionNo || student?.studentId || "",
    studentName:
      student?.name ||
      `${student?.firstName || ""} ${student?.lastName || ""}`.trim() ||
      "Student",
    resultStatus: effectiveResultStatus,
    savedResultStatus: result?.resultStatus || "",
    batchResultStatus: item.resultStatus || "",
    batchDecision: item.decision,
    batchDecisionSource: item.decisionSource || "",
    batchManualOverride: Boolean(item.manualOverride),
    sourceClass: sourceSessionData?.displayName || "",
    currentTargetClass: nextEnrollmentSessionData?.displayName || "",
    expectedTargetClass: repeatTargetSessionData?.displayName || "",
    expectedTargetClassSessionId: desiredTargetId,
    messages,
  };
};

const repairRepeatItem = async ({ batch, item, resultStatus = "" }) => {
  const session = await mongoose.startSession();
  try {
    let repaired = null;

    await session.withTransaction(async () => {
      const sourceEnrollment = await StudentEnrollment.findById(item.fromEnrollmentId)
        .populate({
          path: "classSessionId",
          populate: CLASS_SESSION_POPULATION,
        })
        .session(session);

      if (!sourceEnrollment?.classSessionId) {
        throw new Error("Source enrollment or source class session not found");
      }

      const repeatTargetSession = await getTargetSession({
        sourceSession: sourceEnrollment.classSessionId,
        nextYear: batch.nextYear,
        session,
      });

      if (!repeatTargetSession) {
        throw new Error("Same-class target session is missing. Re-run with --create-missing-repeat-sessions if it should be cloned.");
      }

      const targetEnrollment = await upsertCurrentEnrollment(
        {
          studentId: item.studentId,
          classSessionId: repeatTargetSession._id,
          academicYear: batch.nextYear,
          status: "active",
          isCurrent: true,
        },
        { session }
      );

      sourceEnrollment.status = "repeated";
      sourceEnrollment.isCurrent = false;
      await sourceEnrollment.save({ session });

      let latestResult = await StudentResult.findOne({
        studentId: item.studentId,
        academicYear: batch.currentYear,
      }).session(session);

      if (resultStatus) {
        latestResult = await StudentResult.findOneAndUpdate(
          {
            studentId: item.studentId,
            academicYear: batch.currentYear,
          },
          {
            $set: {
              studentId: item.studentId,
              enrollmentId: sourceEnrollment._id,
              classSessionId: sourceEnrollment.classSessionId?._id || sourceEnrollment.classSessionId,
              academicYear: batch.currentYear,
              resultStatus,
              declaredAt: new Date(),
            },
          },
          {
            new: true,
            upsert: true,
            runValidators: true,
            setDefaultsOnInsert: true,
            session,
          }
        );
      }

      await createFeesRecordForEnrollment(
        {
          student: item.studentId,
          enrollment: targetEnrollment,
          classSession: repeatTargetSession,
        },
        { session }
      );

      await syncStudentOperationalRecords(
        item.studentId,
        repeatTargetSession,
        { studentStatus: "active", createFeesIfMissing: true },
        { session }
      );

      item.decision = "repeat";
      item.decisionSource = item.manualOverride ? item.decisionSource : "execution";
      item.resultId = latestResult?._id || item.resultId;
      item.resultStatus = latestResult?.resultStatus || resultStatus || item.resultStatus || "fail";
      item.sourceResultStatus = item.resultStatus;
      item.recommendedToClassSessionId = repeatTargetSession._id;
      item.finalToClassSessionId = repeatTargetSession._id;
      item.toEnrollmentId = targetEnrollment._id;
      item.status = "processed";
      item.errorMessages = [];
      item.warningMessages = [
        ...new Set([...(item.warningMessages || []), "Post-promotion repair moved failed student to repeat class"]),
      ];
      await item.save({ session });

      await PromotionLog.create(
        [
          {
            batchId: batch._id,
            resultId: item.resultId,
            studentId: item.studentId,
            fromEnrollmentId: sourceEnrollment._id,
            toEnrollmentId: targetEnrollment._id,
            fromClassSessionId: sourceEnrollment.classSessionId,
            toClassSessionId: repeatTargetSession._id,
            currentYear: batch.currentYear,
            nextYear: batch.nextYear,
            action: "repeated",
            idempotencyKey: `repair-repeat-${batch._id}-${item.studentId}`,
            note: "Post-promotion repair: failed/detained student repeated same class",
          },
        ],
        { session }
      );

      await rebuildBatchCounts(batch, { session });

      repaired = {
        studentId: toId(item.studentId),
        targetEnrollmentId: toId(targetEnrollment._id),
        targetClassSessionId: toId(repeatTargetSession._id),
      };
    });

    return repaired;
  } finally {
    await session.endSession();
  }
};

const run = async () => {
  await connectDB();

  const requestedCurrentYear = normalizeAcademicYear(getArgValue("year", getDefaultAcademicYear()));
  const currentYear = requestedCurrentYear || "";
  const nextYear = normalizeAcademicYear(
    getArgValue("next-year", currentYear ? getNextAcademicYear(currentYear) : "")
  );
  const batchId = trimString(getArgValue("batch-id"));
  const studentSelector =
    getArgValue("student") ||
    getArgValue("admission-no") ||
    getArgValue("student-id") ||
    "";
  const repairResultStatus = normalizeRepairResultStatus(getArgValue("result-status", "fail"));

  if (!batchId && (!parseAcademicYear(currentYear) || !parseAcademicYear(nextYear))) {
    throw new Error("Valid --year and --next-year values are required when --batch-id is not provided");
  }

  if (forceRepeat && !studentSelector) {
    throw new Error("--force-repeat requires --student, --student-id, or --admission-no");
  }

  const selectedStudent = await resolveStudentSelector(studentSelector);
  if (studentSelector && !selectedStudent) {
    throw new Error(`Student not found for selector ${studentSelector}`);
  }

  const batches = await PromotionBatch.find(buildBatchQuery({ batchId, currentYear, nextYear }))
    .sort({ createdAt: -1 })
    .limit(batchId ? 1 : 20);

  const stats = {
    dryRun,
    createMissingRepeatSessions,
    batchesChecked: batches.length,
    itemsChecked: 0,
    failedResultItems: 0,
    cleanRepeatItems: 0,
    needsRepair: 0,
    repaired: 0,
    repairErrors: 0,
  };
  const issues = [];
  const reportedItems = [];
  const repairErrors = [];

  for (const batch of batches) {
    const items = await PromotionBatchItem.find({ batchId: batch._id });
    stats.itemsChecked += items.length;

    for (const item of items) {
      const isSelectedStudent = selectedStudent && toId(item.studentId) === toId(selectedStudent._id);
      if (selectedStudent && !isSelectedStudent) {
        continue;
      }

      const inspection = await inspectRepeatItem({
        batch,
        item,
        forceRepeatItem: forceRepeat && isSelectedStudent,
        includeReportOnly: reportAllItems || Boolean(selectedStudent),
      });
      if (!inspection) {
        continue;
      }

      if (inspection.reportOnly || reportAllItems || selectedStudent) {
        reportedItems.push(inspection);
      }

      if (inspection.reportOnly) {
        continue;
      }

      stats.failedResultItems += 1;

      if (!inspection.needsRepair) {
        stats.cleanRepeatItems += 1;
        continue;
      }

      stats.needsRepair += 1;
      issues.push(inspection);

      if (!dryRun) {
        try {
          await repairRepeatItem({
            batch,
            item,
            resultStatus: forceRepeat && isSelectedStudent ? repairResultStatus : "",
          });
          stats.repaired += 1;
        } catch (error) {
          stats.repairErrors += 1;
          repairErrors.push({
            batchId: inspection.batchId,
            itemId: inspection.itemId,
            studentId: inspection.studentId,
            admissionNo: inspection.admissionNo,
            message: error.message || "Failed to repair repeat promotion",
          });
        }
      }
    }
  }

  console.log(JSON.stringify({
    stats,
    selectedStudent: selectedStudent
      ? {
          _id: toId(selectedStudent._id),
          admissionNo: selectedStudent.admissionNo || selectedStudent.studentId || "",
          studentId: selectedStudent.studentId || "",
          name:
            selectedStudent.name ||
            `${selectedStudent.firstName || ""} ${selectedStudent.lastName || ""}`.trim(),
        }
      : null,
    reportedItems,
    issues,
    repairErrors,
  }, null, 2));

  if (dryRun) {
    console.log("Dry run only. Re-run with --commit after reviewing the promotion execution audit.");
  }

  if (!dryRun && stats.repairErrors > 0) {
    throw new Error("Promotion execution repair completed with errors");
  }
};

run()
  .catch((error) => {
    console.error("Promotion execution audit failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
