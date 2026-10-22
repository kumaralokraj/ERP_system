import Class from "../models/Class.js";
import ClassSession from "../models/ClassSession.js";
import LegacyClass from "../models/LegacyClass.js";
import Student from "../models/Student.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import Teacher from "../models/Teacher.js";
import {
  ENROLLMENT_STATUS_OPTIONS,
  CLASS_STATUS_OPTIONS,
  getFriendlyMongooseError,
  isValidObjectId,
  normalizeAcademicYear,
  sendValidationError,
  toNumber,
  trimString,
  validateAcademicYear,
} from "../utils/requestValidation.js";
import {
  attachAcademicContextToStudents,
  getClassSessionById as fetchClassSessionById,
  getPreviousAcademicYear,
  normalizeClassSessionStatus,
  normalizeFeesPayload,
  normalizeSection,
  serializeClassRecord,
  serializeEnrollment,
  serializeMasterClass,
  syncStudentOperationalRecords,
  upsertCurrentEnrollment,
} from "../services/academicStructureService.js";
import { promoteStudentsForNextYear } from "../services/promotionService.js";

const buildMasterClassPayload = (body = {}) => ({
  name: trimString(body.name),
  order: toNumber(body.order),
});

const buildClassSessionPayload = (body = {}) => ({
  classId: trimString(body.classId || body.masterClassId),
  academicYear: normalizeAcademicYear(body.academicYear),
  section: normalizeSection(body.section),
  classTeacher: trimString(body.classTeacher),
  capacity: toNumber(body.capacity ?? 40),
  fees: normalizeFeesPayload(body.fees),
  status: normalizeClassSessionStatus(body.status),
});

const validateMasterClassPayload = async (payload, excludeClassId = null) => {
  if (!payload.name) {
    return { statusCode: 400, message: "Class name is required" };
  }

  if (!Number.isInteger(payload.order) || payload.order < 1) {
    return { statusCode: 400, message: "Class order must be a whole number greater than 0" };
  }

  const duplicateQuery = {
    $or: [{ name: payload.name }, { order: payload.order }],
  };

  if (excludeClassId) {
    duplicateQuery._id = { $ne: excludeClassId };
  }

  const duplicateClass = await Class.findOne(duplicateQuery);
  if (duplicateClass) {
    return {
      statusCode: 400,
      message:
        duplicateClass.name === payload.name
          ? "Master class with this name already exists"
          : "Master class order already exists",
    };
  }

  return null;
};

const validateClassSessionPayload = async (payload, excludeSessionId = null) => {
  if (!payload.classId) {
    return { statusCode: 400, message: "Master class is required" };
  }

  if (!isValidObjectId(payload.classId)) {
    return { statusCode: 400, message: "Master class is invalid" };
  }

  if (!payload.academicYear) {
    return { statusCode: 400, message: "Academic year is required" };
  }

  const academicYearError = validateAcademicYear(payload.academicYear);
  if (academicYearError) {
    return { statusCode: 400, message: academicYearError };
  }

  if (!payload.classTeacher) {
    return { statusCode: 400, message: "Class teacher is required" };
  }

  if (!isValidObjectId(payload.classTeacher)) {
    return { statusCode: 400, message: "Class teacher is invalid" };
  }

  if (!Number.isInteger(payload.capacity) || payload.capacity < 1 || payload.capacity > 100) {
    return { statusCode: 400, message: "Capacity must be between 1 and 100" };
  }

  for (const [feeKey, feeValue] of Object.entries(payload.fees)) {
    if (feeKey === "currency") {
      continue;
    }

    if (!Number.isFinite(feeValue) || feeValue < 0) {
      return {
        statusCode: 400,
        message: `${feeKey.charAt(0).toUpperCase() + feeKey.slice(1)} fee must be 0 or greater`,
      };
    }
  }

  if (!CLASS_STATUS_OPTIONS.includes(payload.status)) {
    return { statusCode: 400, message: "Please select a valid status" };
  }

  const [masterClass, teacher] = await Promise.all([
    Class.findById(payload.classId),
    Teacher.findById(payload.classTeacher),
  ]);

  if (!masterClass) {
    return { statusCode: 404, message: "Master class not found" };
  }

  if (!teacher) {
    return { statusCode: 404, message: "Teacher not found" };
  }

  const duplicateQuery = {
    classId: payload.classId,
    academicYear: payload.academicYear,
    section: payload.section,
  };

  if (excludeSessionId) {
    duplicateQuery._id = { $ne: excludeSessionId };
  }

  const duplicateSession = await ClassSession.findOne(duplicateQuery);
  if (duplicateSession) {
    return {
      statusCode: 400,
      message: "Class session already exists for this class, year, and section",
    };
  }

  return null;
};

