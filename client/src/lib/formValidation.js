import { GLOBAL_BOOK_CLASS_NAME, getBookItemType } from "./bookInventory.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\d{10,15}$/;
const ACADEMIC_YEAR_REGEX = /^(\d{4})\s*-\s*(\d{2}|\d{4})$/;

export const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
export const STUDENT_SEX_OPTIONS = ["Male", "Female", "Other"];
export const TEACHER_GENDER_OPTIONS = ["Male", "Female", "Other"];
export const CLASS_STATUS_OPTIONS = ["ACTIVE", "INACTIVE"];
export const UNIFORM_CONDITIONS = ["good", "worn", "damaged"];

const trimString = (value) => (typeof value === "string" ? value.trim() : "");
const normalizeDigits = (value) => `${value ?? ""}`.replace(/\D/g, "");
const toNumber = (value) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : Number.NaN;
};

const isFutureDate = (value) => {
  if (!value) return false;
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return parsed > today;
};

const parseAcademicYear = (value) => {
  const trimmedValue = trimString(value);
  const match = trimmedValue.match(ACADEMIC_YEAR_REGEX);

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

const validateAcademicYear = (value) => {
  if (!parseAcademicYear(value)) {
    return "Academic year must be in YYYY-YY or YYYY-YYYY format using consecutive years";
  }

  return "";
};

export const getApiErrorMessage = (error, fallbackMessage = "Something went wrong") =>
  error?.response?.data?.message || error?.message || fallbackMessage;

export const validateLoginForm = ({ email, password }) => {
  const cleanedEmail = trimString(email).toLowerCase();
  const errors = {};

  if (!cleanedEmail) {
    errors.email = "Email is required";
  } else if (!EMAIL_REGEX.test(cleanedEmail)) {
    errors.email = "Enter a valid email address";
  }

  if (!password) {
    errors.password = "Password is required";
  }

  return {
    errors,
    payload: {
      email: cleanedEmail,
      password,
    },
  };
};

export const validateStudentForm = (formData, options = {}) => {
  const { requirePassword = true } = options;

  const payload = {
    username: trimString(formData.username),
    email: trimString(formData.email).toLowerCase(),
    password: formData.password || "",
    firstName: trimString(formData.firstName),
    lastName: trimString(formData.lastName),
    phone: normalizeDigits(formData.phone),
    address: trimString(formData.address),
    bloodType: trimString(formData.bloodType),
    birthday: formData.birthday || "",
    sex: trimString(formData.sex) || "Male",
    photo: formData.photo || null,
    studentId: trimString(formData.studentId),
    class: trimString(formData.classSessionId || formData.class),
    section: trimString(formData.section).toUpperCase(),
    parentName: trimString(formData.parentName),
    parentPhone: normalizeDigits(formData.parentPhone),
    parentEmail: trimString(formData.parentEmail).toLowerCase(),
    transportOpted: `${formData.transportOpted ?? "true"}` !== "false",
    transportFee:
      `${formData.transportOpted ?? "true"}` === "false"
        ? 0
        : toNumber(formData.transportFee ?? 0),
    admissionFeeOverride:
      trimString(formData.admissionFeeOverride) === ""
        ? ""
        : toNumber(formData.admissionFeeOverride),
    tuitionConcessionType: trimString(formData.tuitionConcessionType).toLowerCase() || "none",
    tuitionConcessionValue: toNumber(formData.tuitionConcessionValue ?? 0),
    tuitionConcessionReason: trimString(formData.tuitionConcessionReason),
    tuitionConcessionActive: `${formData.tuitionConcessionActive ?? "false"}` === "true",
  };

  const errors = {};

  if (!payload.username) errors.username = "Username is required";
  if (!payload.email) {
    errors.email = "Email is required";
  } else if (!EMAIL_REGEX.test(payload.email)) {
    errors.email = "Enter a valid email address";
  }

  if (requirePassword && !payload.password) {
    errors.password = "Password is required";
  } else if (payload.password && payload.password.length < 6) {
    errors.password = "Password must be at least 6 characters";
  }

  if (!payload.firstName) errors.firstName = "First name is required";
  if (!payload.lastName) errors.lastName = "Last name is required";

  if (!payload.phone) {
    errors.phone = "Phone number is required";
  } else if (!PHONE_REGEX.test(payload.phone)) {
    errors.phone = "Phone number must be 10 to 15 digits";
  }

  if (payload.parentPhone && !PHONE_REGEX.test(payload.parentPhone)) {
    errors.parentPhone = "Parent phone number must be 10 to 15 digits";
  }

  if (payload.parentEmail && !EMAIL_REGEX.test(payload.parentEmail)) {
    errors.parentEmail = "Enter a valid parent email address";
  }

  if (payload.bloodType && !BLOOD_TYPES.includes(payload.bloodType)) {
    errors.bloodType = "Select a valid blood type";
  }

  if (!STUDENT_SEX_OPTIONS.includes(payload.sex)) {
    errors.sex = "Select a valid sex";
  }

  if (payload.birthday && isFutureDate(payload.birthday)) {
    errors.birthday = "Birthday cannot be in the future";
  }

  if (!payload.studentId) errors.studentId = "Student ID is required";
  if (!payload.class) errors.class = "Class session is required";

  if (!Number.isFinite(payload.transportFee) || payload.transportFee < 0) {
    errors.transportFee = "Transport fee must be 0 or greater";
  }

  if (
    payload.admissionFeeOverride !== "" &&
    (!Number.isFinite(payload.admissionFeeOverride) || payload.admissionFeeOverride < 0)
  ) {
    errors.admissionFeeOverride = "Admission fee must be 0 or greater";
  }

  if (!["none", "fixed", "percentage"].includes(payload.tuitionConcessionType)) {
    errors.tuitionConcessionType = "Select a valid tuition concession type";
  }

  if (!Number.isFinite(payload.tuitionConcessionValue) || payload.tuitionConcessionValue < 0) {
    errors.tuitionConcessionValue = "Tuition concession must be 0 or greater";
  } else if (
    payload.tuitionConcessionType === "percentage" &&
    payload.tuitionConcessionValue > 100
  ) {
    errors.tuitionConcessionValue = "Percentage concession cannot exceed 100%";
  }

  if (payload.tuitionConcessionReason.length > 200) {
    errors.tuitionConcessionReason = "Concession reason must be 200 characters or fewer";
  }

  if (payload.photo) {
    if (!payload.photo.type?.startsWith("image/")) {
      errors.photo = "Photo must be an image file";
    } else if (payload.photo.size > 5 * 1024 * 1024) {
      errors.photo = "Photo must be smaller than 5 MB";
    }
  }

  return { errors, payload };
};

export const buildStudentFormData = (payload) => {
  const submissionData = new FormData();

  Object.entries(payload).forEach(([key, value]) => {
    if (key === "photo") {
      if (value) {
        submissionData.append("avatar", value);
      }
      return;
    }

    if (value !== null && value !== undefined) {
      submissionData.append(key, value);
    }
  });

  return submissionData;
};

export const validateTeacherForm = (formData, options = {}) => {
  const { requirePassword = true } = options;

  const payload = {
    name: trimString(formData.name),
    email: trimString(formData.email).toLowerCase(),
    password: formData.password || "",
    phone: normalizeDigits(formData.phone),
    gender: trimString(formData.gender) || "Male",
    dob: formData.dob || "",
    address: trimString(formData.address),
    employeeId: trimString(formData.employeeId),
    qualification: trimString(formData.qualification),
    experienceYears: trimString(formData.experienceYears),
    joiningDate: formData.joiningDate || "",
  };

  const errors = {};
  const parsedExperience = payload.experienceYears === "" ? 0 : toNumber(payload.experienceYears);

  if (!payload.name) errors.name = "Name is required";

  if (!payload.email) {
    errors.email = "Email is required";
  } else if (!EMAIL_REGEX.test(payload.email)) {
    errors.email = "Enter a valid email address";
  }

  if (requirePassword && !payload.password) {
    errors.password = "Password is required";
  } else if (payload.password && payload.password.length < 6) {
    errors.password = "Password must be at least 6 characters";
  }

  if (payload.phone && !PHONE_REGEX.test(payload.phone)) {
    errors.phone = "Phone number must be 10 to 15 digits";
  }

  if (!TEACHER_GENDER_OPTIONS.includes(payload.gender)) {
    errors.gender = "Select a valid gender";
  }

  if (payload.dob && isFutureDate(payload.dob)) {
    errors.dob = "Date of birth cannot be in the future";
  }

  if (payload.joiningDate && isFutureDate(payload.joiningDate)) {
    errors.joiningDate = "Joining date cannot be in the future";
  }

  if (!Number.isFinite(parsedExperience) || parsedExperience < 0 || !Number.isInteger(parsedExperience)) {
    errors.experienceYears = "Experience must be a whole number of years";
  }

  if (payload.dob && payload.joiningDate) {
    const dobDate = new Date(payload.dob);
    const joiningDate = new Date(payload.joiningDate);
    if (!Number.isNaN(dobDate.getTime()) && !Number.isNaN(joiningDate.getTime()) && joiningDate < dobDate) {
      errors.joiningDate = "Joining date cannot be before date of birth";
    }
  }

  return {
    errors,
    payload: {
      ...payload,
      experienceYears: Number.isFinite(parsedExperience) ? parsedExperience : 0,
    },
  };
};

export const validateClassForm = (formData) => {
  const payload = {
    classId: trimString(formData.classId),
    section: trimString(formData.section).toUpperCase(),
    academicYear: normalizeAcademicYear(formData.academicYear),
    classTeacher: trimString(formData.classTeacher),
    capacity: toNumber(formData.capacity),
    fees: {
      tuition: toNumber(formData.fees?.tuition),
      admission: toNumber(formData.fees?.admission ?? 0),
      exam: toNumber(formData.fees?.exam ?? 0),
      currency: trimString(formData.fees?.currency) || "INR",
    },
    status: trimString(formData.status) || "ACTIVE",
  };

  const errors = {};

  if (!payload.classId) errors.classId = "Master class is required";
  if (!payload.academicYear) {
    errors.academicYear = "Academic year is required";
  } else {
    const academicYearError = validateAcademicYear(payload.academicYear);
    if (academicYearError) {
      errors.academicYear = academicYearError;
    }
  }

  if (!payload.classTeacher) errors.classTeacher = "Class teacher is required";

  if (!Number.isInteger(payload.capacity) || payload.capacity < 1 || payload.capacity > 100) {
    errors.capacity = "Capacity must be between 1 and 100";
  }

  ["tuition", "admission", "exam"].forEach((field) => {
    const value = payload.fees[field];
    if (!Number.isFinite(value) || value < 0) {
      errors[`fees.${field}`] = "Fee must be 0 or greater";
    }
  });

  if (!CLASS_STATUS_OPTIONS.includes(payload.status)) {
    errors.status = "Select a valid status";
  }

  return { errors, payload };
};

export const validateAnnouncementForm = ({ title, content }) => {
  const payload = {
    title: trimString(title),
    content: trimString(content),
  };
  const errors = {};

  if (!payload.title) {
    errors.title = "Title is required";
  } else if (payload.title.length > 100) {
    errors.title = "Title must be 100 characters or fewer";
  }

  if (!payload.content) {
    errors.content = "Content is required";
  } else if (payload.content.length > 1000) {
    errors.content = "Content must be 1000 characters or fewer";
  }

  return { errors, payload };
};

export const validatePaymentForm = (amount, maxAmount) => {
  const errors = {};
  const numericAmount = toNumber(amount);

  if (!amount && amount !== 0) {
    errors.amount = "Payment amount is required";
  } else if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    errors.amount = "Enter a valid payment amount";
  } else if (numericAmount > maxAmount) {
    errors.amount = `Payment cannot exceed Rs. ${Number(maxAmount).toLocaleString()}`;
  }

  return {
    errors,
    payload: Number.isFinite(numericAmount) ? numericAmount : 0,
  };
};

