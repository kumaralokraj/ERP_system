import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../configs/mongodb.js";
import Fees from "../models/Fees.js";
import Student from "../models/Student.js";
import "../models/Teacher.js";
import {
  attachAcademicContextToFeesRecords,
  buildFeesRecordPayloadForStudent,
  resolveFeesStatus,
} from "../services/academicStructureService.js";
import { isValidObjectId, normalizeAcademicYear, trimString } from "../utils/requestValidation.js";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run") || !args.has("--commit");

const getArgValue = (name, fallback = "") => {
  const prefix = `--${name}=`;
  const match = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
};

const toId = (value) => String(value?._id || value || "");
const hasJsonChanged = (left, right) => JSON.stringify(left || null) !== JSON.stringify(right || null);

const resolveStudent = async (selector) => {
  const normalizedSelector = trimString(selector);
  if (!normalizedSelector) {
    return null;
  }

  return Student.findOne({
    $or: [
      ...(isValidObjectId(normalizedSelector) ? [{ _id: normalizedSelector }] : []),
      { studentId: normalizedSelector },
      { admissionNo: normalizedSelector },
    ],
  }).select("_id studentId admissionNo name firstName lastName feeSettings").lean();
};

const countBadZeroDueInstallments = (installments = []) =>
  installments.filter((installment) => {
    const amount = Number(installment.amount || 0);
    const paidAmount = Number(installment.paidAmount || 0);
    const dueAmount = Math.max(amount - paidAmount, 0);
    return dueAmount <= 0 && String(installment.status || "").toUpperCase() !== "PAID";
  }).length;

const buildQuery = async () => {
  const academicYear = normalizeAcademicYear(getArgValue("year"));
  const studentSelector = getArgValue("student") || getArgValue("student-id") || getArgValue("admission-no");
  const query = {};

  if (academicYear) {
    query.academicYear = academicYear;
  }

  if (args.has("--current-only")) {
    query.isCurrent = true;
  }

  const selectedStudent = await resolveStudent(studentSelector);
  if (studentSelector && !selectedStudent) {
    throw new Error(`Student not found for selector ${studentSelector}`);
  }

  if (selectedStudent) {
    query.student = selectedStudent._id;
  }

  return { query, selectedStudent, academicYear };
};

const run = async () => {
  await connectDB();

  const { query, selectedStudent, academicYear } = await buildQuery();
  const feeRecords = await Fees.find(query).populate(
    "student",
    "name firstName lastName studentId admissionNo feeSettings"
  );
  const feeRecordsWithClass = await attachAcademicContextToFeesRecords(feeRecords);

  const stats = {
    dryRun,
    academicYear: academicYear || "all",
    checked: feeRecordsWithClass.length,
    zeroDueStatusIssues: 0,
    readyToUpdate: 0,
    updated: 0,
    skippedNoClass: 0,
    skippedNoPayload: 0,
  };
  const issues = [];

  for (const feeRecord of feeRecordsWithClass) {
    if (!feeRecord?.class?._id) {
      stats.skippedNoClass += 1;
      issues.push({
        feeId: toId(feeRecord._id),
        studentId: toId(feeRecord.student?._id || feeRecord.student),
        reason: "Unable to resolve fee class session",
      });
      continue;
    }

    const originalZeroDueIssues = countBadZeroDueInstallments(feeRecord.feeInstallments || []);
    stats.zeroDueStatusIssues += originalZeroDueIssues;

    const payload = buildFeesRecordPayloadForStudent({
      student: feeRecord.student,
      classRecord: feeRecord.class,
      existingFeesRecord: feeRecord,
      enrollmentRecord: feeRecord.enrollmentId ? { _id: feeRecord.enrollmentId, isCurrent: feeRecord.isCurrent } : null,
      isCurrent: feeRecord.isCurrent,
    });

    if (!payload) {
      stats.skippedNoPayload += 1;
      issues.push({
        feeId: toId(feeRecord._id),
        studentId: toId(feeRecord.student?._id || feeRecord.student),
        reason: "Unable to rebuild fee payload",
      });
      continue;
    }

    const nextStatus = resolveFeesStatus({
      paidAmount: payload.paidAmount,
      totalFees: payload.totalFees,
      dueDate: payload.dueDate,
    });
    const changed =
      originalZeroDueIssues > 0 ||
      Number(feeRecord.totalFees || 0) !== Number(payload.totalFees || 0) ||
      Number(feeRecord.paidAmount || 0) !== Number(payload.paidAmount || 0) ||
      feeRecord.status !== nextStatus ||
      hasJsonChanged(feeRecord.feeBreakdown, payload.feeBreakdown) ||
      hasJsonChanged(feeRecord.feeInstallments, payload.feeInstallments);

    if (!changed) {
      continue;
    }

    stats.readyToUpdate += 1;
    issues.push({
      feeId: toId(feeRecord._id),
      studentId: toId(feeRecord.student?._id || feeRecord.student),
      admissionNo: feeRecord.student?.admissionNo || feeRecord.student?.studentId || "",
      academicYear: payload.academicYear,
      classSessionId: toId(payload.classSessionId),
      zeroDueStatusIssues: originalZeroDueIssues,
      previousStatus: feeRecord.status,
      nextStatus,
      previousTotalFees: Number(feeRecord.totalFees || 0),
      nextTotalFees: Number(payload.totalFees || 0),
      previousPaidAmount: Number(feeRecord.paidAmount || 0),
      nextPaidAmount: Number(payload.paidAmount || 0),
    });

    if (!dryRun) {
      await Fees.updateOne(
        { _id: feeRecord._id },
        {
          $set: {
            class: payload.class,
            classSessionId: payload.classSessionId,
            enrollmentId: payload.enrollmentId,
            academicYear: payload.academicYear,
            isCurrent: payload.isCurrent,
            totalFees: payload.totalFees,
            paidAmount: payload.paidAmount,
            dueDate: payload.dueDate,
            status: nextStatus,
            feeSettings: payload.feeSettings,
            feeBreakdown: payload.feeBreakdown,
            feeInstallments: payload.feeInstallments,
          },
        }
      );
      stats.updated += 1;
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
    issues,
  }, null, 2));

  if (dryRun) {
    console.log("Dry run only. Re-run with --commit after reviewing the fee installment repair report.");
  }
};

run()
  .catch((error) => {
    console.error("Fee installment repair failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