const sortClassSessions = (classSessions = []) =>
  [...classSessions].sort((left, right) => {
    if (left.academicYear !== right.academicYear) {
      return right.academicYear.localeCompare(left.academicYear);
    }

    if ((left.order ?? Number.MAX_SAFE_INTEGER) !== (right.order ?? Number.MAX_SAFE_INTEGER)) {
      return (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER);
    }

    return `${left.section || ""}`.localeCompare(`${right.section || ""}`);
  });

export const getAllMasterClasses = async (req, res) => {
  try {
    const classes = await Class.find().sort({ order: 1, name: 1 });

    res.status(200).json({
      success: true,
      classes: classes.map(serializeMasterClass),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch master classes",
    });
  }
};

export const createMasterClass = async (req, res) => {
  try {
    const classData = buildMasterClassPayload(req.body);
    const validationError = await validateMasterClassPayload(classData);

    if (validationError) {
      return res.status(validationError.statusCode).json({
        success: false,
        message: validationError.message,
      });
    }

    const newClass = await Class.create(classData);

    res.status(201).json({
      success: true,
      message: "Master class created successfully",
      class: serializeMasterClass(newClass),
    });
  } catch (error) {
    const friendlyMessage = getFriendlyMongooseError(error, "Failed to create master class");
    const statusCode = error.code === 11000 || error.name === "ValidationError" ? 400 : 500;
    res.status(statusCode).json({
      success: false,
      message: friendlyMessage,
    });
  }
};

export const getClassSessions = async (req, res) => {
  try {
    const query = {};
    const academicYear = req.query.year ? normalizeAcademicYear(req.query.year) : "";
    const classId = trimString(req.query.classId);
    const status = trimString(req.query.status).toUpperCase();
    const section = normalizeSection(req.query.section);

    if (academicYear) {
      query.academicYear = academicYear;
    }

    if (classId) {
      query.classId = classId;
    }

    if (CLASS_STATUS_OPTIONS.includes(status)) {
      query.status = status;
    }

    if (section !== null) {
      query.section = section;
    }

    const sessions = await ClassSession.find(query).populate([
      { path: "classId", select: "name order" },
      { path: "classTeacher", select: "name email phone" },
    ]);

    res.status(200).json({
      success: true,
      classSessions: sortClassSessions(sessions.map(serializeClassRecord)),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch class sessions",
    });
  }
};

export const getClassSessionById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return sendValidationError(res, "Valid class session ID is required");
    }

    const classSession = await fetchClassSessionById(id);
    if (!classSession) {
      return res.status(404).json({
        success: false,
        message: "Class session not found",
      });
    }

    res.status(200).json({
      success: true,
      classSession: serializeClassRecord(classSession),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch class session",
    });
  }
};

export const createClassSession = async (req, res) => {
  try {
    const classSessionData = buildClassSessionPayload(req.body);
    const validationError = await validateClassSessionPayload(classSessionData);

    if (validationError) {
      return res.status(validationError.statusCode).json({
        success: false,
        message: validationError.message,
      });
    }

    const classSession = await ClassSession.create(classSessionData);
    const populatedClassSession = await fetchClassSessionById(classSession._id);

    res.status(201).json({
      success: true,
      message: "Class session created successfully",
      classSession: serializeClassRecord(populatedClassSession),
    });
  } catch (error) {
    const friendlyMessage = getFriendlyMongooseError(error, "Failed to create class session");
    const statusCode = error.code === 11000 || error.name === "ValidationError" ? 400 : 500;
    res.status(statusCode).json({
      success: false,
      message: friendlyMessage,
    });
  }
};

