import path from "path";
import { Readable } from "stream";
import ClassSession from "../models/ClassSession.js";
import Student from "../models/Student.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import StudentUniform from "../models/StudentUniform.js";
import {
  normalizeStudentFeeSettings,
  serializeClassRecord,
} from "../services/academicStructureService.js";
import {
  BLOOD_TYPES,
  STUDENT_SEX_OPTIONS,
  isFutureDate,
  isValidEmail,
  isValidPhone,
  normalizeAcademicYear,
  normalizeDigits,
  normalizeEmail,
  trimString,
} from "../utils/requestValidation.js";

const TEMPLATE_COLUMNS = [
  "username",
  "email",
  "password",
  "firstName",
  "lastName",
  "phone",
  "address",
  "bloodType",
  "birthday",
  "sex",
  "studentId",
  "classSession",
  "section",
  "parentName",
  "parentPhone",
  "parentEmail",
];

const REQUIRED_ROW_FIELDS = [
  "username",
  "email",
  "password",
  "firstName",
  "lastName",
  "phone",
  "sex",
  "studentId",
  "classSession",
];

const ALLOWED_EXTENSIONS = new Set([".csv", ".xlsx"]);
const AMBIGUOUS_CLASS_SESSION = Symbol("AMBIGUOUS_CLASS_SESSION");

const HEADER_BY_KEY = new Map(
  TEMPLATE_COLUMNS.map((column) => [column.replace(/[\s_-]+/g, "").toLowerCase(), column])
);

const createBulkUploadError = (statusCode, message, extra = {}) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  Object.assign(error, extra);
  return error;
};

const cleanHeader = (value) => trimString(String(value ?? "").replace(/^\uFEFF/, ""));

const normalizeHeaderKey = (value) => cleanHeader(value).replace(/[\s_-]+/g, "").toLowerCase();

const canonicalizeHeader = (value) => {
  const cleanedHeader = cleanHeader(value);
  return HEADER_BY_KEY.get(normalizeHeaderKey(cleanedHeader)) || cleanedHeader;
};

const normalizeLookupKey = (value) =>
  trimString(String(value ?? ""))
    .replace(/\s+/g, " ")
    .toLowerCase();

const cellToString = (value) => {
  if (value === null || value === undefined) {
    return "";
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return trimString(String(value));
};

const normalizeSex = (value) => {
  const sex = cellToString(value).toLowerCase();
  if (!sex) {
    return "";
  }

  const match = STUDENT_SEX_OPTIONS.find((option) => option.toLowerCase() === sex);
  return match || cellToString(value);
};

const isBlankValue = (value) => {
  if (value === null || value === undefined) {
    return true;
  }

  return cellToString(value) === "";
};

const isBlankRow = (row) => Object.values(row.values || {}).every(isBlankValue);

const getFileExtension = (file) => path.extname(file?.originalname || "").toLowerCase();

const loadCsvParser = async () => {
  try {
    const csvParserModule = await import("csv-parser");
    return csvParserModule.default || csvParserModule;
  } catch (error) {
    if (error?.code === "ERR_MODULE_NOT_FOUND") {
      throw createBulkUploadError(
        500,
        "CSV parser dependency is not installed. Run npm install in the backend folder."
      );
    }

    throw error;
  }
};

const loadXlsx = async () => {
  try {
    const xlsxModule = await import("xlsx");
    return xlsxModule.default || xlsxModule;
  } catch (error) {
    if (error?.code === "ERR_MODULE_NOT_FOUND") {
      throw createBulkUploadError(
        500,
        "XLSX parser dependency is not installed. Run npm install in the backend folder."
      );
    }

    throw error;
  }
};

const parseCsvBuffer = async (buffer) => {
  const csvParser = await loadCsvParser();
  const rows = [];
  let headers = [];
  let rowNumber = 2;

  await new Promise((resolve, reject) => {
    Readable.from([buffer])
      .pipe(
        csvParser({
          mapHeaders: ({ header }) => canonicalizeHeader(header),
        })
      )
      .on("headers", (parsedHeaders = []) => {
        headers = parsedHeaders.map(canonicalizeHeader);
      })
      .on("data", (values) => {
        rows.push({
          rowNumber,
          values,
        });
        rowNumber += 1;
      })
      .on("end", resolve)
      .on("error", () => {
        reject(createBulkUploadError(400, "Unable to parse CSV file. Please check the file format."));
      });
  });

  return { headers, rows };
};

const parseXlsxBuffer = async (buffer) => {
  const xlsx = await loadXlsx();

  try {
    const workbook = xlsx.read(buffer, { type: "buffer", cellDates: true });
    const firstSheetName = workbook.SheetNames?.[0];

    if (!firstSheetName) {
      throw createBulkUploadError(400, "The uploaded file does not contain any student rows.");
    }

    const worksheet = workbook.Sheets[firstSheetName];
    const matrix = xlsx.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: "",
      raw: true,
      blankrows: true,
    });

    if (!matrix.length) {
      throw createBulkUploadError(400, "The uploaded file does not contain any student rows.");
    }

    const headers = (matrix[0] || []).map(canonicalizeHeader);
    const rows = matrix.slice(1).map((cells, index) => {
      const values = {};

      headers.forEach((header, cellIndex) => {
        if (header) {
          values[header] = cells[cellIndex] ?? "";
        }
      });

      return {
        rowNumber: index + 2,
        values,
      };
    });

    return { headers, rows };
  } catch (error) {
    if (error.statusCode) {
      throw error;
    }

    throw createBulkUploadError(400, "Unable to parse XLSX file. Please check the file format.");
  }
};

