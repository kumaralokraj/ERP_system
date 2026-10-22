import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../configs/mongodb.js";
import Class from "../models/Class.js";
import ClassSession from "../models/ClassSession.js";
import Fees from "../models/Fees.js";
import LegacyClass from "../models/LegacyClass.js";
import Student from "../models/Student.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import {
  calculateFeeBreakdownTotal,
  calculateStudentFeeBreakdown,
  normalizeStudentFeeSettings,
  resolveFeesStatus,
  serializeClassRecord,
} from "../services/academicStructureService.js";
import { getAcademicYearEndDate } from "../utils/requestValidation.js";
import {
  buildFeeInstallments,
  normalizeFeeFrequency,
} from "../utils/feeInstallmentEngine.js";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const createMissingFees = args.has("--create-missing-fees");

void Class;

const toPlainObject = (record) => (record?.toObject ? record.toObject() : record);
const normalizeComparable = (value = {}) => JSON.stringify(toPlainObject(value) || {});
const valuesDiffer = (left, right) => normalizeComparable(left) !== normalizeComparable(right);

const loadClassRecordMap = async (classIds = []) => {
  const normalizedIds = [
    ...new Set(
      classIds
        .map((classId) => String(classId || ""))
        .filter((classId) => classId && mongoose.isValidObjectId(classId))
    ),
  ];
  const classRecordMap = new Map();

  if (normalizedIds.length === 0) {
    return classRecordMap;
  }

  const classSessions = await ClassSession.find({ _id: { $in: normalizedIds } }).populate({
    path: "classId",
    select: "name order",
  });
  const foundSessionIds = new Set();

  classSessions.forEach((classSession) => {
    const serializedSession = serializeClassRecord(classSession);
    if (serializedSession?._id) {
      classRecordMap.set(String(classSession._id), serializedSession);
      foundSessionIds.add(String(classSession._id));
    }
  });

  const legacyIds = normalizedIds.filter((classId) => !foundSessionIds.has(classId));
  if (legacyIds.length > 0) {
    const legacyClasses = await LegacyClass.find({ _id: { $in: legacyIds } });
    legacyClasses.forEach((legacyClass) => {
      const serializedLegacyClass = serializeClassRecord(legacyClass);
      if (serializedLegacyClass?._id) {
        classRecordMap.set(String(legacyClass._id), serializedLegacyClass);
      }
    });
  }

  return classRecordMap;
};

const attachFeeClassContextToStudents = async (students = []) => {
  const normalizedStudents = students.map(toPlainObject);
  const studentIds = normalizedStudents.map((student) => student?._id).filter(Boolean);
  const classRecordByStudentId = new Map();

  if (studentIds.length > 0) {
    const enrollments = await StudentEnrollment.find({
      studentId: { $in: studentIds },
      isCurrent: true,
    })
      .sort({ updatedAt: -1 })
      .populate({
        path: "classSessionId",
        populate: {
          path: "classId",
          select: "name order",
        },
      });

    enrollments.forEach((enrollment) => {
      const studentId = String(enrollment.studentId);
      if (classRecordByStudentId.has(studentId)) {
        return;
      }

      const classRecord = serializeClassRecord(enrollment.classSessionId);
      if (classRecord?._id) {
        classRecordByStudentId.set(studentId, classRecord);
      }
    });
  }

  const fallbackClassRecordMap = await loadClassRecordMap(
    normalizedStudents
      .filter((student) => !classRecordByStudentId.has(String(student?._id)))
      .map((student) => student?.class?._id || student?.class)
  );

  return normalizedStudents.map((student) => {
    const currentClassRecord =
      classRecordByStudentId.get(String(student?._id)) ||
      fallbackClassRecordMap.get(String(student?.class?._id || student?.class)) ||
      null;

    return {
      ...student,
      class: currentClassRecord || student.class,
      classSession: currentClassRecord,
    };
  });
};

