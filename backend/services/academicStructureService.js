import Class from "../models/Class.js";
import ClassSession from "../models/ClassSession.js";
import Fees from "../models/Fees.js";
import LegacyClass from "../models/LegacyClass.js";
import Student from "../models/Student.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import StudentUniform from "../models/StudentUniform.js";
import {
  getAcademicYearEndDate,
  normalizeAcademicYear,
  parseAcademicYear,
  trimString,
} from "../utils/requestValidation.js";
import {
  buildFeeInstallments,
  normalizeFeeFrequency,
} from "../utils/feeInstallmentEngine.js";
import {
  calculateTuitionConcessionSummary,
  normalizeTuitionConcession,
} from "../utils/tuitionConcession.js";

const DEFAULT_FEES = Object.freeze({
  tuition: 0,
  admission: 0,
  exam: 0,
  currency: "INR",
});

const MASTER_CLASS_ORDER_MAP = new Map([
  ["PLAYGROUP", 1],
  ["PRE-NURSERY", 2],
  ["PRE NURSERY", 2],
  ["NURSERY", 3],
  ["LKG", 4],
  ["UKG", 5],
]);

const SESSION_POPULATION = [
  { path: "classId", select: "name order" },
  { path: "classTeacher", select: "name email phone" },
];

const toObjectIfNeeded = (record) => (record?.toObject ? record.toObject() : record);

export const normalizeSection = (value) => {
  const normalizedValue = trimString(value).toUpperCase();
  return normalizedValue || null;
};

export const normalizeClassSessionStatus = (value) => {
  const normalizedValue = trimString(value).toUpperCase();
  if (!normalizedValue) {
    return "ACTIVE";
  }

  if (normalizedValue === "ARCHIVED") {
    return "INACTIVE";
  }

  return normalizedValue;
};

export const normalizeFeesPayload = (fees = {}) => ({
  tuition: Number(fees?.tuition ?? DEFAULT_FEES.tuition) || 0,
  admission: Number(fees?.admission ?? DEFAULT_FEES.admission) || 0,
  exam: Number(fees?.exam ?? DEFAULT_FEES.exam) || 0,
  currency: trimString(fees?.currency) || DEFAULT_FEES.currency,
});

export const calculateSessionTotalFees = (classRecord) => {
  const fees = normalizeFeesPayload(classRecord?.fees);
  return fees.tuition + fees.admission + fees.exam;
};

export const normalizeStudentFeeSettings = (feeSettings = {}) => {
  const transportOpted = feeSettings?.transportOpted !== false;
  const hasAdmissionOverride =
    feeSettings?.admissionFeeOverride !== null &&
    feeSettings?.admissionFeeOverride !== undefined &&
    feeSettings?.admissionFeeOverride !== "";
  const admissionFeeOverride = hasAdmissionOverride
    ? Math.max(0, Number(feeSettings.admissionFeeOverride) || 0)
    : null;

  return {
    transportOpted,
    transportFee: transportOpted ? Math.max(0, Number(feeSettings?.transportFee || 0) || 0) : 0,
    admissionFeeOverride,
    tuitionConcession: normalizeTuitionConcession(feeSettings?.tuitionConcession),
  };
};

export const calculateStudentFeeBreakdown = (classRecord, feeSettings = {}) => {
  const fees = normalizeFeesPayload(classRecord?.fees);
  const normalizedSettings = normalizeStudentFeeSettings(feeSettings);
  const admissionFee =
    normalizedSettings.admissionFeeOverride === null
      ? fees.admission
      : Math.min(normalizedSettings.admissionFeeOverride, fees.admission);
  const tuitionSummary = calculateTuitionConcessionSummary(
    fees.tuition,
    normalizedSettings.tuitionConcession
  );

  return {
    tuition: tuitionSummary.finalTuition,
    originalTuition: tuitionSummary.originalTuition,
    tuitionConcession: tuitionSummary.concessionAmount,
    admission: admissionFee,
    exam: fees.exam,
    transport: normalizedSettings.transportFee,
    books: Number(fees.books || 0),
  };
};

export const calculateFeeBreakdownTotal = (feeBreakdown = {}) =>
  Number(feeBreakdown.tuition || 0) +
  Number(feeBreakdown.admission || 0) +
  Number(feeBreakdown.exam || 0) +
  Number(feeBreakdown.transport || 0) +
  Number(feeBreakdown.books || 0);