export const validateBookInventoryForm = (formData) => {
  const itemType = getBookItemType(formData);
  const payload = {
    name: trimString(formData.name),
    subject: trimString(formData.subject) || (itemType === "diary" ? "Diary" : ""),
    className: itemType === "diary" ? GLOBAL_BOOK_CLASS_NAME : trimString(formData.className),
    itemType,
    totalStock: toNumber(formData.totalStock),
    issuedCount: toNumber(formData.issuedCount ?? 0),
    damagedCount: toNumber(formData.damagedCount ?? 0),
    price: toNumber(formData.price ?? 0),
  };

  const errors = {};

  if (!payload.name) errors.name = itemType === "diary" ? "Diary name is required" : "Book name is required";
  if (!payload.subject) errors.subject = "Subject is required";
  if (!payload.className) errors.className = "Class is required";

  ["totalStock", "issuedCount", "damagedCount"].forEach((field) => {
    const value = payload[field];
    if (!Number.isInteger(value) || value < 0) {
      errors[field] = "Value must be a whole number 0 or greater";
    }
  });

  if (
    Number.isInteger(payload.totalStock) &&
    Number.isInteger(payload.issuedCount) &&
    Number.isInteger(payload.damagedCount) &&
    payload.issuedCount + payload.damagedCount > payload.totalStock
  ) {
    errors.totalStock = "Total stock must cover issued and damaged copies";
  }

  if (!Number.isFinite(payload.price) || payload.price < 0) {
    errors.price = "Price must be 0 or greater";
  }

  return { errors, payload };
};

