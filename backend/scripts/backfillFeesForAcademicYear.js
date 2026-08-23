import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../configs/mongodb.js";
import Fees from "../models/Fees.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import "../models/Teacher.js";
import { createFeesRecordForEnrollment, getNextAcademicYear } from "../services/academicStructureService.js";
import { normalizeAcademicYear, trimString } from "../utils/requestValidation.js";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run") || !args.has("--commit");

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

const run = async () => {
  await connectDB();

  const academicYear = normalizeAcademicYear(getArgValue("year", getDefaultAcademicYear()));
  if (!academicYear) {
    throw new Error("Valid --year value is required");
  }

  const enrollments = await StudentEnrollment.find({
    academicYear,
    isCurrent: true,
  }).populate([
    {
      path: "studentId",
      select: "name firstName lastName studentId admissionNo feeSettings status",
    },
    {
      path: "classSessionId",
      populate: [
        { path: "classId", select: "name order" },
        { path: "classTeacher", select: "name email phone" },
      ],
    },
  ]);

  const stats = {
    dryRun,
    academicYear,
    checkedEnrollments: enrollments.length,
    existingFees: 0,
    readyToCreate: 0,
    created: 0,
    missingStudent: 0,
    missingClassSession: 0,
    errors: 0,
  };
  const candidates = [];
  const errors = [];

  for (const enrollment of enrollments) {
    const student = enrollment.studentId;
    const classSession = enrollment.classSessionId;
    const studentId = toId(student);

    if (!student?._id) {
      stats.missingStudent += 1;
      errors.push({
        enrollmentId: toId(enrollment._id),
        reason: "Enrollment is missing a student",
      });
      continue;
    }

    if (!classSession?._id) {
      stats.missingClassSession += 1;
      errors.push({
        enrollmentId: toId(enrollment._id),
        studentId,
        admissionNo: student.studentId || "",
        reason: "Enrollment is missing a class session",
      });
      continue;
    }

    const existingFeesRecord = await Fees.findOne({
      $or: [
        { student: student._id, academicYear },
        { enrollmentId: enrollment._id },
      ],
    }).lean();

    if (existingFeesRecord) {
      stats.existingFees += 1;
      continue;
    }

    const candidate = {
      enrollmentId: toId(enrollment._id),
      studentId,
      admissionNo: student.studentId || student.admissionNo || "",
      classSessionId: toId(classSession._id),
      academicYear,
    };
    candidates.push(candidate);
    stats.readyToCreate += 1;

    if (!dryRun) {
      try {
        await createFeesRecordForEnrollment({
          student,
          enrollment,
          classSession,
        });
        stats.created += 1;
      } catch (error) {
        stats.errors += 1;
        errors.push({
          ...candidate,
          reason: error.message || "Failed to create fee record",
        });
      }
    }
  }

  console.log(JSON.stringify({ stats, candidates, errors }, null, 2));

  if (dryRun) {
    console.log(`Dry run only. Re-run with --commit after reviewing the ${academicYear} fee backfill report.`);
  }

  if (!dryRun && stats.errors > 0) {
    throw new Error("Fee backfill completed with errors");
  }

  if (!dryRun) {
    console.log(`Backfilled missing fee records for ${academicYear}. Next academic year would be ${getNextAcademicYear(academicYear)}.`);
  }
};

run()
  .catch((error) => {
    console.error("Fee backfill failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