const parseUploadedStudentFile = async (file) => {
  if (!file) {
    throw createBulkUploadError(400, "No file uploaded");
  }

  const extension = getFileExtension(file);
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw createBulkUploadError(400, "Invalid file type. Please upload a CSV or XLSX file.");
  }

  if (!file.buffer?.length) {
    throw createBulkUploadError(400, "The uploaded file does not contain any student rows.");
  }

  if (extension === ".csv") {
    return parseCsvBuffer(file.buffer);
  }

  return parseXlsxBuffer(file.buffer);
};

const validateRequiredColumns = (headers = []) => {
  if (!headers.length) {
    throw createBulkUploadError(400, "The uploaded file does not contain any student rows.");
  }

  const uploadedHeaderKeys = new Set(headers.map(normalizeHeaderKey));
  const missingColumns = TEMPLATE_COLUMNS.filter((column) => !uploadedHeaderKeys.has(normalizeHeaderKey(column)));

  if (missingColumns.length > 0) {
    throw createBulkUploadError(400, "Missing required columns", { missingColumns });
  }
};

const parseExcelSerialDate = (value) => {
  const serial = Number(value);
  if (!Number.isFinite(serial) || serial <= 0) {
    return null;
  }

  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * millisecondsPerDay);
};

const parseBirthday = (rawValue) => {
  if (rawValue === null || rawValue === undefined || cellToString(rawValue) === "") {
    return { value: undefined };
  }

  let parsedDate = null;

  if (rawValue instanceof Date) {
    parsedDate = rawValue;
  } else if (typeof rawValue === "number") {
    parsedDate = parseExcelSerialDate(rawValue);
  } else {
    const value = cellToString(rawValue);
    if (/^\d+(\.\d+)?$/.test(value) && Number(value) > 1000) {
      parsedDate = parseExcelSerialDate(value);
    } else {
      parsedDate = new Date(value);
    }
  }

  if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
    return { error: "Invalid birthday" };
  }

  if (isFutureDate(parsedDate)) {
    return { error: "Birthday cannot be in the future" };
  }

  parsedDate.setHours(0, 0, 0, 0);
  return { value: parsedDate };
};

const normalizeBulkStudentRow = ({ rowNumber, values }) => {
  const birthday = parseBirthday(values.birthday);

  return {
    rowNumber,
    username: cellToString(values.username),
    email: normalizeEmail(values.email),
    password: cellToString(values.password),
    firstName: cellToString(values.firstName),
    lastName: cellToString(values.lastName),
    phone: normalizeDigits(values.phone),
    address: cellToString(values.address),
    bloodType: cellToString(values.bloodType).toUpperCase(),
    birthday: birthday.value,
    birthdayError: birthday.error,
    sex: normalizeSex(values.sex),
    studentId: cellToString(values.studentId),
    classSession: cellToString(values.classSession),
    section: cellToString(values.section).toUpperCase(),
    parentName: cellToString(values.parentName),
    parentPhone: normalizeDigits(values.parentPhone),
    parentEmail: normalizeEmail(values.parentEmail),
  };
};