export const updateClassSession = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return sendValidationError(res, "Valid class session ID is required");
    }

    const existingClassSession = await ClassSession.findById(id);
    if (!existingClassSession) {
      return res.status(404).json({
        success: false,
        message: "Class session not found",
      });
    }

    const classSessionData = buildClassSessionPayload(req.body);
    const validationError = await validateClassSessionPayload(classSessionData, id);

    if (validationError) {
      return res.status(validationError.statusCode).json({
        success: false,
        message: validationError.message,
      });
    }

    await ClassSession.findByIdAndUpdate(
      id,
      {
        $set: classSessionData,
        $unset: {
          "fees.transport": "",
          "fees.frequency": "",
        },
      },
      {
        new: true,
        runValidators: true,
      }
    );

    const updatedClassSession = await fetchClassSessionById(id);
    const currentEnrollments = await StudentEnrollment.find({
      classSessionId: id,
      isCurrent: true,
    }).select("studentId status");
    const assignedStudents = await Student.find({ class: id }).select("_id status");
    const syncTargets = new Map();

    currentEnrollments.forEach((enrollment) => {
      if (enrollment.studentId) {
        syncTargets.set(String(enrollment.studentId), enrollment.status || "active");
      }
    });

    assignedStudents.forEach((student) => {
      syncTargets.set(String(student._id), student.status || "active");
    });

    await Promise.all(
      [...syncTargets.entries()].map(([studentId, status]) =>
        syncStudentOperationalRecords(studentId, updatedClassSession, {
          studentStatus: status === "graduated" ? "graduated" : "active",
        })
      )
    );

    res.status(200).json({
      success: true,
      message: "Class session updated successfully",
      classSession: serializeClassRecord(updatedClassSession),
    });
  } catch (error) {
    const friendlyMessage = getFriendlyMongooseError(error, "Failed to update class session");
    const statusCode = error.code === 11000 || error.name === "ValidationError" ? 400 : 500;
    res.status(statusCode).json({
      success: false,
      message: friendlyMessage,
    });
  }
};

export const deleteClassSession = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return sendValidationError(res, "Valid class session ID is required");
    }

    const [enrollmentCount, assignedStudentCount] = await Promise.all([
      StudentEnrollment.countDocuments({ classSessionId: id }),
      Student.countDocuments({ class: id }),
    ]);

    if (enrollmentCount > 0 || assignedStudentCount > 0) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete a class session that is still assigned to students",
      });
    }

    const deletedClassSession = await ClassSession.findByIdAndDelete(id);
    if (!deletedClassSession) {
      return res.status(404).json({
        success: false,
        message: "Class session not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Class session deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to delete class session",
    });
  }
};

export const getClassSessionCopyTemplate = async (req, res) => {
  try {
    const classId = trimString(req.query.classId);
    const academicYear = normalizeAcademicYear(req.query.academicYear);
    const section = normalizeSection(req.query.section);

    if (!classId || !isValidObjectId(classId)) {
      return sendValidationError(res, "Valid master class is required");
    }

    if (!academicYear) {
      return sendValidationError(res, "Academic year is required");
    }

    const previousAcademicYear = getPreviousAcademicYear(academicYear);
    const primaryQuery = {
      classId,
      academicYear: previousAcademicYear,
    };

    if (section !== null) {
      primaryQuery.section = section;
    }

    let templateSession = await ClassSession.findOne(primaryQuery)
      .sort({ updatedAt: -1 })
      .populate([
        { path: "classId", select: "name order" },
        { path: "classTeacher", select: "name email phone" },
      ]);

    if (!templateSession) {
      templateSession = await ClassSession.findOne({
        classId,
        academicYear: previousAcademicYear,
      })
        .sort({ updatedAt: -1 })
        .populate([
          { path: "classId", select: "name order" },
          { path: "classTeacher", select: "name email phone" },
        ]);
    }

    if (!templateSession) {
      return res.status(404).json({
        success: false,
        message: "No previous-year class session found to copy",
      });
    }

    res.status(200).json({
      success: true,
      template: serializeClassRecord(templateSession),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load class session template",
    });
  }
};