const run = async () => {
  await connectDB();

  const stats = {
    studentsChecked: 0,
    studentsUpdated: 0,
    feesCreated: 0,
    feesUpdated: 0,
    feesMissingSkipped: 0,
    skippedNoClass: 0,
  };

  try {
    const students = await attachFeeClassContextToStudents(await Student.find().sort({ createdAt: 1 }).lean());
    stats.studentsChecked = students.length;

    for (const student of students) {
      const feeSettings = normalizeStudentFeeSettings(student.feeSettings);
      stats.studentsUpdated += 1;
      if (!dryRun) {
        await Student.updateOne(
          { _id: student._id },
          {
            $set: {
              "feeSettings.transportOpted": feeSettings.transportOpted,
              "feeSettings.transportFee": feeSettings.transportFee,
              "feeSettings.admissionFeeOverride": feeSettings.admissionFeeOverride,
            },
          }
        );
      }

      const classRecord = student.classSession || student.class;

      if (!classRecord?._id) {
        stats.skippedNoClass += 1;
        continue;
      }

      const feeBreakdown = calculateStudentFeeBreakdown(classRecord, feeSettings);
      const feeFrequency = normalizeFeeFrequency();
      const feeInstallments = buildFeeInstallments({
        academicYear: classRecord.academicYear,
        feeBreakdown,
        feeFrequency,
        tuitionConcession: feeSettings.tuitionConcession,
      });
      const totalFees = calculateFeeBreakdownTotal(feeBreakdown);
      const dueDate = getAcademicYearEndDate(classRecord.academicYear) || new Date();

      const feesRecord = await Fees.findOne({ student: student._id });

      if (!feesRecord) {
        if (!createMissingFees) {
          stats.feesMissingSkipped += 1;
          continue;
        }

        stats.feesCreated += 1;
        if (!dryRun) {
          await Fees.create({
            student: student._id,
            class: classRecord._id,
            totalFees,
            paidAmount: 0,
            dueDate,
            status: "unpaid",
            feeSettings,
            feeBreakdown,
            feeInstallments,
            paymentHistory: [],
          });
        }
        continue;
      }

      const nextPaidAmount = Math.min(Number(feesRecord.paidAmount || 0), totalFees);
      const nextStatus = resolveFeesStatus({
        paidAmount: nextPaidAmount,
        totalFees,
        dueDate: feesRecord.dueDate || dueDate,
      });

      const needsFeesUpdate =
        String(feesRecord.class) !== String(classRecord._id) ||
        Number(feesRecord.totalFees || 0) !== totalFees ||
        Number(feesRecord.paidAmount || 0) !== nextPaidAmount ||
        feesRecord.status !== nextStatus ||
        !feesRecord.dueDate ||
        valuesDiffer(feesRecord.feeSettings, feeSettings) ||
        valuesDiffer(feesRecord.feeBreakdown, feeBreakdown) ||
        valuesDiffer(feesRecord.feeInstallments, feeInstallments);

      if (!needsFeesUpdate) {
        continue;
      }

      stats.feesUpdated += 1;
      if (!dryRun) {
        feesRecord.class = classRecord._id;
        feesRecord.totalFees = totalFees;
        feesRecord.paidAmount = nextPaidAmount;
        feesRecord.dueDate = feesRecord.dueDate || dueDate;
        feesRecord.status = nextStatus;
        feesRecord.feeSettings = feeSettings;
        feesRecord.feeBreakdown = feeBreakdown;
        feesRecord.feeInstallments = buildFeeInstallments({
          academicYear: classRecord.academicYear,
          feeBreakdown,
          feeFrequency,
          existingInstallments: feesRecord.feeInstallments,
          paymentHistory: feesRecord.paymentHistory,
          tuitionConcession: feeSettings.tuitionConcession,
        });
        await feesRecord.save();
      }
    }

    console.log(JSON.stringify({ dryRun, createMissingFees, stats }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
};

run().catch(async (error) => {
  console.error("Failed to backfill student fee settings:", error);
  await mongoose.disconnect();
  process.exit(1);
});