const loadClassSessionResolver = async () => {
  const classSessions = await ClassSession.find().populate([{ path: "classId", select: "name order" }]);
  const sessions = classSessions.map(serializeClassRecord).filter(Boolean);
  const lookup = new Map();

  const addLookupKey = (key, session) => {
    const normalizedKey = normalizeLookupKey(key);
    if (!normalizedKey) {
      return;
    }

    const existingValue = lookup.get(normalizedKey);
    if (!existingValue) {
      lookup.set(normalizedKey, session);
      return;
    }

    if (existingValue === AMBIGUOUS_CLASS_SESSION) {
      return;
    }

    if (String(existingValue._id) !== String(session._id)) {
      lookup.set(normalizedKey, AMBIGUOUS_CLASS_SESSION);
    }
  };

  sessions.forEach((session) => {
    const sessionId = String(session._id);
    const name = trimString(session.name);
    const section = trimString(session.section).toUpperCase();
    const academicYear = trimString(session.academicYear);

    addLookupKey(sessionId, session);
    addLookupKey(session.displayName, session);

    if (name && section) {
      addLookupKey(`${name}-${section}`, session);
      addLookupKey(`${name}-${section}-${academicYear}`, session);
      addLookupKey(`${name} ${section} ${academicYear}`, session);
      addLookupKey(`${name} ${section} (${academicYear})`, session);
    }

    if (name && !section && academicYear) {
      addLookupKey(`${name} (${academicYear})`, session);
      addLookupKey(`${name}-${academicYear}`, session);
      addLookupKey(`${name} ${academicYear}`, session);
    }
  });

  return {
    resolve(value) {
      const match = lookup.get(normalizeLookupKey(value));
      if (match === AMBIGUOUS_CLASS_SESSION) {
        return { status: "ambiguous", session: null };
      }

      if (!match) {
        return { status: "missing", session: null };
      }

      return { status: "resolved", session: match };
    },
  };
};

const buildValueMap = (rows, fieldName) => {
  const valueMap = new Map();

  rows.forEach((row) => {
    const value = row[fieldName];
    if (!value) {
      return;
    }

    const rowNumbers = valueMap.get(value) || [];
    rowNumbers.push(row.rowNumber);
    valueMap.set(value, rowNumbers);
  });

  return valueMap;
};

const getDuplicateValues = (valueMap) =>
  new Set(
    [...valueMap.entries()]
      .filter(([, rowNumbers]) => rowNumbers.length > 1)
      .map(([value]) => value)
  );

const findExistingValues = async (fieldName, values = []) => {
  const uniqueValues = [...new Set(values.filter(Boolean))];
  if (uniqueValues.length === 0) {
    return new Set();
  }

  const records = await Student.find({ [fieldName]: { $in: uniqueValues } }).select(fieldName).lean();
  return new Set(records.map((record) => record[fieldName]).filter(Boolean));
};

