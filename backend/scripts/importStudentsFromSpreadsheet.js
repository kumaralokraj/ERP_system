import fs from "fs/promises";
import path from "path";
import process from "process";
import { fileURLToPath } from "url";
import "dotenv/config";
import mongoose from "mongoose";
import xlsx from "xlsx";

import ClassSession from "../models/ClassSession.js";
import Student from "../models/Student.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import StudentUniform from "../models/StudentUniform.js";
import {
  normalizeStudentFeeSettings,
  serializeClassRecord,
} from "../services/academicStructureService.js";
import {
  isFutureDate,
  isValidPhone,
  normalizeAcademicYear,
  normalizeDigits,
  trimString,
} from "../utils/requestValidation.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, "..");
const projectRoot = path.resolve(backendRoot, "..");

const SOURCE_COLUMN = Object.freeze({
  studentId: "Student ID",
  name: "Name",
  fatherName: "FatherName",
  motherName: "MotherName",
  dob: "DOB",
  gender: "Gender",
  className: "Class",
  section: "Section",
  admissionNo: "Admission_No",
  admissionDate: "Admission_Date",
  address: "Cur_Address",
  villageWard: "Village_Ward",
  gramPanchayat: "Gram_Panchayat",
  state: "STATE_NAME",
  district: "DISTRICT_NAME",
  pinCode: "Pin_Code",
  contactNo: "ContactNo",
});

const CLASS_ALIASES = new Map([
  ["NURSERY", "Nursery"],
  ["LKG", "LKG"],
  ["UKG", "UKG"],
  ["1ST", "1"],
  ["1", "1"],
  ["2ND", "2"],
  ["2", "2"],
  ["3RD", "3"],
  ["3", "3"],
  ["4TH", "4"],
  ["4", "4"],
  ["5TH", "5"],
  ["5", "5"],
  ["6TH", "6"],
  ["6", "6"],
  ["7TH", "7"],
  ["7", "7"],
  ["8TH", "8"],
  ["8", "8"],
  ["9TH", "9"],
  ["9", "9"],
  ["10TH", "10"],
  ["10", "10"],
]);

const parseArgs = () => {
  const options = {
    file: path.join(projectRoot, "students data.xlsx"),
    academicYear: "2026-27",
    commit: false,
    skipExisting: true,
    insecureTls: false,
    emailDomain: "gps.edu",
    passwordPrefix: "Gps@",
    reportDir: path.join(backendRoot, "import-reports"),
  };

  process.argv.slice(2).forEach((arg) => {
    if (arg === "--commit") {
      options.commit = true;
      return;
    }

    if (arg === "--dry-run") {
      options.commit = false;
      return;
    }

    if (arg === "--fail-on-existing") {
      options.skipExisting = false;
      return;
    }

    if (arg === "--insecure-tls") {
      options.insecureTls = true;
      return;
    }

    const [key, ...valueParts] = arg.replace(/^--/, "").split("=");
    const value = valueParts.join("=");

    if (key === "file" && value) {
      options.file = path.resolve(process.cwd(), value);
    }

    if (key === "academic-year" && value) {
      options.academicYear = normalizeAcademicYear(value) || trimString(value);
    }

    if (key === "email-domain" && value) {
      options.emailDomain = value.toLowerCase();
    }

    if (key === "password-prefix" && value) {
      options.passwordPrefix = value;
    }

    if (key === "report-dir" && value) {
      options.reportDir = path.resolve(process.cwd(), value);
    }
  });

  return options;
};

const normalizeKey = (value) => trimString(String(value ?? "")).replace(/\s+/g, " ").toUpperCase();

const cellString = (value) => trimString(String(value ?? ""));

const normalizeName = (value) => cellString(value).replace(/\s+/g, " ");

const toTitleCase = (value) =>
  normalizeName(value)
    .toLowerCase()
    .replace(/\b[a-z]/g, (character) => character.toUpperCase());

const getCell = (row, columnName) => row[columnName];

const parseExcelSerialDate = (value) => {
  const serial = Number(value);
  if (!Number.isFinite(serial) || serial <= 0) {
    return null;
  }

  return new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 24 * 60 * 60 * 1000);
};