export const validateUniformInventoryForm = (formData) => {
  const cleanedSizes = (formData.sizes || []).map((sizeItem) => ({
    size: trimString(sizeItem.size),
    stock: toNumber(sizeItem.stock),
    pricePerItem: toNumber(sizeItem.pricePerItem),
  }));

  const payload = {
    name: trimString(formData.name),
    sizes: cleanedSizes.filter((sizeItem) => sizeItem.size),
    description: trimString(formData.description),
    reorderLevel: toNumber(formData.reorderLevel ?? 0),
  };

  const errors = {};
  const seenSizes = new Set();

  if (!payload.name) errors.name = "Uniform item name is required";

  if (payload.sizes.length === 0) {
    errors.sizes = "Add at least one size";
  }

  payload.sizes.forEach((sizeItem, index) => {
    if (!Number.isInteger(sizeItem.stock) || sizeItem.stock <= 0) {
      errors[`sizes.${index}.stock`] = "Stock must be greater than 0";
    }
    if (!Number.isFinite(sizeItem.pricePerItem) || sizeItem.pricePerItem < 0) {
      errors[`sizes.${index}.pricePerItem`] = "Price must be 0 or greater";
    }

    if (seenSizes.has(sizeItem.size)) {
      errors[`sizes.${index}.size`] = "Each size can only be added once";
    }
    seenSizes.add(sizeItem.size);
  });

  if (!Number.isInteger(payload.reorderLevel) || payload.reorderLevel < 0) {
    errors.reorderLevel = "Reorder level must be 0 or greater";
  }

  return {
    errors,
    payload: {
      ...payload,
      totalStock: payload.sizes.reduce((sum, sizeItem) => sum + sizeItem.stock, 0),
    },
  };
};