const validateBulkStudentRows = async (rawRows, { classSessionResolver } = {}) => {
  const normalizedRows = rawRows.map(normalizeBulkStudentRow);
  const emailDuplicatesInFile = getDuplicateValues(buildValueMap(normalizedRows, "email"));
  const studentIdDuplicatesInFile = getDuplicateValues(buildValueMap(normalizedRows, "studentId"));

  const [existingEmails, existingStudentIds] = await Promise.all([
    findExistingValues("email", normalizedRows.map((row) => row.email)),
    findExistingValues("studentId", normalizedRows.map((row) => row.studentId)),
  ]);

  const validRows = [];
  const errors = [];
  let hasExistingDuplicates = false;

  normalizedRows.forEach((row) => {
    const rowErrors = [];
    const missingFields = REQUIRED_ROW_FIELDS.filter((fieldName) => !row[fieldName]);

    if (missingFields.length > 0) {
      rowErrors.push(`Missing required fields: ${missingFields.join(", ")}`);
    }

    if (row.email && !isValidEmail(row.email)) {
      rowErrors.push("Invalid email");
    }

    if (row.password && row.password.length < 6) {
      rowErrors.push("Password must be at least 6 characters");
    }

    if (row.phone && !isValidPhone(row.phone)) {
      rowErrors.push("Invalid phone");
    }

    if (row.parentPhone && !isValidPhone(row.parentPhone)) {
      rowErrors.push("Invalid parent phone");
    }

    if (row.parentEmail && !isValidEmail(row.parentEmail)) {
      rowErrors.push("Invalid parent email");
    }

    if (row.bloodType && !BLOOD_TYPES.includes(row.bloodType)) {
      rowErrors.push("Invalid blood type");
    }

    if (row.sex && !STUDENT_SEX_OPTIONS.includes(row.sex)) {
      rowErrors.push("Invalid sex");
    }

    if (row.birthdayError) {
      rowErrors.push(row.birthdayError);
    }

    if (row.section && (row.section.length > 10 || !/^[A-Z0-9-]+$/.test(row.section))) {
      rowErrors.push("Invalid section");
    }

    if (row.email && emailDuplicatesInFile.has(row.email)) {
      rowErrors.push("Duplicate email in uploaded file");
    }

    if (row.studentId && studentIdDuplicatesInFile.has(row.studentId)) {
      rowErrors.push("Duplicate studentId in uploaded file");
    }

    if (row.email && existingEmails.has(row.email)) {
      hasExistingDuplicates = true;
      rowErrors.push("Duplicate email");
    }

    if (row.studentId && existingStudentIds.has(row.studentId)) {
      hasExistingDuplicates = true;
      rowErrors.push("Duplicate studentId");
    }

    let resolvedClassSession = null;
    if (row.classSession) {
      const classSessionResult = classSessionResolver.resolve(row.classSession);

      if (classSessionResult.status === "ambiguous") {
        rowErrors.push("Ambiguous classSession; use the class session ID or full display label");
      } else if (classSessionResult.status === "missing") {
        rowErrors.push("Invalid classSession");
      } else {
        resolvedClassSession = classSessionResult.session;
      }
    }

    let finalSection = row.section;
    if (resolvedClassSession) {
      const resolvedSection = trimString(resolvedClassSession.section).toUpperCase();
      if (resolvedSection && finalSection && finalSection !== resolvedSection) {
        rowErrors.push("Section does not match classSession");
      }

      if (!finalSection && resolvedSection) {
        finalSection = resolvedSection;
      }
    }

    if (rowErrors.length > 0) {
      errors.push({
        row: row.rowNumber,
        message: rowErrors.join("; "),
      });
      return;
    }

    validRows.push({
      ...row,
      section: finalSection,
      classSessionRecord: resolvedClassSession,
    });
  });

  return {
    total: normalizedRows.length,
    validRows,
    failed: errors.length,
    errors,
    hasExistingDuplicates,
  };
};

const buildPreviewResponse = (validationResult) => ({
  total: validationResult.total,
  valid: validationResult.validRows.length,
  failed: validationResult.errors.length,
  errors: validationResult.errors,
});

const optionalField = (value) => {
  if (value === "" || value === null || value === undefined) {
    return undefined;
  }

  return value;
};

const buildStudentDocuments = (validRows) =>
  validRows.map((row) => ({
    username: row.username,
    email: row.email,
    password: row.password,
    firstName: row.firstName,
    lastName: row.lastName,
    phone: row.phone,
    address: optionalField(row.address),
    bloodType: optionalField(row.bloodType),
    birthday: row.birthday,
    sex: row.sex,
    studentId: row.studentId,
    class: row.classSessionRecord._id,
    section: optionalField(row.section),
    parentName: optionalField(row.parentName),
    parentPhone: optionalField(row.parentPhone),
    parentEmail: optionalField(row.parentEmail),
    feeSettings: normalizeStudentFeeSettings(),
  }));

const buildRelatedOperationalRecords = (insertedStudents, rowsByStudentId) => {
  const enrollments = [];
  const uniforms = [];

  insertedStudents.forEach((student) => {
    const row = rowsByStudentId.get(student.studentId);
    if (!row?.classSessionRecord) {
      return;
    }

    const classSession = row.classSessionRecord;
    const academicYear = normalizeAcademicYear(classSession.academicYear) || trimString(classSession.academicYear);

    enrollments.push({
      studentId: student._id,
      classSessionId: classSession._id,
      academicYear,
      status: "active",
      isCurrent: true,
    });

    uniforms.push({
      student: student._id,
      class: classSession._id,
      status: "pending",
      totalUniformsIssued: 0,
      notes: "Uniform not issued yet",
    });
  });

  return { enrollments, uniforms };
};

