import crypto from "crypto";
import Family from "../models/Family.js";
import Student from "../models/Student.js";
import { trimString } from "../utils/requestValidation.js";

const HONORIFIC_PATTERN = /\b(mr|mrs|ms|miss|shri|smt|dr|prof|devi)\b\.?/gi;

export const normalizeFamilyText = (value = "") =>
  trimString(value)
    .replace(HONORIFIC_PATTERN, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

export const normalizeFamilyPhone = (value = "") => {
  const digits = trimString(value).replace(/\D+/g, "");
  if (digits.length > 10 && digits.startsWith("91")) {
    return digits.slice(-10);
  }
  return digits;
};

const titleCase = (value = "") =>
  trimString(value)
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const splitCombinedParentNames = (value = "") => {
  const [fatherPart = "", motherPart = ""] = trimString(value)
    .split("/")
    .map((part) => trimString(part));

  return {
    fatherName: fatherPart,
    motherName: motherPart,
  };
};

export const getParentFirstName = (value = "") =>
  normalizeFamilyText(value).split(/\s+/).filter(Boolean)[0] || "";

export const getStudentFamilyFields = (student = {}) => {
  const parent = student.parent || {};
  const rawFatherName = trimString(parent.fatherName || student.fatherName || student.parentName);
  const rawMotherName = trimString(parent.motherName || student.motherName);
  const combinedParentNames = splitCombinedParentNames(rawFatherName);
  const fatherName = combinedParentNames.fatherName || rawFatherName;
  const motherName = rawMotherName || combinedParentNames.motherName;
  const phone = normalizeFamilyPhone(parent.phone || student.parentPhone || student.phone);

  return {
    fatherName,
    motherName,
    phone,
    address: trimString(student.address),
  };
};

const buildParentFirstNameFamilyKey = ({ fatherName = "", motherName = "" } = {}) => {
  const fatherFirstName = getParentFirstName(fatherName);
  const motherFirstName = getParentFirstName(motherName);

  if (!fatherFirstName || !motherFirstName) {
    return "";
  }

  return `parents_first::${fatherFirstName}::${motherFirstName}`;
};

export const buildFamilyKey = (student = {}) => {
  const keys = buildFamilyKeys(student);
  return keys[0] || "";
};

export const buildFamilyKeys = (student = {}) => {
  const familyKey = buildParentFirstNameFamilyKey(getStudentFamilyFields(student));
  const keys = [];

  if (familyKey) {
    keys.push(familyKey);
  }

  return [...new Set(keys)];
};

const buildSingleStudentFamilyKey = (student = {}) => {
  const stableId = student._id || student.id || student.studentId || student.admissionNo || crypto.randomUUID();
  return `single::${stableId}`;
};

const buildFamilyDisplayName = (student = {}) => {
  const { fatherName } = getStudentFamilyFields(student);
  const normalizedFatherName = titleCase(fatherName);
  if (normalizedFatherName) {
    const lastName = normalizedFatherName.split(/\s+/).filter(Boolean).slice(-1)[0];
    return `${lastName || normalizedFatherName} Family`;
  }

  const studentLastName = titleCase(student.lastName);
  if (studentLastName) {
    return `${studentLastName} Family`;
  }

  return "Family";
};

const buildFamilyCode = () => {
  const randomPart = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `FAM-${Date.now()}-${randomPart}`;
};

const getQueryWithSession = (query, session) => (session ? query.session(session) : query);

const saveWithSession = (record, session) => record.save(session ? { session } : undefined);

const createFamily = async (payload, { session } = {}) => {
  if (!session) {
    return Family.create(payload);
  }

  const [createdFamily] = await Family.create([payload], { session });
  return createdFamily;
};

export const resolveFamilyForStudentData = async (student = {}, { session } = {}) => {
  const familyKeys = buildFamilyKeys(student);
  const familyKey = familyKeys[0] || buildSingleStudentFamilyKey(student);
  const { fatherName, motherName, phone, address } = getStudentFamilyFields(student);

  let existingFamily = await getQueryWithSession(
    Family.findOne({
      status: { $ne: "merged" },
      $or: [
        { familyKey: { $in: familyKeys.length ? familyKeys : [familyKey] } },
        { familyKeys: { $in: familyKeys.length ? familyKeys : [familyKey] } },
      ],
    }),
    session
  );

  if (!existingFamily && familyKeys.length > 0) {
    const parentCandidates = await getQueryWithSession(
      Family.find({
        status: { $ne: "merged" },
      }),
      session
    );
    existingFamily = parentCandidates.find(
      (family) => buildFamilyKeys(family).some((key) => familyKeys.includes(key))
    ) || null;
  }

  if (existingFamily) {
    let changed = false;
    const nextFamilyKeys = [...new Set([...(existingFamily.familyKeys || []), ...(familyKeys.length ? familyKeys : [familyKey])])];
    if (nextFamilyKeys.length !== (existingFamily.familyKeys || []).length) {
      existingFamily.familyKeys = nextFamilyKeys;
      changed = true;
    }
    if (!existingFamily.manualLock && familyKeys.length > 0 && existingFamily.familyKey !== familyKey) {
      existingFamily.familyKey = familyKey;
      changed = true;
    }
    if (!existingFamily.fatherName && fatherName) {
      existingFamily.fatherName = fatherName;
      changed = true;
    }
    if (!existingFamily.motherName && motherName) {
      existingFamily.motherName = motherName;
      changed = true;
    }
    if (!existingFamily.primaryPhone && phone) {
      existingFamily.primaryPhone = phone;
      changed = true;
    } else if (
      phone &&
      existingFamily.primaryPhone !== phone &&
      !(existingFamily.secondaryPhones || []).includes(phone)
    ) {
      existingFamily.secondaryPhones = [...(existingFamily.secondaryPhones || []), phone];
      changed = true;
    }
    if (!existingFamily.address && address) {
      existingFamily.address = address;
      changed = true;
    }
    if (changed && !existingFamily.manualLock) {
      await saveWithSession(existingFamily, session);
    }

    return { family: existingFamily, familyKey };
  }

  const family = await createFamily(
    {
      familyCode: buildFamilyCode(),
      familyKey,
      familyKeys: familyKeys.length ? familyKeys : [familyKey],
      displayName: buildFamilyDisplayName(student),
      fatherName,
      motherName,
      primaryPhone: phone,
      address,
    },
    { session }
  );

  return { family, familyKey };
};

export const assignFamilyToStudentRecord = async (studentRecord, { session } = {}) => {
  if (!studentRecord) {
    return null;
  }

  const student = studentRecord.toObject ? studentRecord.toObject() : studentRecord;
  const { family, familyKey } = await resolveFamilyForStudentData(student, { session });

  if (!family?._id) {
    return null;
  }

  if (studentRecord.save) {
    studentRecord.familyId = family._id;
    studentRecord.familyKey = familyKey;
    await saveWithSession(studentRecord, session);
    await syncStudentsForFamilyKey(family, familyKey, { session });
    return family;
  }

  await getQueryWithSession(
    Student.findByIdAndUpdate(student._id, {
      familyId: family._id,
      familyKey,
    }),
    session
  );

  await syncStudentsForFamilyKey(family, familyKey, { session });
  return family;
};

export const syncStudentsForFamilyKey = async (family, familyKey = "", { session } = {}) => {
  if (!family?._id || !familyKey || familyKey.startsWith("single::")) {
    return 0;
  }

  const students = await getQueryWithSession(
    Student.find({})
      .select("_id parent parentName motherName parentPhone phone familyId familyKey")
      .lean(),
    session
  );
  const updates = students
    .filter((student) => buildFamilyKeys(student).includes(familyKey))
    .filter(
      (student) =>
        String(student.familyId || "") !== String(family._id) ||
        String(student.familyKey || "") !== familyKey
    )
    .map((student) => ({
      updateOne: {
        filter: { _id: student._id },
        update: {
          $set: {
            familyId: family._id,
            familyKey,
          },
        },
      },
    }));

  if (updates.length === 0) {
    return 0;
  }

  const options = session ? { session } : undefined;
  const result = await Student.bulkWrite(updates, options);
  return result.modifiedCount || result.matchedCount || 0;
};

export const ensureStudentFamily = async (studentId, { session } = {}) => {
  const student = await getQueryWithSession(Student.findById(studentId), session);
  if (!student) {
    return null;
  }

  return assignFamilyToStudentRecord(student, { session });
};

export const ensureFamiliesForStudents = async (students = [], { session } = {}) => {
  const families = new Map();

  for (const student of students) {
    if (!student) {
      continue;
    }

    const expectedFamilyKey = buildFamilyKey(student);
    if (student.familyId && (!expectedFamilyKey || student.familyKey === expectedFamilyKey)) {
      families.set(String(student._id), student.familyId);
      continue;
    }

    const family = await assignFamilyToStudentRecord(student, { session });
    if (family?._id) {
      families.set(String(student._id), family._id);
    }
  }

  return families;
};