export const validateUniformIssueForm = (formData, uniformItems) => {
  const errors = {};
  const seenCombinations = new Set();

  const payload = (formData.uniforms || []).map((uniform) => ({
    itemName: trimString(uniform.itemName),
    size: trimString(uniform.size),
    quantity: toNumber(uniform.quantity),
  }));

  const validUniforms = payload.filter((uniform) => uniform.itemName || uniform.size || uniform.quantity);

  if (validUniforms.length === 0) {
    errors.uniforms = "Add at least one uniform item";
  }

  validUniforms.forEach((uniform, index) => {
    if (!uniform.itemName) errors[`uniforms.${index}.itemName`] = "Select a uniform item";
    if (!uniform.size) errors[`uniforms.${index}.size`] = "Select a size";
    if (!Number.isInteger(uniform.quantity) || uniform.quantity <= 0) {
      errors[`uniforms.${index}.quantity`] = "Quantity must be at least 1";
    }

    const key = `${uniform.itemName}::${uniform.size}`;
    if (uniform.itemName && uniform.size) {
      if (seenCombinations.has(key)) {
        errors[`uniforms.${index}.itemName`] = "Each item and size combination can only be added once";
      }
      seenCombinations.add(key);
    }

    const selectedItem = uniformItems.find((item) => item.name === uniform.itemName);
    const selectedSize = selectedItem?.sizes?.find((sizeItem) => sizeItem.size === uniform.size);
    if (uniform.itemName && uniform.size && !selectedSize) {
      errors[`uniforms.${index}.size`] = "Selected size is not available";
    }

    if (
      selectedSize &&
      Number.isInteger(uniform.quantity) &&
      uniform.quantity > Number(selectedSize.stock)
    ) {
      errors[`uniforms.${index}.quantity`] = `Only ${selectedSize.stock} item(s) available`;
    }
  });

  return { errors, payload: validUniforms };
};

export const validateUniformConditionForm = (formData) => {
  const payload = {
    itemName: trimString(formData.itemName),
    size: trimString(formData.size),
    condition: trimString(formData.condition) || "good",
  };
  const errors = {};

  if (!payload.itemName || !payload.size) {
    errors.itemKey = "Select the issued uniform to update";
  }

  if (!UNIFORM_CONDITIONS.includes(payload.condition)) {
    errors.condition = "Select a valid condition";
  }

  return { errors, payload };
};