const reconcileInstallmentFeeBreakdown = (feeBreakdown = {}, feeInstallments = []) => {
  const installmentsByType = (feeInstallments || []).reduce((groups, installment) => {
    const feeType = trimString(installment?.feeType).toLowerCase();
    if (!feeType) return groups;
    groups[feeType] = [...(groups[feeType] || []), installment];
    return groups;
  }, {});
  const sumField = (installments = [], field = "amount") =>
    installments.reduce((total, installment) => total + Number(installment?.[field] || 0), 0);
  const tuitionInstallments = installmentsByType.tuition || [];

  return {
    ...feeBreakdown,
    tuition: tuitionInstallments.length
      ? sumField(tuitionInstallments)
      : Number(feeBreakdown.tuition || 0),
    originalTuition: tuitionInstallments.length
      ? sumField(tuitionInstallments, "originalAmount")
      : Number(feeBreakdown.originalTuition ?? feeBreakdown.tuition ?? 0),
    tuitionConcession: tuitionInstallments.length
      ? sumField(tuitionInstallments, "concessionAmount")
      : Number(feeBreakdown.tuitionConcession || 0),
    transport: installmentsByType.transport?.length
      ? sumField(installmentsByType.transport)
      : Number(feeBreakdown.transport || 0),
    exam: installmentsByType.exam?.length
      ? sumField(installmentsByType.exam)
      : Number(feeBreakdown.exam || 0),
  };
};

export const getPreviousAcademicYear = (academicYear) => {
  const parsedYear = parseAcademicYear(academicYear);
  if (!parsedYear) {
    return "";
  }

  const previousStartYear = parsedYear.startYear - 1;
  return `${previousStartYear}-${String(parsedYear.startYear).slice(-2)}`;
};

export const getNextAcademicYear = (academicYear) => {
  const parsedYear = parseAcademicYear(academicYear);
  if (!parsedYear) {
    return "";
  }

  const nextStartYear = parsedYear.startYear + 1;
  return `${nextStartYear}-${String(parsedYear.endYear + 1).slice(-2)}`;
};

export const inferClassOrder = (className, existingOrders = new Map()) => {
  const normalizedName = trimString(className).toUpperCase();

  if (!normalizedName) {
    return null;
  }

  if (MASTER_CLASS_ORDER_MAP.has(normalizedName)) {
    return MASTER_CLASS_ORDER_MAP.get(normalizedName);
  }

  const numericMatch = normalizedName.match(/^CLASS\s+(\d{1,2})$/) || normalizedName.match(/^(\d{1,2})$/);
  if (numericMatch) {
    const gradeNumber = Number(numericMatch[1]);
    return gradeNumber + 5;
  }

  const romanMap = new Map([
    ["I", 6],
    ["II", 7],
    ["III", 8],
    ["IV", 9],
    ["V", 10],
    ["VI", 11],
    ["VII", 12],
    ["VIII", 13],
    ["IX", 14],
    ["X", 15],
    ["XI", 16],
    ["XII", 17],
  ]);

  if (romanMap.has(normalizedName)) {
    return romanMap.get(normalizedName);
  }

  const usedOrders = new Set(existingOrders.values());
  let nextOrder = 100;
  while (usedOrders.has(nextOrder)) {
    nextOrder += 1;
  }
  return nextOrder;
};