const parseSourceDate = (value) => {
  if (value === null || value === undefined || value === "") {
    return { value: undefined };
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? { error: "Invalid date" } : { value };
  }

  if (typeof value === "number") {
    const parsed = parseExcelSerialDate(value);
    return parsed ? { value: parsed } : { error: "Invalid date" };
  }

  const rawValue = trimString(value);
  if (!rawValue) {
    return { value: undefined };
  }

  if (/^\d+(\.\d+)?$/.test(rawValue)) {
    const parsed = parseExcelSerialDate(rawValue);
    return parsed ? { value: parsed } : { error: "Invalid date" };
  }

  const match = rawValue.match(/^(\d{1,2})[-/ ]([A-Za-z]{3,})[-/ ](\d{2}|\d{4})$/);
  if (match) {
    const [, dayText, monthText, yearText] = match;
    const monthIndex = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"].indexOf(
      monthText.slice(0, 3).toUpperCase()
    );
    const yearNumber = Number(yearText.length === 2 ? `20${yearText}` : yearText);

    if (monthIndex >= 0) {
      const parsedDate = new Date(Date.UTC(yearNumber, monthIndex, Number(dayText)));
      if (!Number.isNaN(parsedDate.getTime())) {
        return { value: parsedDate };
      }
    }
  }

  const parsedDate = new Date(rawValue);
  return Number.isNaN(parsedDate.getTime()) ? { error: "Invalid date" } : { value: parsedDate };
};

const formatDateForReport = (date) => {
  if (!date) {
    return "";
  }

  return new Date(date).toISOString().slice(0, 10);
};

const splitStudentName = (name) => {
  const normalizedName = toTitleCase(name);
  const parts = normalizedName.split(" ").filter(Boolean);

  if (parts.length === 0) {
    return { firstName: "", lastName: "" };
  }

  if (parts.length === 1) {
    return {
      firstName: parts[0],
      lastName: "Student",
    };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
};

const normalizeClassName = (value) => {
  const sourceClass = normalizeKey(value);
  return CLASS_ALIASES.get(sourceClass) || cellString(value);
};

const normalizeGender = (value) => {
  const gender = normalizeKey(value);
  if (gender === "M" || gender === "MALE") {
    return "Male";
  }
  if (gender === "F" || gender === "FEMALE") {
    return "Female";
  }
  return "Other";
};

const buildAddress = (row) => {
  const parts = [
    getCell(row, SOURCE_COLUMN.address),
    getCell(row, SOURCE_COLUMN.villageWard),
    getCell(row, SOURCE_COLUMN.gramPanchayat),
    getCell(row, SOURCE_COLUMN.district),
    getCell(row, SOURCE_COLUMN.state),
    getCell(row, SOURCE_COLUMN.pinCode),
  ]
    .map((value) => cellString(value))
    .filter(Boolean);

  return [...new Set(parts)].join(", ");
};

const buildParentName = (row) => {
  const fatherName = toTitleCase(getCell(row, SOURCE_COLUMN.fatherName));
  const motherName = toTitleCase(getCell(row, SOURCE_COLUMN.motherName));

  if (fatherName && motherName) {
    return `${fatherName} / ${motherName}`;
  }

  return fatherName || motherName || "";
};

const buildEmail = (studentId, emailDomain) => `student.${studentId}@${emailDomain}`;

const loadWorkbookRows = (filePath) => {
  const workbook = xlsx.readFile(filePath, { cellDates: true });
  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    throw new Error("Workbook does not contain any sheets.");
  }

  const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], {
    defval: "",
    raw: false,
  });

  return {
    sheetName,
    rows,
  };
};

const validateSourceHeaders = (rows) => {
  const headers = new Set(Object.keys(rows[0] || {}));
  const requiredHeaders = [
    SOURCE_COLUMN.studentId,
    SOURCE_COLUMN.name,
    SOURCE_COLUMN.fatherName,
    SOURCE_COLUMN.motherName,
    SOURCE_COLUMN.dob,
    SOURCE_COLUMN.gender,
    SOURCE_COLUMN.className,
    SOURCE_COLUMN.section,
    SOURCE_COLUMN.contactNo,
    SOURCE_COLUMN.address,
  ];

  const missingHeaders = requiredHeaders.filter((header) => !headers.has(header));
  if (missingHeaders.length > 0) {
    throw new Error(`Missing source columns: ${missingHeaders.join(", ")}`);
  }
};

const loadClassSessionMap = async (academicYear) => {
  const sessions = await ClassSession.find({ academicYear }).populate([{ path: "classId", select: "name order" }]);
  const classSessionMap = new Map();

  sessions.map(serializeClassRecord).forEach((session) => {
    const key = `${normalizeKey(session.name)}::${normalizeKey(session.section)}`;
    classSessionMap.set(key, session);
  });

  return classSessionMap;
};

