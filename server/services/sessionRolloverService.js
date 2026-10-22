import ClassSession from "../models/ClassSession.js";
import {
  getNextAcademicYear,
  normalizeFeesPayload,
  serializeClassRecord,
} from "./academicStructureService.js";
import { normalizeAcademicYear, trimString } from "../utils/requestValidation.js";

const SESSION_POPULATION = [
  { path: "classId", select: "name order" },
  { path: "classTeacher", select: "name email phone" },
];

const buildSessionKey = (classSession) => {
  const serializedSession = serializeClassRecord(classSession);
  const classId = String(serializedSession?.classId?._id || serializedSession?.classId || "");
  const section = trimString(serializedSession?.section).toUpperCase();
  return `${classId}::${section}`;
};

const validateRolloverYears = (sourceYear, targetYear) => {
  const normalizedSourceYear = normalizeAcademicYear(sourceYear);
  const normalizedTargetYear = normalizeAcademicYear(targetYear);

  if (!normalizedSourceYear || !normalizedTargetYear) {
    return {
      error: { statusCode: 400, message: "Valid source and target academic years are required" },
    };
  }

  const expectedTargetYear = getNextAcademicYear(normalizedSourceYear);
  if (expectedTargetYear !== normalizedTargetYear) {
    return {
      error: {
        statusCode: 400,
        message: `Target year must be the next academic year after ${normalizedSourceYear}`,
      },
    };
  }

  return {
    sourceYear: normalizedSourceYear,
    targetYear: normalizedTargetYear,
  };
};

export const previewSessionRollover = async ({ sourceYear, targetYear } = {}) => {
  const validation = validateRolloverYears(sourceYear, targetYear);
  if (validation.error) {
    return validation;
  }

  const [sourceSessions, targetSessions] = await Promise.all([
    ClassSession.find({ academicYear: validation.sourceYear, status: "ACTIVE" }).populate(SESSION_POPULATION),
    ClassSession.find({ academicYear: validation.targetYear }).populate(SESSION_POPULATION),
  ]);
  const targetSessionByKey = new Map(targetSessions.map((session) => [buildSessionKey(session), session]));
  const sessions = sourceSessions.map((sourceSession) => {
    const targetSession = targetSessionByKey.get(buildSessionKey(sourceSession)) || null;
    return {
      sourceSession: serializeClassRecord(sourceSession),
      targetSession: serializeClassRecord(targetSession),
      status: targetSession ? "existing" : "missing",
    };
  });

  return {
    sourceYear: validation.sourceYear,
    targetYear: validation.targetYear,
    summary: {
      sourceSessions: sourceSessions.length,
      existingTargetSessions: sessions.filter((session) => session.status === "existing").length,
      missingTargetSessions: sessions.filter((session) => session.status === "missing").length,
    },
    sessions,
  };
};

export const cloneClassSessionsForYear = async ({
  sourceYear,
  targetYear,
  selectedClassSessionIds = [],
} = {}) => {
  const validation = validateRolloverYears(sourceYear, targetYear);
  if (validation.error) {
    return validation;
  }

  const selectedIds = new Set(selectedClassSessionIds.map((id) => String(id)).filter(Boolean));
  const sourceQuery = { academicYear: validation.sourceYear, status: "ACTIVE" };
  if (selectedIds.size > 0) {
    sourceQuery._id = { $in: [...selectedIds] };
  }

  const [sourceSessions, targetSessions] = await Promise.all([
    ClassSession.find(sourceQuery).populate(SESSION_POPULATION),
    ClassSession.find({ academicYear: validation.targetYear }).populate(SESSION_POPULATION),
  ]);
  const targetSessionByKey = new Map(targetSessions.map((session) => [buildSessionKey(session), session]));
  const result = {
    sourceYear: validation.sourceYear,
    targetYear: validation.targetYear,
    created: [],
    existing: [],
    skipped: [],
    errors: [],
  };

  for (const sourceSession of sourceSessions) {
    const existingTarget = targetSessionByKey.get(buildSessionKey(sourceSession));
    const serializedSource = serializeClassRecord(sourceSession);

    if (existingTarget) {
      result.existing.push({
        sourceSession: serializedSource,
        targetSession: serializeClassRecord(existingTarget),
      });
      continue;
    }

    try {
      const createdSession = await ClassSession.create({
        classId: serializedSource.classId?._id || sourceSession.classId,
        academicYear: validation.targetYear,
        section: serializedSource.section || null,
        capacity: serializedSource.capacity || 40,
        classTeacher: sourceSession.classTeacher?._id || sourceSession.classTeacher || null,
        fees: normalizeFeesPayload(serializedSource.fees),
        status: "ACTIVE",
      });
      const populatedSession = await ClassSession.findById(createdSession._id).populate(SESSION_POPULATION);
      targetSessionByKey.set(buildSessionKey(populatedSession), populatedSession);
      result.created.push({
        sourceSession: serializedSource,
        targetSession: serializeClassRecord(populatedSession),
      });
    } catch (error) {
      result.errors.push({
        sourceSession: serializedSource,
        message: error.message || "Unable to create target class session",
      });
    }
  }

  result.summary = {
    sourceSessions: sourceSessions.length,
    created: result.created.length,
    existing: result.existing.length,
    skipped: result.skipped.length,
    errors: result.errors.length,
  };

  return result;
};
