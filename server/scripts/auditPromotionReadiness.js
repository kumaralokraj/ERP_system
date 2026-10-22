import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../configs/mongodb.js";
import Class from "../models/Class.js";
import ClassSession from "../models/ClassSession.js";
import Fees from "../models/Fees.js";
import PromotionLog from "../models/PromotionLog.js";
import Student from "../models/Student.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import { normalizeAcademicYear, parseAcademicYear, trimString } from "../utils/requestValidation.js";

const args = process.argv.slice(2);

const getArgValue = (name, fallback = "") => {
  const prefix = `--${name}=`;
  const match = args.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
};

const getNextAcademicYear = (academicYear) => {
  const parsedYear = parseAcademicYear(academicYear);
  if (!parsedYear) {
    return "";
  }

  const nextStartYear = parsedYear.startYear + 1;
  return `${nextStartYear}-${String(parsedYear.endYear + 1).slice(-2)}`;
};

const toId = (value) => String(value?._id || value || "");

const run = async () => {
  await connectDB();

  const currentYear = normalizeAcademicYear(getArgValue("year", "2026-27"));
  const nextYear = normalizeAcademicYear(getArgValue("next-year", getNextAcademicYear(currentYear)));

  if (!currentYear || !nextYear) {
    throw new Error("Valid --year and --next-year values are required");
  }

  const [
    students,
    currentEnrollments,
    allCurrentEnrollments,
    sourceSessions,
    nextSessions,
    masterClasses,
    existingLogs,
  ] = await Promise.all([
    Student.find().select("_id studentId firstName lastName class status").lean(),
    StudentEnrollment.find({ academicYear: currentYear, isCurrent: true }).populate({
      path: "classSessionId",
      populate: { path: "classId", select: "name order" },
    }),
    StudentEnrollment.find({ isCurrent: true }).select("studentId academicYear classSessionId").lean(),
    ClassSession.find({ academicYear: currentYear }).populate({ path: "classId", select: "name order" }).lean(),
    ClassSession.find({ academicYear: nextYear, status: "ACTIVE" })
      .populate({ path: "classId", select: "name order" })
      .lean(),
    Class.find().sort({ order: 1 }).lean(),
    PromotionLog.find({ currentYear, nextYear }).select("_id studentId action createdAt").lean(),
  ]);

  const currentEnrollmentByStudentId = new Map(
    currentEnrollments.map((enrollment) => [toId(enrollment.studentId), enrollment])
  );
  const activeStudents = students.filter((student) => student.status === "active");
  const missingCurrentEnrollment = activeStudents.filter(
    (student) => !currentEnrollmentByStudentId.has(toId(student._id))
  );
  const currentEnrollmentsByStudent = new Map();

  allCurrentEnrollments.forEach((enrollment) => {
    const studentId = toId(enrollment.studentId);
    const list = currentEnrollmentsByStudent.get(studentId) || [];
    list.push(enrollment);
    currentEnrollmentsByStudent.set(studentId, list);
  });

  const multipleCurrentEnrollments = [...currentEnrollmentsByStudent.entries()]
    .filter(([, enrollments]) => enrollments.length > 1)
    .map(([studentId, enrollments]) => ({
      studentId,
      enrollments: enrollments.map((enrollment) => ({
        enrollmentId: toId(enrollment._id),
        academicYear: enrollment.academicYear,
        classSessionId: toId(enrollment.classSessionId),
      })),
    }));

  const studentClassMismatches = currentEnrollments
    .map((enrollment) => {
      const student = students.find((item) => toId(item._id) === toId(enrollment.studentId));
      if (!student) {
        return null;
      }

      const enrollmentClassId = toId(enrollment.classSessionId?._id || enrollment.classSessionId);
      const studentClassId = toId(student.class);
      if (studentClassId === enrollmentClassId) {
        return null;
      }

      return {
        studentId: toId(student._id),
        admissionNo: student.studentId,
        studentClassId,
        enrollmentClassSessionId: enrollmentClassId,
      };
    })
    .filter(Boolean);

  const enrollmentCountsByClassSession = currentEnrollments.reduce((counts, enrollment) => {
    const classSessionId = toId(enrollment.classSessionId?._id || enrollment.classSessionId);
    counts[classSessionId] = (counts[classSessionId] || 0) + 1;
    return counts;
  }, {});

  const classByOrder = new Map(masterClasses.map((classRecord) => [Number(classRecord.order), classRecord]));
  const nextSessionLookup = new Map();

  nextSessions.forEach((session) => {
    const classId = toId(session.classId?._id || session.classId);
    const section = trimString(session.section).toUpperCase();
    nextSessionLookup.set(`${classId}::${section}`, session);
  });

  const missingTargetSessions = sourceSessions
    .map((session) => {
      const classRecord = session.classId;
      const currentOrder = Number(classRecord?.order);
      if (!Number.isFinite(currentOrder)) {
        return {
          sourceSessionId: toId(session._id),
          sourceClass: classRecord?.name || "Unknown",
          section: session.section || "",
          reason: "Missing master class order",
        };
      }

      const nextClass = classByOrder.get(currentOrder + 1);
      if (!nextClass) {
        return null;
      }

      const section = trimString(session.section).toUpperCase();
      const target = nextSessionLookup.get(`${toId(nextClass._id)}::${section}`);
      if (target) {
        return null;
      }

      return {
        sourceSessionId: toId(session._id),
        sourceClass: classRecord?.name || "Unknown",
        targetClass: nextClass.name,
        section,
        targetYear: nextYear,
      };
    })
    .filter(Boolean);

  const currentStudentIds = currentEnrollments.map((enrollment) => toId(enrollment.studentId));
  const feeRecords = await Fees.find({
    student: { $in: currentStudentIds },
    $or: [
      { academicYear: currentYear },
      { academicYear: "" },
      { academicYear: { $exists: false } },
      { isCurrent: true },
      { isCurrent: { $exists: false } },
    ],
  })
    .select("student class classSessionId enrollmentId academicYear isCurrent")
    .lean();
  const feeRecordByStudent = new Map();

  feeRecords.forEach((feeRecord) => {
    const studentId = toId(feeRecord.student);
    if (!feeRecordByStudent.has(studentId)) {
      feeRecordByStudent.set(studentId, feeRecord);
    }
  });

  const studentsWithoutFees = currentStudentIds
    .filter((studentId) => !feeRecordByStudent.has(studentId))
    .map((studentId) => {
      const student = students.find((item) => toId(item._id) === studentId);
      return {
        studentId,
        admissionNo: student?.studentId || "",
      };
    });

  const feeClassMismatches = currentEnrollments
    .map((enrollment) => {
      const feeRecord = feeRecordByStudent.get(toId(enrollment.studentId));
      if (!feeRecord) {
        return null;
      }

      const feeClassId = toId(feeRecord.classSessionId || feeRecord.class);
      const enrollmentClassId = toId(enrollment.classSessionId?._id || enrollment.classSessionId);
      if (!feeClassId || feeClassId === enrollmentClassId) {
        return null;
      }

      return {
        studentId: toId(enrollment.studentId),
        feeClassId,
        enrollmentClassSessionId: enrollmentClassId,
        academicYear: feeRecord.academicYear || "",
      };
    })
    .filter(Boolean);

  const report = {
    currentYear,
    nextYear,
    generatedAt: new Date().toISOString(),
    summary: {
      students: students.length,
      activeStudents: activeStudents.length,
      currentYearCurrentEnrollments: currentEnrollments.length,
      sourceSessions: sourceSessions.length,
      nextYearSessions: nextSessions.length,
      existingPromotionLogs: existingLogs.length,
      missingCurrentEnrollment: missingCurrentEnrollment.length,
      multipleCurrentEnrollments: multipleCurrentEnrollments.length,
      studentClassMismatches: studentClassMismatches.length,
      missingTargetSessions: missingTargetSessions.length,
      studentsWithoutFees: studentsWithoutFees.length,
      feeClassMismatches: feeClassMismatches.length,
    },
    enrollmentCountsByClassSession,
    issues: {
      missingCurrentEnrollment: missingCurrentEnrollment.map((student) => ({
        studentId: toId(student._id),
        admissionNo: student.studentId,
        status: student.status,
      })),
      multipleCurrentEnrollments,
      studentClassMismatches,
      missingTargetSessions,
      studentsWithoutFees,
      feeClassMismatches,
    },
  };

  console.log(JSON.stringify(report, null, 2));
};

run()
  .catch((error) => {
    console.error("Promotion readiness audit failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