export const enrollStudent = async (req, res) => {
  try {
    const studentId = trimString(req.body.studentId);
    const classSessionId = trimString(req.body.classSessionId || req.body.class);
    const status = trimString(req.body.status).toLowerCase() || "active";

    if (!studentId || !isValidObjectId(studentId)) {
      return sendValidationError(res, "Valid student ID is required");
    }

    if (!classSessionId || !isValidObjectId(classSessionId)) {
      return sendValidationError(res, "Valid class session ID is required");
    }

    if (!ENROLLMENT_STATUS_OPTIONS.includes(status)) {
      return sendValidationError(res, "Please select a valid enrollment status");
    }

    const [student, classSession] = await Promise.all([
      Student.findById(studentId),
      fetchClassSessionById(classSessionId),
    ]);

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    if (!classSession) {
      return res.status(404).json({
        success: false,
        message: "Class session not found",
      });
    }

    const enrollment = await upsertCurrentEnrollment({
      studentId,
      classSessionId,
      academicYear: classSession.academicYear,
      status,
      isCurrent: status !== "graduated",
    });

    await syncStudentOperationalRecords(studentId, classSession, {
      studentStatus: status === "graduated" ? "graduated" : "active",
    });

    const [enrichedStudent] = await attachAcademicContextToStudents([student]);

    res.status(200).json({
      success: true,
      message: "Student enrolled successfully",
      enrollment: serializeEnrollment(enrollment),
      student: enrichedStudent,
    });
  } catch (error) {
    const friendlyMessage = getFriendlyMongooseError(error, "Failed to enroll student");
    const statusCode = error.code === 11000 || error.name === "ValidationError" ? 400 : 500;
    res.status(statusCode).json({
      success: false,
      message: friendlyMessage,
    });
  }
};

export const getStudentEnrollments = async (req, res) => {
  try {
    const studentId = trimString(req.params.id);

    if (!studentId || !isValidObjectId(studentId)) {
      return sendValidationError(res, "Valid student ID is required");
    }

    const enrollments = await StudentEnrollment.find({ studentId })
      .sort({ academicYear: -1, createdAt: -1 })
      .populate({
        path: "classSessionId",
        populate: [
          { path: "classId", select: "name order" },
          { path: "classTeacher", select: "name email phone" },
        ],
      });

    res.status(200).json({
      success: true,
      enrollments: enrollments.map(serializeEnrollment),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch student enrollments",
    });
  }
};

export const promoteStudents = async (req, res) => {
  try {
    const currentYear = normalizeAcademicYear(req.body.currentYear);
    const nextYear = normalizeAcademicYear(req.body.nextYear);

    if (!currentYear || !nextYear) {
      return sendValidationError(res, "Current year and next year are required");
    }

    const promotionSummary = await promoteStudentsForNextYear({
      currentYear,
      nextYear,
      failedStudentIds: Array.isArray(req.body.failedStudentIds) ? req.body.failedStudentIds : [],
      studentDecisions: Array.isArray(req.body.studentDecisions) ? req.body.studentDecisions : [],
    });

    res.status(200).json({
      success: true,
      message: "Promotion completed",
      summary: promotionSummary,
    });
  } catch (error) {
    const friendlyMessage = getFriendlyMongooseError(error, "Failed to promote students");
    const statusCode = error.code === 11000 || error.name === "ValidationError" ? 400 : 500;
    res.status(statusCode).json({
      success: false,
      message: friendlyMessage,
    });
  }
};

export const getLegacyCompatibleClassSessions = async (req, res) => {
  try {
    const classSessions = await ClassSession.find().populate([
      { path: "classId", select: "name order" },
      { path: "classTeacher", select: "name email phone" },
    ]);

    if (classSessions.length > 0) {
      return res.status(200).json({
        success: true,
        classes: sortClassSessions(classSessions.map(serializeClassRecord)),
      });
    }

    const legacyClasses = await LegacyClass.find().populate("classTeacher", "name email phone");

    return res.status(200).json({
      success: true,
      classes: sortClassSessions(legacyClasses.map(serializeClassRecord)),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch classes",
    });
  }
};