const sourceRowToStudentRow = (row, index, options, classSessionMap) => {
  const errors = [];
  const sourceRowNumber = index + 2;
  const studentId = cellString(getCell(row, SOURCE_COLUMN.studentId));
  const studentName = normalizeName(getCell(row, SOURCE_COLUMN.name));
  const className = normalizeClassName(getCell(row, SOURCE_COLUMN.className));
  const section = normalizeKey(getCell(row, SOURCE_COLUMN.section));
  const classSessionKey = `${normalizeKey(className)}::${section}`;
  const classSession = classSessionMap.get(classSessionKey);
  const phone = normalizeDigits(getCell(row, SOURCE_COLUMN.contactNo));
  const birthdayResult = parseSourceDate(getCell(row, SOURCE_COLUMN.dob));
  const admissionDateResult = parseSourceDate(getCell(row, SOURCE_COLUMN.admissionDate));
  const { firstName, lastName } = splitStudentName(studentName);

  if (!studentId) errors.push("Missing Student ID");
  if (!studentName) errors.push("Missing Name");
  if (!firstName || !lastName) errors.push("Unable to split student name");
  if (!className) errors.push("Missing Class");
  if (!section) errors.push("Missing Section");
  if (!classSession) errors.push(`No class session found for ${className}-${section} (${options.academicYear})`);
  if (!phone) errors.push("Missing ContactNo");
  if (phone && !isValidPhone(phone)) errors.push("Invalid ContactNo");
  if (birthdayResult.error) errors.push(`Invalid DOB: ${birthdayResult.error}`);
  if (birthdayResult.value && isFutureDate(birthdayResult.value)) errors.push("DOB cannot be in the future");

  const email = buildEmail(studentId, options.emailDomain);

  return {
    sourceRowNumber,
    source: {
      sno: cellString(getCell(row, "Sno")),
      admissionNo: cellString(getCell(row, SOURCE_COLUMN.admissionNo)),
      admissionDate: formatDateForReport(admissionDateResult.value),
      className: cellString(getCell(row, SOURCE_COLUMN.className)),
      mappedClassName: className,
      section,
    },
    errors,
    studentId,
    email,
    document: {
      username: toTitleCase(studentName),
      email,
      password: `${options.passwordPrefix}${studentId}`,
      firstName,
      lastName,
      phone,
      address: buildAddress(row) || undefined,
      birthday: birthdayResult.value,
      sex: normalizeGender(getCell(row, SOURCE_COLUMN.gender)),
      studentId,
      class: classSession?._id,
      section,
      parentName: buildParentName(row) || undefined,
      parentPhone: phone,
      parentEmail: undefined,
      feeSettings: normalizeStudentFeeSettings(),
      enrollmentDate: admissionDateResult.value || undefined,
    },
    classSession,
  };
};

const markDuplicateRows = (records, fieldName, message) => {
  const valueMap = new Map();
  records.forEach((record) => {
    const value = record[fieldName];
    if (!value) return;
    const matches = valueMap.get(value) || [];
    matches.push(record);
    valueMap.set(value, matches);
  });

  valueMap.forEach((matches) => {
    if (matches.length > 1) {
      matches.forEach((record) => record.errors.push(message));
    }
  });
};

const markExistingRows = async (records, options) => {
  const studentIds = [...new Set(records.map((record) => record.studentId).filter(Boolean))];
  const emails = [...new Set(records.map((record) => record.email).filter(Boolean))];

  const [existingStudentIdRecords, existingEmailRecords] = await Promise.all([
    Student.find({ studentId: { $in: studentIds } }).select("studentId").lean(),
    Student.find({ email: { $in: emails } }).select("email").lean(),
  ]);

  const existingStudentIds = new Set(existingStudentIdRecords.map((record) => record.studentId));
  const existingEmails = new Set(existingEmailRecords.map((record) => record.email));

  records.forEach((record) => {
    const isExistingStudentId = existingStudentIds.has(record.studentId);
    const isExistingEmail = existingEmails.has(record.email);

    if (!isExistingStudentId && !isExistingEmail) {
      return;
    }

    record.isExisting = true;

    if (!options.skipExisting) {
      if (isExistingStudentId) record.errors.push("Student ID already exists in database");
      if (isExistingEmail) record.errors.push("Generated email already exists in database");
    }
  });
};

