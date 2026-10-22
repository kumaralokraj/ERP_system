import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../configs/mongodb.js";
import Class from "../models/Class.js";
import ClassSession from "../models/ClassSession.js";
import Fees from "../models/Fees.js";
import LegacyClass from "../models/LegacyClass.js";
import Student from "../models/Student.js";
import StudentUniform from "../models/StudentUniform.js";
import Teacher from "../models/Teacher.js";
import {
  inferClassOrder,
  normalizeClassSessionStatus,
  normalizeFeesPayload,
  normalizeSection,
  syncStudentOperationalRecords,
  upsertCurrentEnrollment,
} from "../services/academicStructureService.js";
import { normalizeAcademicYear, trimString } from "../utils/requestValidation.js";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");

const getNameKey = (value) => trimString(value).toUpperCase();

const buildSessionIdentity = (payload) =>
  `${String(payload.classId)}::${payload.academicYear}::${payload.section || ""}`;

const run = async () => {
  await connectDB();
  void Teacher;

  const stats = {
    legacyClassesFound: 0,
    masterClassesCreated: 0,
    classSessionsCreated: 0,
    classSessionsUpdated: 0,
    studentsMigrated: 0,
    enrollmentsCreatedOrUpdated: 0,
    feesRewired: 0,
    uniformsRewired: 0,
    skippedStudents: 0,
  };

  try {
    const legacyClasses = await LegacyClass.find().sort({ createdAt: 1 }).lean();
    stats.legacyClassesFound = legacyClasses.length;

    if (legacyClasses.length === 0) {
      console.log("No legacy classes found. Nothing to migrate.");
      return;
    }

    const existingMasterClasses = await Class.find().sort({ order: 1 }).lean();
    const masterClassMap = new Map(existingMasterClasses.map((classRecord) => [getNameKey(classRecord.name), classRecord]));
    const existingOrderMap = new Map(existingMasterClasses.map((classRecord) => [getNameKey(classRecord.name), classRecord.order]));

    for (const legacyClass of legacyClasses) {
      const nameKey = getNameKey(legacyClass.name);
      if (masterClassMap.has(nameKey)) {
        continue;
      }

      const order = inferClassOrder(legacyClass.name, existingOrderMap);
      const masterClassPayload = {
        name: trimString(legacyClass.name),
        order,
      };

      if (dryRun) {
        masterClassMap.set(nameKey, {
          _id: new mongoose.Types.ObjectId(),
          ...masterClassPayload,
        });
      } else {
        const createdMasterClass = await Class.create(masterClassPayload);
        masterClassMap.set(nameKey, createdMasterClass.toObject());
      }

      existingOrderMap.set(nameKey, order);
      stats.masterClassesCreated += 1;
    }

    const existingSessions = await ClassSession.find().lean();
    const sessionByLegacyId = new Map();
    const sessionByIdentity = new Map();

    existingSessions.forEach((classSession) => {
      if (classSession.legacyClassId) {
        sessionByLegacyId.set(String(classSession.legacyClassId), classSession);
      }
      sessionByIdentity.set(buildSessionIdentity(classSession), classSession);
    });

    for (const legacyClass of legacyClasses) {
      const masterClass = masterClassMap.get(getNameKey(legacyClass.name));
      const sessionPayload = {
        classId: masterClass._id,
        academicYear: normalizeAcademicYear(legacyClass.academicYear) || legacyClass.academicYear,
        section: normalizeSection(legacyClass.section),
        capacity: Number(legacyClass.capacity ?? 40),
        classTeacher: legacyClass.classTeacher || null,
        fees: normalizeFeesPayload(legacyClass.fees),
        status: normalizeClassSessionStatus(legacyClass.status),
        legacyClassId: legacyClass._id,
      };

      const existingSession =
        sessionByLegacyId.get(String(legacyClass._id)) ||
        sessionByIdentity.get(buildSessionIdentity(sessionPayload)) ||
        null;

      if (existingSession) {
        if (!dryRun) {
          await ClassSession.findByIdAndUpdate(existingSession._id, sessionPayload, {
            new: true,
            runValidators: true,
          });
        }

        const updatedSession = {
          ...existingSession,
          ...sessionPayload,
          _id: existingSession._id,
        };
        sessionByLegacyId.set(String(legacyClass._id), updatedSession);
        sessionByIdentity.set(buildSessionIdentity(updatedSession), updatedSession);
        stats.classSessionsUpdated += 1;
        continue;
      }

      const createdSession = dryRun
        ? { _id: new mongoose.Types.ObjectId(), ...sessionPayload }
        : (await ClassSession.create(sessionPayload)).toObject();

      sessionByLegacyId.set(String(legacyClass._id), createdSession);
      sessionByIdentity.set(buildSessionIdentity(createdSession), createdSession);
      stats.classSessionsCreated += 1;
    }

    const students = await Student.find({ class: { $exists: true, $ne: null } })
      .select("_id class status section")
      .lean();

    for (const student of students) {
      const mappedSession = sessionByLegacyId.get(String(student.class));
      if (!mappedSession) {
        stats.skippedStudents += 1;
        continue;
      }

      const enrollmentStatus = student.status === "graduated" ? "graduated" : "active";

      if (!dryRun) {
        const enrollment = await upsertCurrentEnrollment({
          studentId: student._id,
          classSessionId: mappedSession._id,
          academicYear: mappedSession.academicYear,
          status: enrollmentStatus,
          isCurrent: enrollmentStatus !== "graduated",
        });

        await syncStudentOperationalRecords(student._id, mappedSession, {
          studentStatus: enrollmentStatus === "graduated" ? "graduated" : "active",
        });
      }

      stats.studentsMigrated += 1;
      stats.enrollmentsCreatedOrUpdated += 1;
    }

    for (const [legacyClassId, mappedSession] of sessionByLegacyId.entries()) {
      if (!dryRun) {
        const [feesResult, uniformResult] = await Promise.all([
          Fees.updateMany({ class: legacyClassId }, { class: mappedSession._id }),
          StudentUniform.updateMany({ class: legacyClassId }, { class: mappedSession._id }),
        ]);

        stats.feesRewired += feesResult.modifiedCount || 0;
        stats.uniformsRewired += uniformResult.modifiedCount || 0;
      }
    }

    console.log("Academic structure migration summary:");
    Object.entries(stats).forEach(([key, value]) => {
      console.log(`- ${key}: ${value}`);
    });

    if (dryRun) {
      console.log("Dry run only. No data was modified.");
    } else {
      console.log("Migration complete. Legacy `classes` collection was left untouched for rollback/backfill.");
    }
  } finally {
    await mongoose.connection.close();
  }
};

run().catch((error) => {
  console.error("Academic structure migration failed:", error);
  process.exit(1);
});
