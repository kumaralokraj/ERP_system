import mongoose from "mongoose";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\d{10,15}$/;
const ACADEMIC_YEAR_REGEX = /^(\d{4})\s*-\s*(\d{2}|\d{4})$/;

export const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
export const STUDENT_SEX_OPTIONS = ["Male", "Female", "Other"];
export const TEACHER_GENDER_OPTIONS = ["Male", "Female", "Other"];
export const CLASS_STATUS_OPTIONS = ["ACTIVE", "INACTIVE"];
export const LEGACY_CLASS_STATUS_OPTIONS = ["ACTIVE", "ARCHIVED"];
export const ENROLLMENT_STATUS_OPTIONS = [
  "active",
  "promoted",
  "graduated",
  "repeated",
  "transferred",
  "dropped",
  "inactive",
];
export const RESULT_STATUS_OPTIONS = ["pending", "pass", "fail", "detained", "absent", "withheld"];
export const UNIFORM_CONDITIONS = ["good", "worn", "damaged"];

export const trimString = (value) => (typeof value === "string" ? value.trim() : "");
export const normalizeDigits = (value) => `${value ?? ""}`.replace(/\D/g, "");
export const normalizeEmail = (value) => trimString(value).toLowerCase();

export const toNumber = (value) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : Number.NaN;
};

export const isValidEmail = (value) => EMAIL_REGEX.test(value);
export const isValidPhone = (value) => PHONE_REGEX.test(value);
export const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

export const parseAcademicYear = (value) => {
  const normalizedValue = trimString(value);
  const match = normalizedValue.match(ACADEMIC_YEAR_REGEX);

  if (!match) {
    return null;
  }

  const startYear = Number(match[1]);
  const rawEndYear = match[2];
  let endYear = Number(rawEndYear);

  if (rawEndYear.length === 2) {
    const centuryBase = Math.floor(startYear / 100) * 100;
    endYear = centuryBase + endYear;
    if (endYear < startYear) {
      endYear += 100;
    }
  }

  if (endYear !== startYear + 1) {
    return null;
  }

  return {
    startYear,
    endYear,
    normalized: `${startYear}-${String(endYear).slice(-2)}`,
  };
};

export const normalizeAcademicYear = (value) => parseAcademicYear(value)?.normalized || "";

export const validateAcademicYear = (value) => {
  if (!parseAcademicYear(value)) {
    return "Academic year must be in YYYY-YY or YYYY-YYYY format using consecutive years";
  }

  return "";
};

export const getAcademicYearEndDate = (value, month = 3, day = 31) => {
  const parsedYear = parseAcademicYear(value);
  if (!parsedYear) {
    return null;
  }

  return new Date(parsedYear.endYear, month - 1, day, 23, 59, 59, 999);
};

export const isFutureDate = (value) => {
  if (!value) return false;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return parsed > today;
};

export const sendValidationError = (res, message, errors = {}, statusCode = 400) =>
  res.status(statusCode).json({
    success: false,
    message,
    errors,
  });

export const getFriendlyMongooseError = (error, defaultMessage = "Validation failed") => {
  if (!error) return defaultMessage;

  if (error.code === 11000) {
    const duplicateField = Object.keys(error.keyValue || {})[0];
    if (duplicateField) {
      const formattedField = duplicateField.charAt(0).toUpperCase() + duplicateField.slice(1);
      return `${formattedField} already exists`;
    }
    return "A record with the same unique value already exists";
  }

  if (error.name === "ValidationError") {
    const firstError = Object.values(error.errors || {})[0];
    return firstError?.message || defaultMessage;
  }

  return error.message || defaultMessage;
};
