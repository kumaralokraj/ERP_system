import ClassSession from "../models/ClassSession.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import StudentResult from "../models/StudentResult.js";
import {
  getFriendlyMongooseError,
  isValidObjectId,
  normalizeAcademicYear,
  RESULT_STATUS_OPTIONS,
  sendValidationError,
  toNumber,
  trimString,
} from "../utils/requestValidation.js";
import { serializeClassRecord, serializeEnrollment } from "../services/academicStructureService.js";

const ENROLLMENT_POPULATION = [
  {
    path: "studentId",
    select: "name firstName lastName studentId admissionNo email phone status",
  },
  {
    path: "classSessionId",
    populate: [
      { path: "classId", select: "name order" },
      { path: "classTeacher", select: "name email phone" },
    ],
  },
];

const normalizeResultStatus = (value) => {
  const normalizedValue = trimString(value).toLowerCase() || "pending";
  return RESULT_STATUS_OPTIONS.includes(normalizedValue) ? normalizedValue : "";
};

const serializeResult = (resultRecord) => {
  const result = resultRecord?.toObject ? resultRecord.toObject() : resultRecord;
  if (!result) {
    return null;
  }

  return {
    _id: result._id,
    studentId: result.studentId,
    enrollmentId: result.enrollmentId,
    classSessionId: result.classSessionId,
    academicYear: result.academicYear,
    resultStatus: result.resultStatus || "pending",
    percentage: result.percentage ?? null,
    grade: result.grade || "",
    remarks: result.remarks || "",
    declaredBy: result.declaredBy || null,
    declaredAt: result.declaredAt || null,
    createdAt: result.createdAt,
    updatedAt: result.updatedAt,
  };
};

const serializeStudentSummary = (studentRecord) => {
  const student = studentRecord?.toObject ? studentRecord.toObject() : studentRecord;
  if (!student) {
    return null;
  }

  return {
    _id: student._id,
    name: student.name || `${student.firstName || ""} ${student.lastName || ""}`.trim(),
    firstName: student.firstName,
    lastName: student.lastName,
    studentId: student.studentId,
    admissionNo: student.admissionNo || student.studentId,
    email: student.email,
    phone: student.phone,
    status: student.status,
  };
};

export const getResultsForClassSession = async (req, res) => {
  try {
    const classSessionId = trimString(req.params.classSessionId);

    if (!isValidObjectId(classSessionId)) {
      return sendValidationError(res, "Valid class session ID is required");
    }

    const classSession = await ClassSession.findById(classSessionId).populate([
      { path: "classId", select: "name order" },
      { path: "classTeacher", select: "name email phone" },
    ]);

    if (!classSession) {
      return res.status(404).json({
        success: false,
        message: "Class session not found",
      });
    }

    const academicYear = normalizeAcademicYear(req.query.academicYear) || classSession.academicYear;
    const enrollments = await StudentEnrollment.find({
      classSessionId,
      academicYear,
    })
      .sort({ createdAt: 1 })
      .populate(ENROLLMENT_POPULATION);
    const results = await StudentResult.find({
      classSessionId,
      academicYear,
      studentId: { $in: enrollments.map((enrollment) => enrollment.studentId?._id || enrollment.studentId) },
    }).lean();
    const resultByStudentId = new Map(results.map((result) => [String(result.studentId), result]));

    return res.status(200).json({
      success: true,
      classSession: serializeClassRecord(classSession),
      students: enrollments.map((enrollment) => {
        const studentId = String(enrollment.studentId?._id || enrollment.studentId);
        const result = resultByStudentId.get(studentId);
        return {
          student: serializeStudentSummary(enrollment.studentId),
          enrollment: serializeEnrollment(enrollment),
          result: serializeResult(result) || {
            _id: null,
            studentId,
            enrollmentId: enrollment._id,
            classSessionId,
            academicYear,
            resultStatus: "pending",
            percentage: null,
            grade: "",
            remarks: "",
          },
        };
      }),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch results",
    });
  }
};