export const serializeMasterClass = (classRecord) => {
  const record = toObjectIfNeeded(classRecord);
  if (!record) {
    return null;
  }

  return {
    _id: record._id,
    name: trimString(record.name),
    order: Number(record.order),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
};

export const buildClassSessionDisplayName = ({ name, section, academicYear }) => {
  const namePart = trimString(name);
  const sectionPart = normalizeSection(section);
  const academicYearPart = normalizeAcademicYear(academicYear) || trimString(academicYear);

  const titledName = sectionPart ? `${namePart}-${sectionPart}` : namePart;
  return academicYearPart ? `${titledName} (${academicYearPart})` : titledName;
};

export const serializeClassRecord = (classRecord) => {
  const record = toObjectIfNeeded(classRecord);
  if (!record) {
    return null;
  }

  const masterClass =
    record.classId && typeof record.classId === "object" && record.classId.name
      ? serializeMasterClass(record.classId)
      : null;

  const name = masterClass?.name || trimString(record.name);
  const academicYear = normalizeAcademicYear(record.academicYear) || trimString(record.academicYear);
  const section = normalizeSection(record.section);
  const status = normalizeClassSessionStatus(record.status);

  return {
    _id: record._id,
    name,
    order: masterClass?.order ?? null,
    classId: masterClass,
    academicYear,
    section,
    capacity: Number(record.capacity ?? 0),
    classTeacher: record.classTeacher || null,
    fees: normalizeFeesPayload(record.fees),
    status,
    legacyClassId: record.legacyClassId || (!masterClass ? record._id : null),
    source: masterClass ? "session" : "legacy",
    displayName: buildClassSessionDisplayName({ name, section, academicYear }),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
};

export const serializeEnrollment = (enrollmentRecord) => {
  const enrollment = toObjectIfNeeded(enrollmentRecord);
  if (!enrollment) {
    return null;
  }

  const classSession =
    enrollment.classSessionId && typeof enrollment.classSessionId === "object"
      ? serializeClassRecord(enrollment.classSessionId)
      : null;

  const enrollmentAcademicYear =
    normalizeAcademicYear(enrollment.academicYear) ||
    trimString(enrollment.academicYear) ||
    classSession?.academicYear ||
    "";

  return {
    _id: enrollment._id,
    studentId: enrollment.studentId?._id || enrollment.studentId,
    classSessionId: classSession?._id || enrollment.classSessionId,
    classSession,
    academicYear: enrollmentAcademicYear,
    status: trimString(enrollment.status).toLowerCase() || "active",
    isCurrent: Boolean(enrollment.isCurrent),
    createdAt: enrollment.createdAt,
    updatedAt: enrollment.updatedAt,
  };
};

export const getMasterClassById = async (classId) => Class.findById(classId);

export const getClassSessionById = async (classSessionId) =>
  ClassSession.findById(classSessionId).populate(SESSION_POPULATION);

export const getLegacyClassById = async (legacyClassId) =>
  LegacyClass.findById(legacyClassId).populate("classTeacher", "name email phone");

export const resolveClassRecordById = async (classId) => {
  if (!classId) {
    return null;
  }

  const classSession = await getClassSessionById(classId);
  if (classSession) {
    return serializeClassRecord(classSession);
  }

  const legacyClass = await getLegacyClassById(classId);
  return serializeClassRecord(legacyClass);
};

export const loadClassRecordMap = async (classIds = []) => {
  const normalizedIds = [...new Set(classIds.map((classId) => String(classId)).filter(Boolean))];
  const classRecordMap = new Map();

  if (normalizedIds.length === 0) {
    return classRecordMap;
  }

  const classSessions = await ClassSession.find({ _id: { $in: normalizedIds } }).populate(SESSION_POPULATION);
  const foundSessionIds = new Set();

  classSessions.forEach((classSession) => {
    const serializedSession = serializeClassRecord(classSession);
    classRecordMap.set(String(classSession._id), serializedSession);
    foundSessionIds.add(String(classSession._id));
  });

  const legacyIds = normalizedIds.filter((classId) => !foundSessionIds.has(classId));
  if (legacyIds.length > 0) {
    const legacyClasses = await LegacyClass.find({ _id: { $in: legacyIds } }).populate(
      "classTeacher",
      "name email phone"
    );

    legacyClasses.forEach((legacyClass) => {
      classRecordMap.set(String(legacyClass._id), serializeClassRecord(legacyClass));
    });
  }

  return classRecordMap;
};

export const getCurrentEnrollmentMap = async (studentIds = []) => {
  const normalizedStudentIds = [...new Set(studentIds.map((studentId) => String(studentId)).filter(Boolean))];
  const enrollmentMap = new Map();

  if (normalizedStudentIds.length === 0) {
    return enrollmentMap;
  }

  const enrollments = await StudentEnrollment.find({
    studentId: { $in: normalizedStudentIds },
    $or: [{ isCurrent: true }, { isCurrent: { $exists: false } }],
  })
    .sort({ updatedAt: -1 })
    .populate({
      path: "classSessionId",
      populate: SESSION_POPULATION,
    });

  enrollments.forEach((enrollment) => {
    const studentId = String(enrollment.studentId);
    if (!enrollmentMap.has(studentId)) {
      enrollmentMap.set(studentId, serializeEnrollment(enrollment));
    }
  });

  return enrollmentMap;
};

export const attachAcademicContextToStudents = async (students = []) => {
  const normalizedStudents = students.map(toObjectIfNeeded).filter(Boolean);
  const enrollmentMap = await getCurrentEnrollmentMap(normalizedStudents.map((student) => student?._id));

  const classIdsToResolve = normalizedStudents
    .filter((student) => !enrollmentMap.has(String(student?._id)))
    .map((student) => student?.class?._id || student?.class)
    .filter(Boolean);

  const classRecordMap = await loadClassRecordMap(classIdsToResolve);

  return normalizedStudents.map((student) => {
    const currentEnrollment = enrollmentMap.get(String(student._id)) || null;
    const currentClassRecord =
      currentEnrollment?.classSession ||
      classRecordMap.get(String(student.class?._id || student.class)) ||
      null;

    return {
      ...student,
      class: currentClassRecord || student.class,
      classSession: currentClassRecord,
      currentEnrollment,
      section: trimString(student.section) || currentClassRecord?.section || null,
      academicYear: currentEnrollment?.academicYear || currentClassRecord?.academicYear || "",
    };
  });
};

export const attachAcademicContextToFeesRecords = async (feesRecords = []) => {
  const normalizedRecords = feesRecords.map(toObjectIfNeeded);
  const classRecordMap = await loadClassRecordMap(
    normalizedRecords.map((feesRecord) => feesRecord.class?._id || feesRecord.class)
  );

  return normalizedRecords.map((feesRecord) => ({
    ...feesRecord,
    class:
      classRecordMap.get(String(feesRecord.class?._id || feesRecord.class)) || feesRecord.class || null,
  }));
};

export const attachAcademicContextToStudentUniforms = async (studentUniforms = []) => {
  const normalizedRecords = studentUniforms.map(toObjectIfNeeded);
  const classRecordMap = await loadClassRecordMap(
    normalizedRecords.map((uniformRecord) => uniformRecord.class?._id || uniformRecord.class)
  );

  return normalizedRecords.map((uniformRecord) => ({
    ...uniformRecord,
    class:
      classRecordMap.get(String(uniformRecord.class?._id || uniformRecord.class)) ||
      uniformRecord.class ||
      null,
  }));
};

export const resolveFeesStatus = ({ paidAmount, totalFees, dueDate }) => {
  if (paidAmount >= totalFees) {
    return "paid";
  }

  if (paidAmount > 0) {
    return "partial";
  }

  return new Date() > new Date(dueDate) ? "overdue" : "unpaid";
};

export const buildFeesRecordPayloadForStudent = ({
  student,
  classRecord,
  existingFeesRecord = {},
  enrollmentRecord = null,
  isCurrent = true,
} = {}) => {
  const serializedClassSession = serializeClassRecord(classRecord);
  const studentId = student?._id || student?.id || student || existingFeesRecord?.student?._id || existingFeesRecord?.student;
  const enrollmentId = enrollmentRecord?._id || existingFeesRecord?.enrollmentId || null;

  if (!studentId || !serializedClassSession?._id) {
    return null;
  }

  const feeSettings = normalizeStudentFeeSettings({
    ...(existingFeesRecord?.feeSettings || {}),
    ...(student?.feeSettings || {}),
  });
  const calculatedFeeBreakdown = calculateStudentFeeBreakdown(serializedClassSession, feeSettings);
  const feeFrequency = normalizeFeeFrequency();
  const dueDate =
    existingFeesRecord?.dueDate ||
    getAcademicYearEndDate(serializedClassSession.academicYear) ||
    new Date();
  const paymentHistory = Array.isArray(existingFeesRecord?.paymentHistory)
    ? existingFeesRecord.paymentHistory
    : [];
  const feeInstallments = buildFeeInstallments({
    academicYear: serializedClassSession.academicYear,
    feeBreakdown: calculatedFeeBreakdown,
    feeFrequency,
    existingInstallments: existingFeesRecord?.feeInstallments || [],
    paymentHistory,
    tuitionConcession: feeSettings.tuitionConcession,
  });
  const feeBreakdown = reconcileInstallmentFeeBreakdown(calculatedFeeBreakdown, feeInstallments);
  const totalFees = calculateFeeBreakdownTotal(feeBreakdown);
  const paidAmount = Math.min(Number(existingFeesRecord?.paidAmount || 0), totalFees);

  return {
    student: studentId,
    class: serializedClassSession._id,
    classSessionId: serializedClassSession._id,
    enrollmentId,
    academicYear: serializedClassSession.academicYear,
    isCurrent: Boolean(isCurrent),
    totalFees,
    paidAmount,
    dueDate,
    status: resolveFeesStatus({ paidAmount, totalFees, dueDate }),
    feeSettings,
    feeBreakdown,
    feeFrequency,
    feeInstallments,
    paymentHistory,
  };
};

const getQueryWithSession = (query, session) => (session ? query.session(session) : query);

const saveWithSession = (record, session) => record.save(session ? { session } : undefined);

const createOneWithSession = async (Model, payload, session) => {
  if (!session) {
    return Model.create(payload);
  }

  const [createdRecord] = await Model.create([payload], { session });
  return createdRecord;
};

const findFeesRecordForStudentYear = async (studentId, academicYear, { session } = {}) => {
  const normalizedAcademicYear = normalizeAcademicYear(academicYear) || trimString(academicYear);
  if (!studentId || !normalizedAcademicYear) {
    return null;
  }

  return getQueryWithSession(
    Fees.findOne({
      student: studentId,
      academicYear: normalizedAcademicYear,
    }),
    session
  );
};

export const resolveCurrentEnrollmentForStudent = async (studentId, { session } = {}) => {
  if (!studentId) {
    return null;
  }

  return getQueryWithSession(
    StudentEnrollment.findOne({
      studentId,
      $or: [{ isCurrent: true }, { isCurrent: { $exists: false } }],
    })
      .sort({ updatedAt: -1 })
      .populate({
        path: "classSessionId",
        populate: SESSION_POPULATION,
      }),
    session
  );
};

export const createFeesRecordForEnrollment = async (
  { student, enrollment, classSession, existingFeesRecord = null } = {},
  { session } = {}
) => {
  const studentId = student?._id || student?.id || student || enrollment?.studentId;
  const serializedClassSession = serializeClassRecord(classSession || enrollment?.classSessionId);
  const enrollmentId = enrollment?._id || existingFeesRecord?.enrollmentId || null;

  if (!studentId || !enrollmentId || !serializedClassSession?._id) {
    return null;
  }

  const academicYear = normalizeAcademicYear(serializedClassSession.academicYear) || serializedClassSession.academicYear;
  const existingRecord =
    existingFeesRecord ||
    (await findFeesRecordForStudentYear(studentId, academicYear, { session })) ||
    (enrollmentId
      ? await getQueryWithSession(Fees.findOne({ enrollmentId }), session)
      : null);
  const payload = buildFeesRecordPayloadForStudent({
    student,
    classRecord: serializedClassSession,
    existingFeesRecord: existingRecord || {},
    enrollmentRecord: enrollment,
    isCurrent: Boolean(enrollment?.isCurrent),
  });

  if (!payload) {
    return null;
  }

  if (existingRecord) {
    existingRecord.class = payload.class;
    existingRecord.classSessionId = payload.classSessionId;
    existingRecord.enrollmentId = payload.enrollmentId;
    existingRecord.academicYear = payload.academicYear;
    existingRecord.isCurrent = payload.isCurrent;
    existingRecord.totalFees = payload.totalFees;
    existingRecord.paidAmount = payload.paidAmount;
    existingRecord.dueDate = payload.dueDate;
    existingRecord.status = payload.status;
    existingRecord.feeSettings = payload.feeSettings;
    existingRecord.feeBreakdown = payload.feeBreakdown;
    existingRecord.feeInstallments = payload.feeInstallments;
    await saveWithSession(existingRecord, session);
    return existingRecord;
  }

  await getQueryWithSession(
    Fees.updateMany(
      { student: studentId, isCurrent: true },
      { $set: { isCurrent: false } }
    ),
    session
  );

  const { feeFrequency: payloadFeeFrequency, ...persistedPayload } = payload;

  return createOneWithSession(
    Fees,
    {
      ...persistedPayload,
      paidAmount: 0,
      status: resolveFeesStatus({ paidAmount: 0, totalFees: payload.totalFees, dueDate: payload.dueDate }),
      paymentHistory: [],
      feeInstallments: buildFeeInstallments({
        academicYear: payload.academicYear,
        feeBreakdown: payload.feeBreakdown,
        feeFrequency: payloadFeeFrequency,
        existingInstallments: [],
        paymentHistory: [],
        tuitionConcession: payload.feeSettings.tuitionConcession,
      }),
    },
    session
  );
};

export const resolveFeesRecordForStudent = async (
  studentId,
  {
    createIfMissing = false,
    studentSelect =
      "name firstName lastName studentId admissionNo email phone parentName parentPhone parentEmail parent section status feeSettings",
    academicYear = "",
    session = null,
  } = {}
) => {
  const requiredStudentSelect = [...new Set(`${studentSelect} class section feeSettings`.split(/\s+/).filter(Boolean))]
    .join(" ");
  const requestedAcademicYear = normalizeAcademicYear(academicYear) || trimString(academicYear);
  const currentEnrollment = await resolveCurrentEnrollmentForStudent(studentId, { session });
  const resolvedAcademicYear =
    requestedAcademicYear ||
    normalizeAcademicYear(currentEnrollment?.academicYear) ||
    trimString(currentEnrollment?.academicYear);
  let existingFeesRecord =
    (resolvedAcademicYear
      ? await findFeesRecordForStudentYear(studentId, resolvedAcademicYear, { session })
      : null) ||
    (currentEnrollment?._id
      ? await getQueryWithSession(Fees.findOne({ enrollmentId: currentEnrollment._id }), session)
      : null) ||
    await getQueryWithSession(
      Fees.findOne({
        student: studentId,
        $or: [
          { isCurrent: true },
          { isCurrent: { $exists: false } },
          { academicYear: { $exists: false } },
          { academicYear: "" },
        ],
      }),
      session
    );

  if (existingFeesRecord) {
    existingFeesRecord = await existingFeesRecord.populate("student", requiredStudentSelect);
  }

  if (existingFeesRecord) {
    return {
      feesRecord: existingFeesRecord,
      created: false,
      isVirtual: false,
    };
  }

  const studentRecord = await getQueryWithSession(
    Student.findById(studentId).select(requiredStudentSelect).lean(),
    session
  );
  if (!studentRecord) {
    return {
      feesRecord: null,
      created: false,
      isVirtual: false,
      error: { statusCode: 404, message: "Student not found" },
    };
  }

  const [student] = await attachAcademicContextToStudents([studentRecord]);
  const classRecord = currentEnrollment?.classSessionId || student?.classSession || student?.class || null;
  const payload = buildFeesRecordPayloadForStudent({
    student,
    classRecord,
    enrollmentRecord: currentEnrollment,
    isCurrent: currentEnrollment?.isCurrent !== false,
  });

  if (!payload) {
    return {
      feesRecord: null,
      created: false,
      isVirtual: false,
      error: { statusCode: 400, message: "Student is not assigned to a valid class session" },
    };
  }

  if (createIfMissing) {
    const feesRecord =
      currentEnrollment
        ? await createFeesRecordForEnrollment(
            {
              student,
              enrollment: currentEnrollment,
              classSession: currentEnrollment.classSessionId,
            },
            { session }
          )
        : await createOneWithSession(
            Fees,
            (({ feeFrequency: _feeFrequency, ...persistedPayload }) => persistedPayload)(payload),
            session
          );

    await feesRecord.populate("student", requiredStudentSelect);

    return {
      feesRecord,
      created: true,
      isVirtual: false,
    };
  }

  return {
    feesRecord: {
      _id: null,
      isVirtual: true,
      ...payload,
      student,
      class: classRecord,
      createdAt: null,
      updatedAt: null,
    },
    created: false,
    isVirtual: true,
  };
};

export const syncStudentOperationalRecords = async (
  studentId,
  classSessionRecord,
  { studentStatus = "active", createFeesIfMissing = false } = {},
  { session } = {}
) => {
  const serializedClassSession = serializeClassRecord(classSessionRecord);
  if (!studentId || !serializedClassSession?._id) {
    return null;
  }

  const studentRecord = await getQueryWithSession(
    Student.findById(studentId).select("feeSettings").lean(),
    session
  );
  const targetAcademicYear =
    normalizeAcademicYear(serializedClassSession.academicYear) ||
    trimString(serializedClassSession.academicYear);
  const currentEnrollment = await getQueryWithSession(
    StudentEnrollment.findOne({
      studentId,
      academicYear: targetAcademicYear,
    }).populate({
      path: "classSessionId",
      populate: SESSION_POPULATION,
    }),
    session
  );
  const feesRecord =
    (await findFeesRecordForStudentYear(studentId, targetAcademicYear, { session })) ||
    (currentEnrollment?._id
      ? await getQueryWithSession(Fees.findOne({ enrollmentId: currentEnrollment._id }), session)
      : null) ||
    await getQueryWithSession(
      Fees.findOne({
        student: studentId,
        $or: [
          { academicYear: "" },
          { academicYear: { $exists: false } },
        ],
      }),
      session
    );

  if (feesRecord) {
    const feePayload = buildFeesRecordPayloadForStudent({
      student: { _id: studentId, feeSettings: studentRecord?.feeSettings },
      classRecord: serializedClassSession,
      existingFeesRecord: feesRecord,
      enrollmentRecord: currentEnrollment,
      isCurrent: currentEnrollment?.isCurrent !== false,
    });

    if (feePayload) {
      feesRecord.class = feePayload.class;
      feesRecord.classSessionId = feePayload.classSessionId;
      feesRecord.enrollmentId = feePayload.enrollmentId;
      feesRecord.academicYear = feePayload.academicYear;
      feesRecord.isCurrent = feePayload.isCurrent;
      feesRecord.totalFees = feePayload.totalFees;
      feesRecord.paidAmount = feePayload.paidAmount;
      feesRecord.dueDate = feePayload.dueDate;
      feesRecord.status = feePayload.status;
      feesRecord.feeSettings = feePayload.feeSettings;
      feesRecord.feeBreakdown = feePayload.feeBreakdown;
      feesRecord.feeInstallments = feePayload.feeInstallments;
      await saveWithSession(feesRecord, session);
    }
  } else if (createFeesIfMissing && currentEnrollment) {
    await createFeesRecordForEnrollment(
      {
        student: { _id: studentId, feeSettings: studentRecord?.feeSettings },
        enrollment: currentEnrollment,
        classSession: serializedClassSession,
      },
      { session }
    );
  }

  const studentUniform = await getQueryWithSession(StudentUniform.findOne({ student: studentId }), session);
  if (studentUniform) {
    studentUniform.class = serializedClassSession._id;
    await saveWithSession(studentUniform, session);
  } else {
    await createOneWithSession(
      StudentUniform,
      {
        student: studentId,
        class: serializedClassSession._id,
        status: "pending",
        totalUniformsIssued: 0,
        notes: "Uniform not issued yet",
      },
      session
    );
  }

  await getQueryWithSession(
    Student.findByIdAndUpdate(studentId, {
      class: serializedClassSession._id,
      section: serializedClassSession.section || undefined,
      status: studentStatus,
    }),
    session
  );

  return serializedClassSession;
};

export const upsertCurrentEnrollment = async ({
  studentId,
  classSessionId,
  academicYear,
  status = "active",
  isCurrent = true,
}, { session } = {}) => {
  const normalizedAcademicYear = normalizeAcademicYear(academicYear) || trimString(academicYear);

  let enrollment = await getQueryWithSession(
    StudentEnrollment.findOne({
      studentId,
      academicYear: normalizedAcademicYear,
    }),
    session
  );

  if (enrollment) {
    enrollment.classSessionId = classSessionId;
    enrollment.status = status;
    enrollment.isCurrent = Boolean(isCurrent);
    await saveWithSession(enrollment, session);
  } else {
    enrollment = await createOneWithSession(
      StudentEnrollment,
      {
        studentId,
        classSessionId,
        academicYear: normalizedAcademicYear,
        status,
        isCurrent: Boolean(isCurrent),
      },
      session
    );
  }

  await getQueryWithSession(
    StudentEnrollment.updateMany(
      {
        studentId,
        isCurrent: true,
        _id: { $ne: enrollment._id },
      },
      { $set: { isCurrent: false } }
    ),
    session
  );

  return getQueryWithSession(
    StudentEnrollment.findById(enrollment._id).populate({
      path: "classSessionId",
      populate: SESSION_POPULATION,
    }),
    session
  );
};