const buildRelatedDocuments = (students, recordByStudentId) => {
  const enrollments = [];
  const uniforms = [];

  students.forEach((student) => {
    const record = recordByStudentId.get(student.studentId);
    const classSession = record.classSession;
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

const writeReport = async (options, report) => {
  await fs.mkdir(options.reportDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(options.reportDir, `student-import-${timestamp}.json`);
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  return reportPath;
};

const connectToDatabase = async (options) => {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is missing in environment variables.");
  }

  await mongoose.connect(process.env.MONGODB_URI, {
    ...(options.insecureTls ? { tlsAllowInvalidCertificates: true } : {}),
  });
};

const importStudents = async (records) => {
  const session = await mongoose.startSession();

  try {
    let insertedStudents = [];

    await session.withTransaction(async () => {
      insertedStudents = await Student.insertMany(
        records.map((record) => record.document),
        { session, ordered: true }
      );

      const recordByStudentId = new Map(records.map((record) => [record.studentId, record]));
      const { enrollments, uniforms } = buildRelatedDocuments(insertedStudents, recordByStudentId);

      await StudentEnrollment.insertMany(enrollments, { session, ordered: true });
      await StudentUniform.insertMany(uniforms, { session, ordered: true });
    });

    return insertedStudents.length;
  } finally {
    await session.endSession();
  }
};

const main = async () => {
  const options = parseArgs();
  console.log(`Mode: ${options.commit ? "COMMIT" : "DRY RUN"}`);
  console.log(`Workbook: ${options.file}`);
  console.log(`Academic year: ${options.academicYear}`);

  const { sheetName, rows } = loadWorkbookRows(options.file);
  if (rows.length === 0) {
    throw new Error("Workbook sheet does not contain student rows.");
  }

  validateSourceHeaders(rows);
  console.log(`Sheet: ${sheetName}`);
  console.log(`Source rows: ${rows.length}`);

  await connectToDatabase(options);
  console.log(`MongoDB connected (${mongoose.connection.name})`);

  const classSessionMap = await loadClassSessionMap(options.academicYear);
  const records = rows.map((row, index) => sourceRowToStudentRow(row, index, options, classSessionMap));

  markDuplicateRows(records, "studentId", "Duplicate Student ID in spreadsheet");
  markDuplicateRows(records, "email", "Duplicate generated email in spreadsheet");
  await markExistingRows(records, options);

  const invalidRecords = records.filter((record) => record.errors.length > 0);
  const existingSkippedRecords = records.filter((record) => record.isExisting && options.skipExisting);
  const importableRecords = records.filter(
    (record) => record.errors.length === 0 && !(record.isExisting && options.skipExisting)
  );

  const classCounts = records.reduce((counts, record) => {
    const key = `${record.source.mappedClassName}-${record.source.section}`;
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});

  const report = {
    mode: options.commit ? "commit" : "dry-run",
    workbook: options.file,
    sheetName,
    academicYear: options.academicYear,
    totalRows: records.length,
    importableRows: importableRecords.length,
    invalidRows: invalidRecords.length,
    skippedExistingRows: existingSkippedRecords.length,
    classCounts,
    errors: invalidRecords.map((record) => ({
      row: record.sourceRowNumber,
      studentId: record.studentId,
      name: record.document.username,
      errors: record.errors,
    })),
    skippedExisting: existingSkippedRecords.map((record) => ({
      row: record.sourceRowNumber,
      studentId: record.studentId,
      name: record.document.username,
    })),
    preview: importableRecords.slice(0, 10).map((record) => ({
      row: record.sourceRowNumber,
      studentId: record.studentId,
      username: record.document.username,
      email: record.document.email,
      classSession: record.classSession?.displayName,
      birthday: formatDateForReport(record.document.birthday),
      phone: record.document.phone,
      parentName: record.document.parentName,
    })),
  };

  if (invalidRecords.length > 0) {
    const reportPath = await writeReport(options, report);
    console.log(`Invalid rows: ${invalidRecords.length}`);
    console.log(`Report: ${reportPath}`);
    process.exitCode = 1;
    return;
  }

  if (!options.commit) {
    const reportPath = await writeReport(options, report);
    console.log(`Importable rows: ${importableRecords.length}`);
    console.log(`Skipped existing rows: ${existingSkippedRecords.length}`);
    console.log("Dry run passed. Re-run with --commit to insert students.");
    console.log(`Report: ${reportPath}`);
    return;
  }

  if (importableRecords.length === 0) {
    const reportPath = await writeReport(options, report);
    console.log("No new students to import.");
    console.log(`Report: ${reportPath}`);
    return;
  }

  const importedCount = await importStudents(importableRecords);
  report.importedRows = importedCount;
  const reportPath = await writeReport(options, report);

  console.log(`${importedCount} students imported successfully.`);
  console.log(`Skipped existing rows: ${existingSkippedRecords.length}`);
  console.log(`Report: ${reportPath}`);
};

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