export const saveBulkResults = async (req, res) => {
  try {
    const classSessionId = trimString(req.body.classSessionId);
    const academicYear = normalizeAcademicYear(req.body.academicYear);
    const resultRows = Array.isArray(req.body.results) ? req.body.results : [];

    if (!isValidObjectId(classSessionId)) {
      return sendValidationError(res, "Valid class session ID is required");
    }

    if (!academicYear) {
      return sendValidationError(res, "Valid academic year is required");
    }

    if (resultRows.length === 0) {
      return sendValidationError(res, "At least one result row is required");
    }

    const classSession = await ClassSession.findById(classSessionId);
    if (!classSession) {
      return res.status(404).json({
        success: false,
        message: "Class session not found",
      });
    }

    const enrollmentIds = resultRows.map((row) => row.enrollmentId).filter(isValidObjectId);
    const enrollments = await StudentEnrollment.find({
      _id: { $in: enrollmentIds },
      classSessionId,
      academicYear,
    }).lean();
    const enrollmentById = new Map(enrollments.map((enrollment) => [String(enrollment._id), enrollment]));
    const savedResults = [];
    const errors = [];

    for (const row of resultRows) {
      const enrollmentId = trimString(row.enrollmentId);
      const enrollment = enrollmentById.get(enrollmentId);
      const resultStatus = normalizeResultStatus(row.resultStatus);
      const percentage =
        row.percentage === null || row.percentage === undefined || row.percentage === ""
          ? null
          : toNumber(row.percentage);

      if (!enrollment) {
        errors.push({ enrollmentId, message: "Enrollment does not belong to this class session and year" });
        continue;
      }

      if (!resultStatus) {
        errors.push({ enrollmentId, message: "Invalid result status" });
        continue;
      }

      if (percentage !== null && (!Number.isFinite(percentage) || percentage < 0 || percentage > 100)) {
        errors.push({ enrollmentId, message: "Percentage must be between 0 and 100" });
        continue;
      }

      const payload = {
        studentId: enrollment.studentId,
        enrollmentId: enrollment._id,
        classSessionId,
        academicYear,
        resultStatus,
        percentage,
        grade: trimString(row.grade),
        remarks: trimString(row.remarks),
      };

      if (resultStatus !== "pending") {
        payload.declaredBy = req.user?.id || null;
        payload.declaredAt = new Date();
      }

      const savedResult = await StudentResult.findOneAndUpdate(
        { studentId: enrollment.studentId, academicYear },
        { $set: payload },
        {
          new: true,
          upsert: true,
          runValidators: true,
          setDefaultsOnInsert: true,
        }
      );
      savedResults.push(serializeResult(savedResult));
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Some result rows could not be saved",
        errors,
        savedResults,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Results saved successfully",
      results: savedResults,
    });
  } catch (error) {
    const friendlyMessage = getFriendlyMongooseError(error, "Failed to save results");
    const statusCode = error.code === 11000 || error.name === "ValidationError" ? 400 : 500;
    return res.status(statusCode).json({
      success: false,
      message: friendlyMessage,
    });
  }
};

export const updateResult = async (req, res) => {
  try {
    const resultId = trimString(req.params.resultId);
    const resultStatus = normalizeResultStatus(req.body.resultStatus);

    if (!isValidObjectId(resultId)) {
      return sendValidationError(res, "Valid result ID is required");
    }

    if (!resultStatus) {
      return sendValidationError(res, "Invalid result status");
    }

    const percentage =
      req.body.percentage === null || req.body.percentage === undefined || req.body.percentage === ""
        ? null
        : toNumber(req.body.percentage);

    if (percentage !== null && (!Number.isFinite(percentage) || percentage < 0 || percentage > 100)) {
      return sendValidationError(res, "Percentage must be between 0 and 100");
    }

    const payload = {
      resultStatus,
      percentage,
      grade: trimString(req.body.grade),
      remarks: trimString(req.body.remarks),
    };

    if (resultStatus !== "pending") {
      payload.declaredBy = req.user?.id || null;
      payload.declaredAt = new Date();
    }

    const result = await StudentResult.findByIdAndUpdate(resultId, payload, {
      new: true,
      runValidators: true,
    });

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "Result not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Result updated successfully",
      result: serializeResult(result),
    });
  } catch (error) {
    const friendlyMessage = getFriendlyMongooseError(error, "Failed to update result");
    const statusCode = error.code === 11000 || error.name === "ValidationError" ? 400 : 500;
    return res.status(statusCode).json({
      success: false,
      message: friendlyMessage,
    });
  }
};