const insertRelatedOperationalRecords = async (insertedStudents, rowsByStudentId) => {
  const { enrollments, uniforms } = buildRelatedOperationalRecords(
    insertedStudents,
    rowsByStudentId
  );

  await Promise.all([
    enrollments.length ? StudentEnrollment.insertMany(enrollments, { ordered: false }) : Promise.resolve(),
    uniforms.length ? StudentUniform.insertMany(uniforms, { ordered: false }) : Promise.resolve(),
  ]);
};

const extractInsertManyErrors = (error, validRows) => {
  const writeErrors = error?.writeErrors || error?.result?.result?.writeErrors || [];

  return writeErrors.map((writeError) => {
    const row = validRows[writeError.index];
    const keyPattern = writeError.err?.keyPattern || writeError.keyPattern || {};
    const keyName = Object.keys(keyPattern)[0];
    const message =
      keyName === "email"
        ? "Duplicate email detected during import"
        : keyName === "studentId"
          ? "Duplicate studentId detected during import"
          : "Unable to import this row";

    return {
      row: row?.rowNumber || "unknown",
      message,
    };
  });
};

const prepareValidatedRows = async (req) => {
  const parsedFile = await parseUploadedStudentFile(req.file);
  validateRequiredColumns(parsedFile.headers);

  const studentRows = parsedFile.rows.filter((row) => !isBlankRow(row));
  if (studentRows.length === 0) {
    throw createBulkUploadError(400, "The uploaded file does not contain any student rows.");
  }

  const classSessionResolver = await loadClassSessionResolver();
  return validateBulkStudentRows(studentRows, { classSessionResolver });
};

const formatBulkUploadError = (error, res) => {
  if (error.statusCode) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
      ...(error.missingColumns ? { missingColumns: error.missingColumns } : {}),
    });
  }

  console.error("Bulk student upload error:", error);
  return res.status(500).json({
    success: false,
    message: "Internal server error",
  });
};

export const previewBulkStudents = async (req, res) => {
  try {
    const validationResult = await prepareValidatedRows(req);

    return res.status(200).json({
      success: true,
      ...buildPreviewResponse(validationResult),
    });
  } catch (error) {
    return formatBulkUploadError(error, res);
  }
};

export const importBulkStudents = async (req, res) => {
  try {
    const skipDuplicates = req.body.skipDuplicates !== "false" && req.body.skipDuplicates !== false;
    const validationResult = await prepareValidatedRows(req);

    if (!skipDuplicates && validationResult.hasExistingDuplicates) {
      return res.status(400).json({
        success: false,
        message: "Duplicate students found. Enable skip duplicates to import remaining valid rows.",
        imported: 0,
        total: validationResult.total,
        valid: 0,
        failed: validationResult.total,
        errors: validationResult.errors,
      });
    }

    if (validationResult.validRows.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid student rows to import.",
        imported: 0,
        ...buildPreviewResponse(validationResult),
      });
    }

    const studentDocs = buildStudentDocuments(validationResult.validRows);
    const rowsByStudentId = new Map(validationResult.validRows.map((row) => [row.studentId, row]));
    let insertedStudents = [];
    let importErrors = [];

    try {
      insertedStudents = await Student.insertMany(studentDocs, { ordered: false });
    } catch (error) {
      insertedStudents = error.insertedDocs || [];
      importErrors = extractInsertManyErrors(error, validationResult.validRows);

      if (insertedStudents.length === 0) {
        return res.status(409).json({
          success: false,
          message: "No students were imported because the valid rows conflicted with existing records.",
          imported: 0,
          total: validationResult.total,
          valid: 0,
          failed: validationResult.total,
          errors: [...validationResult.errors, ...importErrors],
        });
      }
    }

    await insertRelatedOperationalRecords(insertedStudents, rowsByStudentId);

    const errors = [...validationResult.errors, ...importErrors];
    const imported = insertedStudents.length;

    return res.status(201).json({
      success: true,
      message: `${imported} students imported successfully`,
      imported,
      total: validationResult.total,
      valid: validationResult.validRows.length,
      failed: validationResult.total - imported,
      errors,
    });
  } catch (error) {
    return formatBulkUploadError(error, res);
  }
};
