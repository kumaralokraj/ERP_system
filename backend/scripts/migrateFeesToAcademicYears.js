import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../configs/mongodb.js";
import ClassSession from "../models/ClassSession.js";
import Fees from "../models/Fees.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import { normalizeAcademicYear, trimString } from "../utils/requestValidation.js";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run") || !args.has("--commit");

const toId = (value) => String(value?._id || value || "");

const dropIndexIfExists = async (collection, indexName) => {
  try {
    await collection.dropIndex(indexName);
    return true;
  } catch (error) {
    if (error?.codeName === "IndexNotFound" || error?.message?.includes("index not found")) {
      return false;
    }

    throw error;
  }
};

const run = async () => {
  await connectDB();

  const fees = await Fees.find().lean();
  const stats = {
    dryRun,
    checked: fees.length,
    readyToUpdate: 0,
    updated: 0,
    unresolvedClassSession: 0,
    missingEnrollment: 0,
    duplicateStudentYear: 0,
    oldStudentIndexDropped: false,
    enrollmentIndexReplaced: false,
    newIndexesCreated: false,
  };
  const blockers = [];
  const updates = [];
  const seenStudentYears = new Map();

  for (const feeRecord of fees) {
    const classSessionId = feeRecord.classSessionId || feeRecord.class;
    const classSession = classSessionId ? await ClassSession.findById(classSessionId).lean() : null;

    if (!classSession) {
      stats.unresolvedClassSession += 1;
      blockers.push({
        feeId: toId(feeRecord._id),
        studentId: toId(feeRecord.student),
        reason: "Unable to resolve fee class to a class session",
      });
      continue;
    }

    const academicYear = normalizeAcademicYear(classSession.academicYear) || trimString(classSession.academicYear);
    const enrollment = await StudentEnrollment.findOne({
      studentId: feeRecord.student,
      academicYear,
    }).lean();

    if (!enrollment) {
      stats.missingEnrollment += 1;
      blockers.push({
        feeId: toId(feeRecord._id),
        studentId: toId(feeRecord.student),
        academicYear,
        classSessionId: toId(classSession._id),
        reason: "No matching enrollment for student and academic year",
      });
      continue;
    }

    const uniqueKey = `${toId(feeRecord.student)}::${academicYear}`;
    if (seenStudentYears.has(uniqueKey) && seenStudentYears.get(uniqueKey) !== toId(feeRecord._id)) {
      stats.duplicateStudentYear += 1;
      blockers.push({
        feeId: toId(feeRecord._id),
        studentId: toId(feeRecord.student),
        academicYear,
        reason: "Multiple fee rows found for the same student and academic year",
      });
      continue;
    }

    seenStudentYears.set(uniqueKey, toId(feeRecord._id));
    stats.readyToUpdate += 1;
    updates.push({
      feeId: feeRecord._id,
      payload: {
        academicYear,
        enrollmentId: enrollment._id,
        classSessionId: classSession._id,
        class: classSession._id,
        isCurrent: Boolean(enrollment.isCurrent),
      },
    });
  }

  if (blockers.length > 0) {
    console.log(JSON.stringify({ stats, blockers }, null, 2));
    throw new Error("Fee migration blocked. Fix unresolved rows before running with --commit.");
  }

  if (!dryRun) {
    for (const update of updates) {
      await Fees.updateOne({ _id: update.feeId }, { $set: update.payload });
      stats.updated += 1;
    }

    stats.oldStudentIndexDropped = await dropIndexIfExists(Fees.collection, "student_1");

    await Fees.collection.createIndex(
      { student: 1, academicYear: 1 },
      {
        unique: true,
        partialFilterExpression: { academicYear: { $type: "string" } },
        name: "student_1_academicYear_1",
      }
    );
    await Fees.collection.createIndex({ student: 1, isCurrent: 1 }, { name: "student_1_isCurrent_1" });
    await Fees.collection.createIndex({ classSessionId: 1, academicYear: 1 }, { name: "classSessionId_1_academicYear_1" });
    stats.enrollmentIndexReplaced = await dropIndexIfExists(Fees.collection, "enrollmentId_1");
    await Fees.collection.createIndex({ enrollmentId: 1 }, { unique: true, sparse: true, name: "enrollmentId_1" });
    stats.newIndexesCreated = true;
  }

  console.log(JSON.stringify({ stats, blockers }, null, 2));

  if (dryRun) {
    console.log("Dry run only. Re-run with --commit after reviewing the report.");
  }
};

run()
  .catch((error) => {
    console.error("Fee academic-year migration failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
