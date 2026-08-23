import mongoose from "mongoose";
import Family from "../models/Family.js";
import FamilyAdvance from "../models/FamilyAdvance.js";
import FamilyPayment from "../models/FamilyPayment.js";
import Fees from "../models/Fees.js";
import Student from "../models/Student.js";
import {
  attachAcademicContextToFeesRecords,
  attachAcademicContextToStudents,
  calculateFeeBreakdownTotal,
  calculateStudentFeeBreakdown,
  getPreviousAcademicYear,
  normalizeStudentFeeSettings,
  resolveFeesRecordForStudent,
  resolveFeesStatus,
} from "./academicStructureService.js";
import {
  ACADEMIC_MONTHS,
  DEFAULT_EXAM_FEE_SCHEDULE,
  FEE_FREQUENCY,
  buildFeeInstallments,
  calculateSplitInstallmentAmounts,
  generateAcademicMonths,
  normalizeFeeFrequency,
  normalizeInstallmentFeeType,
  resolveInstallmentStatus,
} from "../utils/feeInstallmentEngine.js";
import {
  normalizeAcademicYear,
  trimString,
} from "../utils/requestValidation.js";
import { buildFamilyKey, ensureStudentFamily } from "./familyIdentityService.js";

const ACTIVE_STUDENT_STATUSES = new Set(["active"]);
const INSTALLMENT_FEE_TYPES = new Set(["tuition", "transport", "exam"]);
const MONTHLY_FEE_TYPES = ["tuition", "transport"];
const NON_INSTALLMENT_FEE_TYPES = ["admission", "books"];
const FEE_TYPE_LABELS = {
  tuition: "Tuition Fee",
  transport: "Transport Fee",
  exam: "Exam Fee",
  admission: "Admission Fee",
  books: "Books Fee",
  previous_year_balance: "Previous Year Balance",
  general: "Family Payment",
};

const toPaise = (amount = 0) => Math.round((Number(amount) || 0) * 100);
const fromPaise = (amountPaise = 0) => Math.round(Number(amountPaise || 0)) / 100;
const toId = (value) => String(value?._id || value || "");
const getQueryWithSession = (query, session) => (session ? query.session(session) : query);
const mapWithConcurrency = async (items = [], limit = 8, mapper) => {
  const results = [];
  const batchSize = Math.max(Number(limit || 1), 1);

  for (let index = 0; index < items.length; index += batchSize) {
    const batch = items.slice(index, index + batchSize);
    results.push(...(await Promise.all(batch.map(mapper))));
  }

  return results;
};

const getStudentName = (student = {}) =>
  trimString(student.name) || `${trimString(student.firstName)} ${trimString(student.lastName)}`.trim() || "Student";

const getClassLabel = (classRecord = {}) => {
  if (!classRecord) return "N/A";
  if (classRecord.displayName) return classRecord.displayName;
  const section = classRecord.section ? `-${classRecord.section}` : "";
  const academicYear = classRecord.academicYear ? ` (${classRecord.academicYear})` : "";
  return `${classRecord.name || classRecord.classId?.name || ""}${section}${academicYear}`.trim() || "N/A";
};

const normalizeMonthKey = (value = "") => trimString(value).toUpperCase();
const getMonthIndex = (monthKey = "") =>
  ACADEMIC_MONTHS.findIndex((month) => month.key === normalizeMonthKey(monthKey));

const getPaymentAcademicMonthIndex = (paymentDate, months = []) => {
  const payment = new Date(paymentDate);
  if (Number.isNaN(payment.getTime())) return 0;

  const exactIndex = months.findIndex((month) => {
    const dueDate = new Date(month.dueDate);
    return dueDate.getFullYear() === payment.getFullYear() && dueDate.getMonth() === payment.getMonth();
  });

  if (exactIndex >= 0) return exactIndex;

  const lastPastIndex = months.reduce((latestIndex, month, index) => {
    const dueDate = new Date(month.dueDate);
    return payment > dueDate ? index : latestIndex;
  }, -1);

  return Math.max(lastPastIndex, 0);
};

const compareUnitsForAllocation = (left, right) => {
  if (left.sourceRecordType !== right.sourceRecordType) {
    return left.sourceRecordType === "previous_year_fees" ? -1 : 1;
  }
  if (left.monthIndex !== right.monthIndex) return left.monthIndex - right.monthIndex;
  return `${left.studentName}-${left.feeType}`.localeCompare(`${right.studentName}-${right.feeType}`);
};

const sortDemandUnitsForAllocation = (units = []) =>
  units.filter((unit) => unit.outstandingPaise > 0).sort(compareUnitsForAllocation);

// Orders every demand unit (across all siblings) chronologically: previous-year balances
// first, then by academic month, then deterministically by student/fee type. Unlike
// sortDemandUnitsForAllocation this does NOT filter on the stale `outstandingPaise`
// snapshot, so it is safe to reuse between the cash and advance allocation passes where
// live outstanding is tracked in unitOutstandingIndex.
const sortUnitsByMonthPriority = (units = []) => [...units].sort(compareUnitsForAllocation);

const getDemandUnitKey = (unit = {}) =>
  [
    toId(unit.studentId),
    toId(unit.feesRecordId),
    unit.sourceRecordType || "",
    normalizeInstallmentFeeType(unit.feeType) || trimString(unit.feeType).toLowerCase(),
    normalizeMonthKey(unit.monthKey),
    normalizeMonthKey(unit.installmentKey),
    toId(unit.previousYearFeesRecord),
  ].join("|");

const isFamilyPaymentHistoryEntry = (payment = {}) =>
  Boolean(payment.familyPaymentId || payment.familyTransactionId) ||
  ["family_payment", "advance_application"].includes(trimString(payment.entryType).toLowerCase());

const getStandalonePaymentHistory = (paymentHistory = []) =>
  (Array.isArray(paymentHistory) ? paymentHistory : []).filter(
    (payment) => !isFamilyPaymentHistoryEntry(payment)
  );

const getFamilyPaymentHistoryTotalPaise = (paymentHistory = []) =>
  (Array.isArray(paymentHistory) ? paymentHistory : [])
    .filter((payment) => isFamilyPaymentHistoryEntry(payment))
    .reduce((total, payment) => total + toPaise(payment?.amount || 0), 0);

const getFamilyPaidAmountForUnit = (familyPaidIndex, unit) =>
  Number((familyPaidIndex?.totalPaidIndex || familyPaidIndex)?.get(getDemandUnitKey(unit)) || 0);

const getIndexedAmountForUnit = (index, unit) =>
  Number(index?.get(getDemandUnitKey(unit)) || 0);

const addIndexedAmountForUnit = (index, unit, amountPaise) => {
  const normalizedAmountPaise = Math.max(Number(amountPaise || 0), 0);
  if (normalizedAmountPaise <= 0) return;

  const unitKey = getDemandUnitKey(unit);
  index.set(unitKey, (index.get(unitKey) || 0) + normalizedAmountPaise);
};

const createFamilyLedgerIndex = () => ({
  totalPaidIndex: new Map(),
  cashPaidIndex: new Map(),
  advanceUsedIndex: new Map(),
  unallocatedPaymentPaise: 0,
  unallocatedAdvancePaise: 0,
  paymentAppliedPaise: 0,
  advanceUsedPaise: 0,
  postedPaymentPaise: 0,
  postedPayments: [],
});

export const resolveMonthlyLedgerStatus = ({
  endingBalancePaise = 0,
  totalDuePaise = 0,
  dueDate = null,
  hasActivity = false,
  asOfDate = new Date(),
} = {}) => {
  const balancePaise = Math.max(Number(endingBalancePaise || 0), 0);
  const duePaise = Math.max(Number(totalDuePaise || 0), 0);
  const parsedDueDate = dueDate ? new Date(dueDate) : null;
  const parsedAsOfDate = new Date(asOfDate);
  const isPastDue =
    balancePaise > 0 &&
    parsedDueDate &&
    !Number.isNaN(parsedDueDate.getTime()) &&
    !Number.isNaN(parsedAsOfDate.getTime()) &&
    parsedAsOfDate > parsedDueDate;

  if (balancePaise <= 0 && duePaise > 0) return "paid";
  if (isPastDue) return "overdue";
  if (hasActivity) return "partial";
  return "pending";
};

const generateFamilyTransactionId = () =>
  `FTXN-${Date.now()}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;

const generateStudentTransactionId = (familyTransactionId, studentId, index) =>
  `${familyTransactionId}-S${String(studentId).slice(-6).toUpperCase()}-${index}`;

const calculatePaidBreakdown = (feeBreakdown = {}, paymentHistory = [], totalPaidAmount = 0) => {
  const paidBreakdown = {
    tuition: 0,
    transport: 0,
    exam: 0,
    admission: 0,
    books: 0,
  };
  let genericPaidAmount = 0;
  let historyPaidAmount = 0;

  paymentHistory.forEach((payment) => {
    const amount = Number(payment?.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) return;

    historyPaidAmount += amount;
    const feeType = trimString(payment?.feeType).toLowerCase();
    if (Object.prototype.hasOwnProperty.call(paidBreakdown, feeType)) {
      paidBreakdown[feeType] += amount;
    } else {
      genericPaidAmount += amount;
    }
  });

  genericPaidAmount += Math.max(Number(totalPaidAmount || 0) - historyPaidAmount, 0);

  ["tuition", "transport", "exam", "admission", "books"].forEach((feeType) => {
    const feeAmount = Math.max(Number(feeBreakdown?.[feeType] || 0), 0);
    paidBreakdown[feeType] = Math.min(paidBreakdown[feeType], feeAmount);
    const remaining = Math.max(feeAmount - paidBreakdown[feeType], 0);
    const genericAllocation = Math.min(remaining, genericPaidAmount);
    paidBreakdown[feeType] += genericAllocation;
    genericPaidAmount -= genericAllocation;
  });

  return paidBreakdown;
};

const getInstallmentKey = (installment = {}) =>
  trimString(installment.installmentKey || installment.monthKey || installment.dueMonth).toUpperCase();

const getExistingInstallmentMap = (installments = [], feeType) => {
  const map = new Map();
  installments
    .filter((installment) => normalizeInstallmentFeeType(installment.feeType) === feeType)
    .forEach((installment) => {
      const installmentKey = getInstallmentKey(installment);
      if (installmentKey) {
        map.set(installmentKey, installment);
      }
    });
  return map;
};

const getInstallmentAllocationKey = (feeType, installment = {}) => {
  const normalizedFeeType =
    normalizeInstallmentFeeType(installment?.feeType) ||
    normalizeInstallmentFeeType(feeType);
  const installmentKey = getInstallmentKey(installment);
  return normalizedFeeType && installmentKey
    ? `${normalizedFeeType}:${installmentKey}`
    : "";
};

const buildFamilyInstallmentPaidIndex = (paymentHistory = []) => {
  const index = new Map();

  (Array.isArray(paymentHistory) ? paymentHistory : [])
    .filter((payment) => isFamilyPaymentHistoryEntry(payment))
    .forEach((payment) => {
      (Array.isArray(payment?.installments) ? payment.installments : []).forEach((installment) => {
        const allocationKey = getInstallmentAllocationKey(payment?.feeType, installment);
        const amountPaise = toPaise(installment?.paidAmount || 0);
        if (!allocationKey || amountPaise <= 0) return;
        index.set(allocationKey, (index.get(allocationKey) || 0) + amountPaise);
      });
    });

  return index;
};

const getPersistedStandaloneInstallmentPaidPaise = ({
  installment,
  feeType,
  familyInstallmentPaidIndex,
} = {}) => {
  const persistedPaidPaise = toPaise(installment?.paidAmount || 0);
  const allocationKey = getInstallmentAllocationKey(feeType, installment);
  const familyPaidPaise = allocationKey
    ? Number(familyInstallmentPaidIndex?.get(allocationKey) || 0)
    : 0;
  return Math.max(persistedPaidPaise - familyPaidPaise, 0);
};

export const calculateStandaloneInstallmentPaidAmount = ({
  installment,
  feeType,
  paymentHistory = [],
} = {}) =>
  fromPaise(
    getPersistedStandaloneInstallmentPaidPaise({
      installment,
      feeType,
      familyInstallmentPaidIndex: buildFamilyInstallmentPaidIndex(paymentHistory),
    })
  );

const addDemandUnit = (units, payload) => {
  const amountPaise = Math.max(Number(payload.amountPaise || 0), 0);
  const paidPaise = Math.min(amountPaise, Math.max(Number(payload.paidPaise || 0), 0));
  if (amountPaise <= 0) return;

  units.push({
    ...payload,
    amount: fromPaise(amountPaise),
    paidAmount: fromPaise(paidPaise),
    outstanding: fromPaise(Math.max(amountPaise - paidPaise, 0)),
    amountPaise,
    paidPaise,
    outstandingPaise: Math.max(amountPaise - paidPaise, 0),
  });
};

const addDemandUnitWithFamilyPaid = (units, payload, familyPaidIndex) => {
  const familyPaidPaise = getFamilyPaidAmountForUnit(familyPaidIndex, payload);
  addDemandUnit(units, {
    ...payload,
    paidPaise: Number(payload.paidPaise || 0) + familyPaidPaise,
  });
};

const createMonthlyDemandUnits = ({
  units,
  feeType,
  totalAmount,
  months,
  sibling,
  feesRecord,
  paidBreakdown,
  installments = [],
  familyPaidIndex,
  familyInstallmentPaidIndex,
}) => {
  const amounts = calculateSplitInstallmentAmounts(totalAmount, 12);
  const installmentMap = getExistingInstallmentMap(installments, feeType);
  let paidToAllocatePaise = toPaise(paidBreakdown[feeType] || 0);

  months.forEach((month, index) => {
    const existingInstallment = installmentMap.get(month.key);
    const amountPaise = toPaise(existingInstallment?.amount ?? amounts[index] ?? 0);
    const paidPaise = installmentMap.size > 0
      ? getPersistedStandaloneInstallmentPaidPaise({
          installment: existingInstallment,
          feeType,
          familyInstallmentPaidIndex,
        })
      : Math.min(amountPaise, paidToAllocatePaise);
    if (installmentMap.size === 0) {
      paidToAllocatePaise = Math.max(paidToAllocatePaise - paidPaise, 0);
    }

    addDemandUnitWithFamilyPaid(units, {
      sourceRecordType: "current_fees",
      targetAcademicYear: feesRecord.academicYear,
      studentId: sibling._id,
      studentName: getStudentName(sibling),
      classLabel: getClassLabel(sibling.class || feesRecord.class),
      feesRecord,
      feesRecordId: feesRecord._id,
      feeType,
      feeLabel: FEE_TYPE_LABELS[feeType],
      monthKey: month.key,
      monthLabel: month.label,
      monthIndex: month.index,
      dueDate: month.dueDate,
      installmentKey: month.key,
      installmentLabel: month.label,
      isInstallmentBacked: true,
      amountPaise,
      paidPaise,
      originalAmount:
        Number(existingInstallment?.originalAmount || 0) > 0
          ? Number(existingInstallment.originalAmount)
          : Number(existingInstallment?.amount ?? amounts[index] ?? 0),
      concessionType: existingInstallment?.concessionType || "none",
      concessionValue: Number(existingInstallment?.concessionValue || 0),
      concessionAmount: Number(existingInstallment?.concessionAmount || 0),
      concessionReason: existingInstallment?.concessionReason || "",
    }, familyPaidIndex);
  });
};

const createScheduledExamDemandUnits = ({
  units,
  totalAmount,
  months,
  sibling,
  feesRecord,
  paidBreakdown,
  installments = [],
  familyPaidIndex,
  familyInstallmentPaidIndex,
}) => {
  const schedule = DEFAULT_EXAM_FEE_SCHEDULE;
  const amounts = calculateSplitInstallmentAmounts(totalAmount, schedule.length || 1);
  const installmentMap = getExistingInstallmentMap(installments, "exam");
  let paidToAllocatePaise = toPaise(paidBreakdown.exam || 0);

  schedule.forEach((term, index) => {
    const month = months.find((candidate) => candidate.key === term.dueMonth);
    if (!month) return;

    const amountPaise = toPaise(amounts[index] || 0);
    const existingInstallment = installmentMap.get(term.key);
    const paidPaise = installmentMap.size > 0
      ? getPersistedStandaloneInstallmentPaidPaise({
          installment: existingInstallment,
          feeType: "exam",
          familyInstallmentPaidIndex,
        })
      : Math.min(amountPaise, paidToAllocatePaise);
    if (installmentMap.size === 0) {
      paidToAllocatePaise = Math.max(paidToAllocatePaise - paidPaise, 0);
    }

    addDemandUnitWithFamilyPaid(units, {
      sourceRecordType: "current_fees",
      targetAcademicYear: feesRecord.academicYear,
      studentId: sibling._id,
      studentName: getStudentName(sibling),
      classLabel: getClassLabel(sibling.class || feesRecord.class),
      feesRecord,
      feesRecordId: feesRecord._id,
      feeType: "exam",
      feeLabel: FEE_TYPE_LABELS.exam,
      monthKey: month.key,
      monthLabel: month.label,
      monthIndex: month.index,
      dueDate: month.dueDate,
      installmentKey: term.key,
      installmentLabel: term.label,
      isInstallmentBacked: true,
      amountPaise,
      paidPaise,
    }, familyPaidIndex);
  });
};

const createSingleMonthDemandUnit = ({
  units,
  feeType,
  totalAmount,
  month,
  sibling,
  feesRecord,
  paidAmount = 0,
  familyPaidIndex,
}) => {
  addDemandUnitWithFamilyPaid(units, {
    sourceRecordType: "current_fees",
    targetAcademicYear: feesRecord.academicYear,
    studentId: sibling._id,
    studentName: getStudentName(sibling),
    classLabel: getClassLabel(sibling.class || feesRecord.class),
    feesRecord,
    feesRecordId: feesRecord._id,
    feeType,
    feeLabel: FEE_TYPE_LABELS[feeType] || "Fees",
    monthKey: month.key,
    monthLabel: month.label,
    monthIndex: month.index,
    dueDate: month.dueDate,
    installmentKey: "",
    installmentLabel: "",
    isInstallmentBacked: false,
    amountPaise: toPaise(totalAmount),
    paidPaise: toPaise(paidAmount),
  }, familyPaidIndex);
};
const getEffectiveFeeData = (feesRecord = {}) => {
  const feeSettings = normalizeStudentFeeSettings({
    ...(feesRecord.student?.feeSettings || {}),
    ...(feesRecord.feeSettings || {}),
  });
  const calculatedFeeBreakdown = calculateStudentFeeBreakdown(feesRecord.class, feeSettings);
  const recordedFeeBreakdown = feesRecord.feeBreakdown || {};
  const hasInstallmentSnapshot = Array.isArray(feesRecord.feeInstallments) && feesRecord.feeInstallments.length > 0;
  const feeBreakdown =
    hasInstallmentSnapshot && calculateFeeBreakdownTotal(recordedFeeBreakdown) > 0
      ? recordedFeeBreakdown
      : calculateFeeBreakdownTotal(calculatedFeeBreakdown) > 0
      ? calculatedFeeBreakdown
      : recordedFeeBreakdown || calculatedFeeBreakdown;
  const feeFrequency = normalizeFeeFrequency();

  return { feeSettings, feeBreakdown, feeFrequency };
};

const buildCurrentYearDemandUnitsForStudent = ({ sibling, feesRecord, months, familyPaidIndex }) => {
  const units = [];
  const { feeSettings, feeBreakdown, feeFrequency } = getEffectiveFeeData(feesRecord);
  const standalonePaymentHistory = getStandalonePaymentHistory(feesRecord.paymentHistory || []);
  const standaloneHistoryPaidPaise = standalonePaymentHistory.reduce(
    (total, payment) => total + toPaise(payment?.amount || 0),
    0
  );
  const familyHistoryPaidPaise = getFamilyPaymentHistoryTotalPaise(feesRecord.paymentHistory || []);
  const familyPaidPaise = getFamilyPaidAmountForFeesRecord(familyPaidIndex, feesRecord._id);
  const untrackedPaidAmount = fromPaise(
    Math.max(
      toPaise(feesRecord.paidAmount || 0) -
        standaloneHistoryPaidPaise -
        familyHistoryPaidPaise -
        familyPaidPaise,
      0
    )
  );
  const persistedInstallments =
    Array.isArray(feesRecord.feeInstallments) && feesRecord.feeInstallments.length > 0
      ? feesRecord.feeInstallments
      : [];
  const familyInstallmentPaidIndex =
    persistedInstallments.length > 0
      ? buildFamilyInstallmentPaidIndex(feesRecord.paymentHistory || [])
      : new Map();
  const demandInstallments =
    persistedInstallments.length > 0
      ? persistedInstallments
      : buildFeeInstallments({
          academicYear: feesRecord.academicYear,
          feeBreakdown,
          feeFrequency,
          existingInstallments: [],
          paymentHistory: standalonePaymentHistory,
          tuitionConcession: feeSettings.tuitionConcession,
        });
  feesRecord.feeSettings = feeSettings;
  feesRecord.feeBreakdown = feeBreakdown;
  feesRecord.totalFees = calculateFeeBreakdownTotal(feeBreakdown);
  const paidBreakdown = calculatePaidBreakdown(
    feeBreakdown,
    standalonePaymentHistory,
    fromPaise(standaloneHistoryPaidPaise) + untrackedPaidAmount
  );

  MONTHLY_FEE_TYPES.forEach((feeType) => {
    const totalAmount = Number(feeBreakdown[feeType] || 0);
    if (totalAmount <= 0) return;

    if (feeFrequency[feeType] === FEE_FREQUENCY.YEARLY) {
      createSingleMonthDemandUnit({
        units,
        feeType,
        totalAmount,
        month: months[0],
        sibling,
        feesRecord,
        paidAmount: paidBreakdown[feeType] || 0,
        familyPaidIndex,
      });
      return;
    }

    createMonthlyDemandUnits({
      units,
      feeType,
      totalAmount,
      months,
      sibling,
      feesRecord,
      paidBreakdown,
      installments: demandInstallments,
      familyPaidIndex,
      familyInstallmentPaidIndex,
    });
  });

  const examTotal = Number(feeBreakdown.exam || 0);
  if (examTotal > 0) {
    if (feeFrequency.exam === FEE_FREQUENCY.YEARLY) {
      createSingleMonthDemandUnit({
        units,
        feeType: "exam",
        totalAmount: examTotal,
        month: months[0],
        sibling,
        feesRecord,
        paidAmount: paidBreakdown.exam || 0,
        familyPaidIndex,
      });
    } else {
      createScheduledExamDemandUnits({
        units,
        totalAmount: examTotal,
        months,
        sibling,
        feesRecord,
        paidBreakdown,
        installments: demandInstallments,
        familyPaidIndex,
        familyInstallmentPaidIndex,
      });
    }
  }

  NON_INSTALLMENT_FEE_TYPES.forEach((feeType) => {
    const totalAmount = Number(feeBreakdown[feeType] || 0);
    if (totalAmount <= 0) return;
    createSingleMonthDemandUnit({
      units,
      feeType,
      totalAmount,
      month: months[0],
      sibling,
      feesRecord,
      paidAmount: paidBreakdown[feeType] || 0,
      familyPaidIndex,
    });
  });

  return units;
};

const buildPreviousYearDemandUnits = async ({
  siblings,
  academicYear,
  months,
  session,
  familyPaidIndex,
}) => {
  const previousAcademicYear = getPreviousAcademicYear(academicYear);
  if (!previousAcademicYear) return [];

  // Fetch every sibling's previous-year fees record concurrently (read-only) to avoid
  // one sequential query per sibling. Outside a transaction we parallelize; inside a
  // session we keep it sequential to avoid concurrent ops on the same session.
  const fetchPreviousRecord = (sibling) =>
    getQueryWithSession(
      Fees.findOne({ student: sibling._id, academicYear: previousAcademicYear }),
      session
    );

  let previousRecords;
  if (session) {
    previousRecords = [];
    for (const sibling of siblings) {
      previousRecords.push(await fetchPreviousRecord(sibling));
    }
  } else {
    previousRecords = await Promise.all(siblings.map(fetchPreviousRecord));
  }

  const units = [];
  siblings.forEach((sibling, index) => {
    const previousFeesRecord = previousRecords[index];
    if (!previousFeesRecord) return;

    const totalFeesPaise = toPaise(previousFeesRecord.totalFees || 0);
    const standalonePaymentHistory = getStandalonePaymentHistory(previousFeesRecord.paymentHistory || []);
    const standaloneHistoryPaidPaise = standalonePaymentHistory.reduce(
      (total, payment) => total + toPaise(payment?.amount || 0),
      0
    );
    const familyHistoryPaidPaise = getFamilyPaymentHistoryTotalPaise(previousFeesRecord.paymentHistory || []);
    const familyPaidPaise = getFamilyPaidAmountForFeesRecord(familyPaidIndex, previousFeesRecord._id);
    const untrackedPaidPaise = Math.max(
      toPaise(previousFeesRecord.paidAmount || 0) -
        standaloneHistoryPaidPaise -
        familyHistoryPaidPaise -
        familyPaidPaise,
      0
    );
    const outstandingPaise = Math.max(
      totalFeesPaise - standaloneHistoryPaidPaise - untrackedPaidPaise - familyPaidPaise,
      0
    );
    const outstanding = fromPaise(outstandingPaise);
    if (outstanding <= 0) return;

    addDemandUnit(units, {
      sourceRecordType: "previous_year_fees",
      targetAcademicYear: previousAcademicYear,
      studentId: sibling._id,
      studentName: getStudentName(sibling),
      classLabel: getClassLabel(sibling.class),
      feesRecord: previousFeesRecord,
      feesRecordId: previousFeesRecord._id,
      feeType: "previous_year_balance",
      feeLabel: FEE_TYPE_LABELS.previous_year_balance,
      monthKey: months[0].key,
      monthLabel: months[0].label,
      monthIndex: 0,
      dueDate: months[0].dueDate,
      installmentKey: "",
      installmentLabel: "",
      isInstallmentBacked: false,
      amountPaise: toPaise(outstanding),
      paidPaise: 0,
      previousYearFeesRecord: previousFeesRecord._id,
    });
  });

  return units;
};

const normalizeFeesRecord = async (feesRecord, isVirtual = false) => {
  if (isVirtual) {
    return feesRecord;
  }
  const [record] = await attachAcademicContextToFeesRecords([feesRecord]);
  return record;
};

export const resolveFamilyContext = async ({
  familyId,
  academicYear = "",
  createMissingFees = false,
  session = null,
} = {}) => {
  const family = await getQueryWithSession(Family.findById(familyId), session);
  if (!family || family.status === "merged") {
    return { error: { statusCode: 404, message: "Family not found" } };
  }

  const rawStudents = await getQueryWithSession(
    Student.find({ familyId: family._id }).sort({ firstName: 1, lastName: 1 }),
    session
  );
  const studentsNeedingFamily = rawStudents.filter((student) => !student.familyId);
  for (const student of studentsNeedingFamily) {
    await ensureStudentFamily(student._id, { session });
  }

  const students = await attachAcademicContextToStudents(rawStudents);
  const requestedAcademicYear = normalizeAcademicYear(academicYear) || trimString(academicYear);
  const activeYears = [
    ...new Set(
      students
        .filter((student) => ACTIVE_STUDENT_STATUSES.has(trimString(student.status).toLowerCase()))
        .map((student) => normalizeAcademicYear(student.academicYear) || trimString(student.academicYear))
        .filter(Boolean)
    ),
  ];
  const resolvedAcademicYear = requestedAcademicYear || activeYears[0] || "";

  if (!resolvedAcademicYear) {
    return { error: { statusCode: 400, message: "Academic year is required for this family" } };
  }

  const siblings = students.filter((student) => {
    const status = trimString(student.status).toLowerCase();
    const studentAcademicYear = normalizeAcademicYear(student.academicYear) || trimString(student.academicYear);
    return ACTIVE_STUDENT_STATUSES.has(status) && studentAcademicYear === resolvedAcademicYear;
  });

  if (siblings.length === 0) {
    return {
      family,
      academicYear: resolvedAcademicYear,
      siblings: [],
      feeRecords: [],
      error: { statusCode: 404, message: "No active students found for this family and academic year" },
    };
  }

  const feeRecords = [];
  // When not creating missing records (the read-only page-load path), resolve every
  // sibling's fees record concurrently to avoid N sequential DB round-trips. When
  // createMissingFees is true we run inside a Mongo transaction/session, so keep those
  // resolutions sequential to avoid concurrent operations on the same session.
  const resolveSibling = async (sibling) => {
    const result = await resolveFeesRecordForStudent(sibling._id, {
      createIfMissing: createMissingFees,
      academicYear: resolvedAcademicYear,
      session,
    });

    if (result.error || !result.feesRecord) {
      return { error: result.error || { statusCode: 400, message: "Unable to resolve fees record" } };
    }

    const normalizedRecord = createMissingFees
      ? result.feesRecord
      : await normalizeFeesRecord(result.feesRecord, result.isVirtual);
    return {
      studentId: sibling._id,
      sibling,
      feesRecord: normalizedRecord,
      isVirtual: result.isVirtual,
    };
  };

  if (createMissingFees || session) {
    for (const sibling of siblings) {
      const entry = await resolveSibling(sibling);
      if (entry.error) {
        return { error: entry.error };
      }
      feeRecords.push(entry);
    }
  } else {
    const resolvedEntries = await Promise.all(siblings.map(resolveSibling));
    const failed = resolvedEntries.find((entry) => entry.error);
    if (failed) {
      return { error: failed.error };
    }
    feeRecords.push(...resolvedEntries);
  }

  return {
    family,
    academicYear: resolvedAcademicYear,
    siblings,
    feeRecords,
  };
};

const buildFamilyDemand = async ({ context, session, familyPaidIndex }) => {
  const months = generateAcademicMonths(context.academicYear);
  const currentUnits = context.feeRecords.flatMap(({ sibling, feesRecord }) =>
    buildCurrentYearDemandUnitsForStudent({ sibling, feesRecord, months, familyPaidIndex })
  );
  const previousUnits = await buildPreviousYearDemandUnits({
    siblings: context.siblings,
    academicYear: context.academicYear,
    months,
    session,
    familyPaidIndex,
  });

  return {
    months,
    units: [...previousUnits, ...currentUnits],
  };
};

const getAdvanceBalance = async ({ familyId, academicYear, session }) => {
  const advance = await getQueryWithSession(
    FamilyAdvance.findOne({ familyId, academicYear }),
    session
  );
  return advance || null;
};

const getPostedFamilyPayments = async ({ familyId, academicYear, session }) =>
  getQueryWithSession(
    FamilyPayment.find({ familyId, academicYear, status: "posted" }).sort({
      paymentDate: 1,
      createdAt: 1,
      _id: 1,
    }),
    session
  );

const getOutstandingUnitsForLedger = ({ units = [], ledgerIndex }) =>
  units.map((unit) => {
    const ledgerPaidPaise = getIndexedAmountForUnit(ledgerIndex.totalPaidIndex, unit);
    const outstandingPaise = Math.max(unit.amountPaise - unit.paidPaise - ledgerPaidPaise, 0);
    return {
      ...unit,
      outstanding: fromPaise(outstandingPaise),
      outstandingPaise,
    };
  });

const shouldApplyAdvance = ({ payment, useAdvance = false, amountPaise = 0 } = {}) =>
  Boolean(useAdvance || payment?.usedAdvanceExplicitly || amountPaise <= 0);

const allocateLedgerAmountByStudentShare = ({
  units = [],
  amountPaise = 0,
  ledgerIndex,
  sourceIndex,
}) => {
  const outstandingUnits = normalizeOutstandingUnits(
    getOutstandingUnitsForLedger({ units, ledgerIndex })
  );
  if (outstandingUnits.length === 0) {
    return { allocations: [], unallocatedPaise: Math.max(Number(amountPaise || 0), 0) };
  }

  const allStudentOrder = getStudentOrder(groupUnitsByStudent(units));
  const unitsByStudent = groupUnitsByStudent(outstandingUnits);
  unitsByStudent.forEach((entry) => {
    entry.units = sortDemandUnitsForAllocation(entry.units);
  });

  const unitOutstandingIndex = buildUnitOutstandingIndex(outstandingUnits);
  const studentOutstandingIndex = buildStudentOutstandingIndex(unitsByStudent, unitOutstandingIndex);
  const allocation = allocateByStudentShare({
    unitsByStudent,
    studentOrder: allStudentOrder,
    amountPaise,
    unitOutstandingIndex,
    studentOutstandingIndex,
  });

  allocation.allocations.forEach((item) => {
    addIndexedAmountForUnit(ledgerIndex.totalPaidIndex, item.unit, item.amountPaise);
    addIndexedAmountForUnit(sourceIndex, item.unit, item.amountPaise);
  });

  return allocation;
};

const getDemandUnitKeyForSavedAllocation = (allocation = {}) =>
  getDemandUnitKey({
    studentId: allocation.student,
    feesRecordId: allocation.feesRecord,
    sourceRecordType:
      allocation.previousYearFeesRecord || allocation.source === "previous_year_balance"
        ? "previous_year_fees"
        : "current_fees",
    feeType: allocation.feeType,
    monthKey: allocation.monthKey,
    installmentKey: allocation.installmentKey,
    previousYearFeesRecord: allocation.previousYearFeesRecord,
  });

const applySavedFamilyPaymentAllocations = ({
  payment,
  demandUnitIndex,
  ledgerIndex,
  cashBudgetPaise = 0,
  advanceBudgetPaise = 0,
}) => {
  let remainingCashPaise = Math.max(Number(cashBudgetPaise || 0), 0);
  let remainingAdvancePaise = Math.max(Number(advanceBudgetPaise || 0), 0);
  let cashAppliedPaise = 0;
  let advanceAppliedPaise = 0;

  (Array.isArray(payment?.allocations) ? payment.allocations : []).forEach((allocation) => {
    const isAdvanceAllocation = allocation.source === "advance_application";
    const remainingBudgetPaise = isAdvanceAllocation
      ? remainingAdvancePaise
      : remainingCashPaise;
    if (remainingBudgetPaise <= 0) return;

    const unit = demandUnitIndex.get(getDemandUnitKeyForSavedAllocation(allocation));
    if (!unit) return;

    const alreadyPaidPaise = getIndexedAmountForUnit(ledgerIndex.totalPaidIndex, unit);
    const outstandingPaise = Math.max(unit.amountPaise - unit.paidPaise - alreadyPaidPaise, 0);
    const appliedPaise = Math.min(
      toPaise(allocation.amount || 0),
      outstandingPaise,
      remainingBudgetPaise
    );
    if (appliedPaise <= 0) return;

    addIndexedAmountForUnit(ledgerIndex.totalPaidIndex, unit, appliedPaise);
    addIndexedAmountForUnit(
      isAdvanceAllocation ? ledgerIndex.advanceUsedIndex : ledgerIndex.cashPaidIndex,
      unit,
      appliedPaise
    );

    if (isAdvanceAllocation) {
      remainingAdvancePaise -= appliedPaise;
      advanceAppliedPaise += appliedPaise;
    } else {
      remainingCashPaise -= appliedPaise;
      cashAppliedPaise += appliedPaise;
    }
  });

  return {
    cashAppliedPaise,
    advanceAppliedPaise,
    remainingCashPaise,
    remainingAdvancePaise,
  };
};

const buildFamilyPaidAllocationIndex = async ({
  familyId,
  academicYear,
  session,
  demand,
} = {}) => {
  const ledgerIndex = createFamilyLedgerIndex();
  const payments = await getPostedFamilyPayments({ familyId, academicYear, session });
  ledgerIndex.postedPayments = payments;

  if (!demand?.units?.length) {
    return ledgerIndex;
  }

  const demandUnitIndex = new Map(
    demand.units.map((unit) => [getDemandUnitKey(unit), unit])
  );

  payments.forEach((payment) => {
    const collectedPaise = toPaise(payment.amountCollected || 0);
    const cashAvailablePaise = Math.max(
      collectedPaise - toPaise(payment.advanceCreated || 0),
      0
    );
    const advancePaise = toPaise(payment.advanceApplied || 0);
    ledgerIndex.postedPaymentPaise += collectedPaise;

    const savedAllocation = applySavedFamilyPaymentAllocations({
      payment,
      demandUnitIndex,
      ledgerIndex,
      cashBudgetPaise: cashAvailablePaise,
      advanceBudgetPaise: advancePaise,
    });

    const paymentAllocation = allocateLedgerAmountByStudentShare({
      units: demand.units,
      amountPaise: savedAllocation.remainingCashPaise,
      ledgerIndex,
      sourceIndex: ledgerIndex.cashPaidIndex,
    });
    ledgerIndex.paymentAppliedPaise +=
      savedAllocation.cashAppliedPaise +
      savedAllocation.remainingCashPaise -
      paymentAllocation.unallocatedPaise;
    ledgerIndex.unallocatedPaymentPaise += paymentAllocation.unallocatedPaise;

    const advanceAllocation = allocateLedgerAmountByStudentShare({
      units: demand.units,
      amountPaise: savedAllocation.remainingAdvancePaise,
      ledgerIndex,
      sourceIndex: ledgerIndex.advanceUsedIndex,
    });
    ledgerIndex.advanceUsedPaise +=
      savedAllocation.advanceAppliedPaise +
      savedAllocation.remainingAdvancePaise -
      advanceAllocation.unallocatedPaise;
    ledgerIndex.unallocatedAdvancePaise += advanceAllocation.unallocatedPaise;
  });

  return ledgerIndex;
};

const getFamilyPaidAmountForFeesRecord = (familyPaidIndex, feesRecordId) => {
  const recordId = toId(feesRecordId);
  if (!recordId) return 0;

  let totalPaise = 0;
  const paidIndex = familyPaidIndex?.totalPaidIndex || familyPaidIndex;
  paidIndex?.forEach((amountPaise, allocationKey) => {
    const [, allocationFeesRecordId] = String(allocationKey).split("|");
    if (allocationFeesRecordId === recordId) {
      totalPaise += Number(amountPaise || 0);
    }
  });

  return totalPaise;
};

const getStandaloneCollectedPaise = (feesRecord, familyPaidIndex) => {
  const standalonePaymentHistory = getStandalonePaymentHistory(feesRecord?.paymentHistory || []);
  const standaloneHistoryPaidPaise = standalonePaymentHistory.reduce(
    (total, payment) => total + toPaise(payment?.amount || 0),
    0
  );
  const familyHistoryPaidPaise = getFamilyPaymentHistoryTotalPaise(feesRecord?.paymentHistory || []);
  const familyPaidPaise = getFamilyPaidAmountForFeesRecord(familyPaidIndex, feesRecord?._id);
  const untrackedPaidPaise = Math.max(
    toPaise(feesRecord?.paidAmount || 0) -
      standaloneHistoryPaidPaise -
      familyHistoryPaidPaise -
      familyPaidPaise,
    0
  );

  return standaloneHistoryPaidPaise + untrackedPaidPaise;
};

const sumLedgerIndexByStudent = (ledgerIndex) => {
  const perStudent = new Map();
  ledgerIndex?.forEach((amountPaise, allocationKey) => {
    const studentId = String(allocationKey).split("|")[0];
    if (!studentId) return;
    perStudent.set(studentId, (perStudent.get(studentId) || 0) + Number(amountPaise || 0));
  });
  return perStudent;
};

const buildStudentCollectionShareIndex = ({ context, familyPaidIndex }) => {
  const index = new Map(context.siblings.map((sibling) => [toId(sibling._id), 0]));

  context.feeRecords.forEach(({ sibling, feesRecord }) => {
    addStudentSharePaise(index, sibling._id, getStandaloneCollectedPaise(feesRecord, familyPaidIndex));
  });

  // Attribute family cash payments to each child using the ACTUAL month-priority
  // allocation ledger (cashPaidIndex) rather than an equal cash split, so each sibling's
  // collected amount lines up with the months that were genuinely paid for them.
  sumLedgerIndexByStudent(familyPaidIndex.cashPaidIndex).forEach((sharePaise, studentId) =>
    addStudentSharePaise(index, studentId, sharePaise)
  );

  return index;
};

const settleStudentCollectionShares = ({ shareIndex, studentLedgerMap, siblings }) => {
  const settledIndex = new Map(shareIndex);
  let excessPaise = 0;

  getSiblingShareOrder(siblings).forEach((sibling) => {
    const studentId = toId(sibling._id);
    const studentLedger = studentLedgerMap.get(studentId) || {};
    const duePaise = studentLedger.duePaise || 0;
    const cashCapacityPaise = Math.max(duePaise - (studentLedger.advancePaise || 0), 0);
    const sharePaise = settledIndex.get(studentId) || 0;
    if (sharePaise <= cashCapacityPaise) return;

    excessPaise += sharePaise - cashCapacityPaise;
    settledIndex.set(studentId, cashCapacityPaise);
  });

  if (excessPaise <= 0) return settledIndex;

  getSiblingShareOrder(siblings).forEach((sibling) => {
    if (excessPaise <= 0) return;

    const studentId = toId(sibling._id);
    const studentLedger = studentLedgerMap.get(studentId) || {};
    const duePaise = studentLedger.duePaise || 0;
    const cashCapacityPaise = Math.max(duePaise - (studentLedger.advancePaise || 0), 0);
    const currentSharePaise = settledIndex.get(studentId) || 0;
    const pendingPaise = Math.max(cashCapacityPaise - currentSharePaise, 0);
    const settlementPaise = Math.min(pendingPaise, excessPaise);
    if (settlementPaise <= 0) return;

    settledIndex.set(studentId, currentSharePaise + settlementPaise);
    excessPaise -= settlementPaise;
  });

  return settledIndex;
};

const buildDemandWithLedgerIndex = async ({ context, session }) => {
  const baseDemand = await buildFamilyDemand({
    context,
    session,
    familyPaidIndex: createFamilyLedgerIndex(),
  });
  const familyPaidIndex = await buildFamilyPaidAllocationIndex({
    familyId: context.family._id,
    academicYear: context.academicYear,
    session,
    demand: baseDemand,
  });
  const demand = await buildFamilyDemand({ context, session, familyPaidIndex });

  return { baseDemand, demand, familyPaidIndex };
};

const generateMonthlyLedger = ({ demand, familyPaidIndex }) => {
  const monthMap = new Map(
    demand.months.map((month) => [
      month.key,
      {
        monthKey: month.key,
        monthLabel: month.label,
        dueDate: month.dueDate,
        lines: [],
        baseDuePaise: 0,
        paidPaise: 0,
        advancePaise: 0,
        endingBalancePaise: 0,
      },
    ])
  );
  const studentLedgerMap = new Map();

  // Track, per academic month, how much was physically RECEIVED during that calendar
  // month (by payment date) regardless of which month's dues the engine cleared. A month
  // that received money is at least "partial"; the allocation can still send that cash to
  // older balances. Advance created by a payment is excluded here so that future months
  // covered purely by advance settle as "paid" rather than "partial".
  const receivedByMonthIndex = new Map();
  (familyPaidIndex.postedPayments || []).forEach((payment) => {
    const cashAppliedPaise = Math.max(
      toPaise(payment.amountCollected || 0) - toPaise(payment.advanceCreated || 0),
      0
    );
    if (cashAppliedPaise <= 0) return;
    const monthIndex = getPaymentAcademicMonthIndex(payment.paymentDate, demand.months);
    receivedByMonthIndex.set(monthIndex, (receivedByMonthIndex.get(monthIndex) || 0) + cashAppliedPaise);
  });

  demand.units.forEach((unit) => {
    const month = monthMap.get(unit.monthKey);
    if (!month) return;
    const advanceUsedPaise = Math.min(
      getIndexedAmountForUnit(familyPaidIndex.advanceUsedIndex, unit),
      unit.paidPaise
    );
    const paymentAppliedPaise = Math.max(unit.paidPaise - advanceUsedPaise, 0);
    const lineBalancePaise = Math.max(unit.amountPaise - paymentAppliedPaise - advanceUsedPaise, 0);

    month.baseDuePaise += unit.amountPaise;
    month.paidPaise += paymentAppliedPaise;
    month.advancePaise += advanceUsedPaise;

    const studentKey = toId(unit.studentId);
    const studentLedger = studentLedgerMap.get(studentKey) || {
      duePaise: 0,
      paidPaise: 0,
      advancePaise: 0,
    };
    studentLedger.duePaise += unit.amountPaise;
    studentLedger.paidPaise += paymentAppliedPaise;
    studentLedger.advancePaise += advanceUsedPaise;
    studentLedgerMap.set(studentKey, studentLedger);

    month.lines.push({
      type: unit.sourceRecordType === "previous_year_fees" ? "previous_year_balance" : "student_due",
      studentId: unit.studentId,
      studentName: unit.studentName,
      feeType: unit.feeType,
      label: unit.sourceRecordType === "previous_year_fees"
        ? FEE_TYPE_LABELS.previous_year_balance
        : `${unit.studentName} - ${unit.feeLabel}`,
      amount: unit.amount,
      paidAmount: fromPaise(paymentAppliedPaise),
      advanceAmount: fromPaise(advanceUsedPaise),
      balance: fromPaise(lineBalancePaise),
    });
  });

  let unappliedPaymentCreditPaise = Math.max(Number(familyPaidIndex.unallocatedPaymentPaise || 0), 0);

  // Build a CUMULATIVE carry-forward ledger. Each month opens with the unpaid balance
  // rolled over from the previous month, so the current month always reflects the true
  // amount the family owes right now (e.g. May shows April's leftover + May's own dues).
  // A month is paid only when its cumulative balance clears. If a carried balance is still
  // open after the due date, keep it overdue instead of hiding it behind the next month.
  let carriedBalancePaise = 0;

  const months = demand.months.map((month, monthIndex) => {
    const statementMonth = monthMap.get(month.key);
    const openingCarriedPaise = carriedBalancePaise;
    const totalDuePaise = openingCarriedPaise + statementMonth.baseDuePaise;
    const balanceBeforeCreditPaise = Math.max(
      totalDuePaise - statementMonth.paidPaise - statementMonth.advancePaise,
      0
    );
    const unappliedCreditPaise = Math.min(balanceBeforeCreditPaise, unappliedPaymentCreditPaise);
    unappliedPaymentCreditPaise = Math.max(unappliedPaymentCreditPaise - unappliedCreditPaise, 0);
    const endingBalancePaise = Math.max(balanceBeforeCreditPaise - unappliedCreditPaise, 0);
    carriedBalancePaise = endingBalancePaise;

    const monthPaidPaise = statementMonth.paidPaise + statementMonth.advancePaise + unappliedCreditPaise;
    // A payment received during this calendar month counts toward its status even if the
    // engine routed that cash to clear older months. Advance-only coverage (no cash this
    // month) does not trigger "partial" so future months prepaid by advance read "paid".
    const receivedThisMonthPaise = receivedByMonthIndex.get(monthIndex) || 0;
    const hasActivity = monthPaidPaise > 0 || receivedThisMonthPaise > 0;
    const status = resolveMonthlyLedgerStatus({
      endingBalancePaise,
      totalDuePaise,
      dueDate: month.dueDate,
      hasActivity,
    });
    const isOverdue = status === "overdue";

    const response = {
      monthKey: month.key,
      monthLabel: month.label,
      dueDate: month.dueDate,
      status,
      isOverdue,
      lines: [
        ...(openingCarriedPaise > 0
          ? [{
              type: "carried_balance",
              label: "Carried Forward Balance",
              amount: fromPaise(openingCarriedPaise),
            }]
          : []),
        ...statementMonth.lines,
        ...(statementMonth.advancePaise > 0
          ? [{ type: "advance", label: "Advance Used", amount: -fromPaise(statementMonth.advancePaise) }]
          : []),
        ...(statementMonth.paidPaise > 0
          ? [{ type: "payment", label: "Paid / Allocated", amount: -fromPaise(statementMonth.paidPaise) }]
          : []),
        ...(unappliedCreditPaise > 0
          ? [{ type: "payment", label: "Collected Family Credit", amount: -fromPaise(unappliedCreditPaise) }]
          : []),
      ],
      baseDue: fromPaise(statementMonth.baseDuePaise),
      carriedBalance: fromPaise(openingCarriedPaise),
      paidAmount: fromPaise(monthPaidPaise),
      cashPaidAmount: fromPaise(statementMonth.paidPaise + unappliedCreditPaise),
      advanceApplied: fromPaise(statementMonth.advancePaise),
      totalDue: fromPaise(totalDuePaise),
      endingBalance: fromPaise(endingBalancePaise),
    };

    return response;
  });

  return { months, studentLedgerMap };
};

const validateLedgerConsistency = ({ months, summary }) => {
  // Month balances are cumulative (each month rolls the prior month's unpaid balance
  // forward), so the family's true outstanding equals the LAST month's ending balance,
  // not the sum across months. Payments and advances are still per-month and sum normally.
  const finalBalancePaise = months.length
    ? toPaise(months[months.length - 1].endingBalance || 0)
    : 0;
  const monthlyPaymentPaise = months.reduce((total, month) => total + toPaise(month.cashPaidAmount || month.paidAmount || 0), 0);
  const monthlyAdvancePaise = months.reduce((total, month) => total + toPaise(month.advanceApplied || 0), 0);
  const checks = [
    {
      name: "monthly_balances_equal_ledger_pending",
      passed: finalBalancePaise === toPaise(summary.ledgerPendingAmount || 0),
      expected: summary.ledgerPendingAmount,
      actual: fromPaise(finalBalancePaise),
    },
    {
      name: "monthly_payments_equal_applied_cash",
      passed: monthlyPaymentPaise === toPaise(summary.appliedAmount || 0),
      expected: summary.appliedAmount,
      actual: fromPaise(monthlyPaymentPaise),
    },
    {
      name: "monthly_advance_equal_advance_used",
      passed: monthlyAdvancePaise === toPaise(summary.advanceUsed || 0),
      expected: summary.advanceUsed,
      actual: fromPaise(monthlyAdvancePaise),
    },
  ];

  return {
    balanced: checks.every((check) => check.passed),
    checks,
  };
};

const calculateFamilySummary = ({
  context,
  demand,
  familyPaidIndex,
  advance,
  months,
}) => {
  const totalDuePaise = demand.units.reduce((total, unit) => total + unit.amountPaise, 0);
  const totalAdvanceUsedPaise = demand.units.reduce(
    (total, unit) => total + Math.min(getIndexedAmountForUnit(familyPaidIndex.advanceUsedIndex, unit), unit.paidPaise),
    0
  );
  const totalAppliedPaise = demand.units.reduce((total, unit) => {
    const advanceUsedPaise = Math.min(getIndexedAmountForUnit(familyPaidIndex.advanceUsedIndex, unit), unit.paidPaise);
    return total + Math.max(unit.paidPaise - advanceUsedPaise, 0);
  }, 0);
  const standaloneCollectedPaise = context.feeRecords.reduce(
    (total, { feesRecord }) => total + getStandaloneCollectedPaise(feesRecord, familyPaidIndex),
    0
  );
  const totalCollectedPaise = familyPaidIndex.postedPaymentPaise + standaloneCollectedPaise;
  const rawAdvancePaise = toPaise(advance?.advanceBalance || 0);
  // Month balances are cumulative; the family's outstanding is the final month's balance.
  const ledgerPendingPaise = months.length
    ? toPaise(months[months.length - 1].endingBalance || 0)
    : 0;
  const summary = {
    totalDue: fromPaise(totalDuePaise),
    paidAmount: fromPaise(totalCollectedPaise),
    cashCollectedAmount: fromPaise(totalCollectedPaise),
    appliedAmount: fromPaise(totalAppliedPaise),
    pendingAmount: fromPaise(ledgerPendingPaise),
    ledgerPendingAmount: fromPaise(ledgerPendingPaise),
    advanceBalance: fromPaise(rawAdvancePaise),
    rawAdvanceBalance: fromPaise(rawAdvancePaise),
    advanceUsed: fromPaise(totalAdvanceUsedPaise),
    projectedAdvanceApplied: 0,
    pendingBeforeAdvance: fromPaise(ledgerPendingPaise),
    unallocatedPayment: fromPaise(familyPaidIndex.unallocatedPaymentPaise),
    unallocatedAdvance: fromPaise(familyPaidIndex.unallocatedAdvancePaise),
  };

  return {
    ...summary,
    validation: validateLedgerConsistency({ months, summary }),
  };
};

export const buildFamilyStatement = async ({
  familyId,
  academicYear = "",
  session = null,
} = {}) => {
  const context = await resolveFamilyContext({ familyId, academicYear, session });
  if (context.error) return context;

  const { demand, familyPaidIndex } = await buildDemandWithLedgerIndex({ context, session });
  const advance = await getAdvanceBalance({ familyId, academicYear: context.academicYear, session });
  const { months, studentLedgerMap } = generateMonthlyLedger({ demand, familyPaidIndex });
  const studentCollectionShareIndex = settleStudentCollectionShares({
    shareIndex: buildStudentCollectionShareIndex({ context, familyPaidIndex }),
    studentLedgerMap,
    siblings: context.siblings,
  });
  const totals = calculateFamilySummary({
    context,
    demand,
    familyPaidIndex,
    advance,
    months,
  });

  return {
    family: {
      _id: context.family._id,
      familyCode: context.family.familyCode,
      displayName: context.family.displayName,
      fatherName: context.family.fatherName,
      motherName: context.family.motherName,
      primaryPhone: context.family.primaryPhone,
    },
    academicYear: context.academicYear,
    siblings: context.feeRecords.map(({ sibling, feesRecord }) => {
      const studentLedger = studentLedgerMap.get(toId(sibling._id)) || {
        duePaise: 0,
        paidPaise: 0,
        advancePaise: 0,
      };
      const advanceAppliedPaise = Math.min(studentLedger.advancePaise, studentLedger.duePaise);
      const cashCapacityPaise = Math.max(studentLedger.duePaise - advanceAppliedPaise, 0);
      const collectedSharePaise = studentCollectionShareIndex.get(toId(sibling._id)) || 0;
      const settledPaidPaise = Math.min(collectedSharePaise, cashCapacityPaise);
      const coveredPaise = settledPaidPaise + advanceAppliedPaise;
      return {
        _id: sibling._id,
        name: getStudentName(sibling),
        admissionNo: sibling.admissionNo || sibling.studentId,
        classLabel: getClassLabel(sibling.class),
        phone: sibling.phone,
        totalDue: fromPaise(studentLedger.duePaise),
        paidAmount: fromPaise(settledPaidPaise),
        cashPaidAmount: fromPaise(settledPaidPaise),
        advanceApplied: fromPaise(advanceAppliedPaise),
        coveredAmount: fromPaise(coveredPaise),
        allocatedAmount: fromPaise(coveredPaise),
        feeAllocatedAmount: fromPaise(coveredPaise),
        pendingAmount: fromPaise(Math.max(studentLedger.duePaise - coveredPaise, 0)),
        feesRecordId: feesRecord._id,
      };
    }),
    totals,
    advance: advance
      ? {
          advanceBalance: Number(advance.advanceBalance || 0),
          lots: advance.lots || [],
        }
      : { advanceBalance: 0, lots: [] },
    months,
  };
};

const generateStudentMonthlyLedgerFromFamilyDemand = ({
  demand,
  familyPaidIndex,
  studentId,
  settledPaidPaise = 0,
}) => {
  const targetStudentId = toId(studentId);
  const monthMap = new Map(
    demand.months.map((month) => [
      month.key,
      {
        monthKey: month.key,
        monthLabel: month.label,
        dueDate: month.dueDate,
        lines: [],
        totalDuePaise: 0,
        paidPaise: 0,
        advancePaise: 0,
      },
    ])
  );
  const studentUnits = demand.units.filter((unit) => toId(unit.studentId) === targetStudentId);
  const coveredPaise = studentUnits.reduce(
    (total, unit) => total + Math.min(Number(unit.amountPaise || 0), Number(unit.paidPaise || 0)),
    0
  );
  let settlementPaise = Math.max(Number(settledPaidPaise || 0) - coveredPaise, 0);
  const settlementIndex = new Map();

  sortDemandUnitsForAllocation(
    studentUnits.map((unit) => ({
      ...unit,
      outstandingPaise: Math.max(Number(unit.amountPaise || 0) - Number(unit.paidPaise || 0), 0),
    }))
  ).forEach((unit) => {
    if (settlementPaise <= 0) return;

    const unitOutstandingPaise = Math.max(Number(unit.amountPaise || 0) - Number(unit.paidPaise || 0), 0);
    const adjustmentPaise = Math.min(unitOutstandingPaise, settlementPaise);
    if (adjustmentPaise <= 0) return;

    settlementIndex.set(getDemandUnitKey(unit), adjustmentPaise);
    settlementPaise -= adjustmentPaise;
  });

  studentUnits.forEach((unit) => {
    const month = monthMap.get(unit.monthKey);
    if (!month) return;

    const settlementAdjustmentPaise = settlementIndex.get(getDemandUnitKey(unit)) || 0;
    const totalPaidPaise = Math.min(
      Number(unit.amountPaise || 0),
      Number(unit.paidPaise || 0) + settlementAdjustmentPaise
    );
    const advanceUsedPaise = Math.min(
      getIndexedAmountForUnit(familyPaidIndex.advanceUsedIndex, unit),
      totalPaidPaise
    );
    const paymentAppliedPaise = Math.max(totalPaidPaise - advanceUsedPaise, 0);

    month.totalDuePaise += Number(unit.amountPaise || 0);
    month.paidPaise += paymentAppliedPaise;
    month.advancePaise += advanceUsedPaise;
    month.lines.push({
      type: unit.sourceRecordType === "previous_year_fees" ? "previous_year_balance" : "fee",
      feeType: unit.feeType,
      label: unit.sourceRecordType === "previous_year_fees"
        ? FEE_TYPE_LABELS.previous_year_balance
        : unit.feeLabel || FEE_TYPE_LABELS[unit.feeType] || "Fees",
      amount: unit.amount,
      paidAmount: fromPaise(paymentAppliedPaise),
      advanceAmount: fromPaise(advanceUsedPaise),
      balance: fromPaise(Math.max(Number(unit.amountPaise || 0) - totalPaidPaise, 0)),
    });
  });

  // Payment received per academic month (by date) for this family. A family payment
  // benefits the whole family, so a month that received cash reads at least "partial" for
  // the student even if the engine routed that cash to clear older balances.
  const receivedByMonthIndex = new Map();
  (familyPaidIndex.postedPayments || []).forEach((payment) => {
    const cashAppliedPaise = Math.max(
      toPaise(payment.amountCollected || 0) - toPaise(payment.advanceCreated || 0),
      0
    );
    if (cashAppliedPaise <= 0) return;
    const monthIndex = getPaymentAcademicMonthIndex(payment.paymentDate, demand.months);
    receivedByMonthIndex.set(monthIndex, true);
  });

  let carriedBalancePaise = 0;
  return demand.months.map((month, monthIndex) => {
    const summary = monthMap.get(month.key);
    const openingCarriedPaise = carriedBalancePaise;
    const totalDuePaise = openingCarriedPaise + summary.totalDuePaise;
    const coveredForMonthPaise = summary.paidPaise + summary.advancePaise;
    const endingBalancePaise = Math.max(totalDuePaise - coveredForMonthPaise, 0);
    carriedBalancePaise = endingBalancePaise;

    const hasActivity = coveredForMonthPaise > 0 || receivedByMonthIndex.get(monthIndex);
    const status = resolveMonthlyLedgerStatus({
      endingBalancePaise,
      totalDuePaise,
      dueDate: month.dueDate,
      hasActivity,
    });

    return {
      monthKey: summary.monthKey,
      monthLabel: summary.monthLabel,
      dueDate: summary.dueDate,
      status,
      totalDue: fromPaise(totalDuePaise),
      carriedBalance: fromPaise(openingCarriedPaise),
      paidAmount: fromPaise(coveredForMonthPaise),
      endingBalance: fromPaise(endingBalancePaise),
      lines: [
        ...(openingCarriedPaise > 0
          ? [{ type: "carried_balance", label: "Carried Forward Balance", amount: fromPaise(openingCarriedPaise) }]
          : []),
        ...summary.lines,
        ...(summary.advancePaise > 0
          ? [{ type: "advance", label: "Advance Used", amount: -fromPaise(summary.advancePaise) }]
          : []),
        ...(summary.paidPaise > 0
          ? [{ type: "payment", label: "Paid / Allocated", amount: -fromPaise(summary.paidPaise) }]
          : []),
      ],
    };
  });
};

const calculateStudentStatementTotals = (months = []) => {
  // Month balances are cumulative; total due is the final month's running total and
  // pending is the final month's ending balance.
  const totalDuePaise = months.length ? toPaise(months[months.length - 1].totalDue || 0) : 0;
  const pendingPaise = months.length ? toPaise(months[months.length - 1].endingBalance || 0) : 0;
  const overduePaise = months.some((month) => month.status === "overdue") ? pendingPaise : 0;

  return {
    totalDue: fromPaise(totalDuePaise),
    paidAmount: fromPaise(Math.max(totalDuePaise - pendingPaise, 0)),
    pendingAmount: fromPaise(pendingPaise),
    overdueAmount: fromPaise(overduePaise),
  };
};

const getFamilyParentLabel = (family = {}, sibling = {}) => {
  const fatherName = trimString(family.fatherName || sibling.parent?.fatherName || sibling.parentName);
  const motherName = trimString(family.motherName || sibling.parent?.motherName);
  return [fatherName, motherName].filter(Boolean).join(" / ") || "N/A";
};

export const buildStudentStatementFromFamilyLedger = async ({
  studentId,
  academicYear = "",
  session = null,
} = {}) => {
  const family = await ensureStudentFamily(studentId, { session });
  if (!family) {
    return { error: { statusCode: 404, message: "Student not found" } };
  }

  const context = await resolveFamilyContext({
    familyId: family._id,
    academicYear,
    session,
  });
  if (context.error) return context;

  const targetStudentId = toId(studentId);
  const targetRecord = context.feeRecords.find(({ sibling }) => toId(sibling._id) === targetStudentId);
  if (!targetRecord) {
    return { error: { statusCode: 404, message: "Student not found in this family session" } };
  }

  const { demand, familyPaidIndex } = await buildDemandWithLedgerIndex({ context, session });
  const { studentLedgerMap } = generateMonthlyLedger({ demand, familyPaidIndex });
  const studentCollectionShareIndex = settleStudentCollectionShares({
    shareIndex: buildStudentCollectionShareIndex({ context, familyPaidIndex }),
    studentLedgerMap,
    siblings: context.siblings,
  });
  const studentLedger = studentLedgerMap.get(targetStudentId) || {
    duePaise: 0,
    paidPaise: 0,
    advancePaise: 0,
  };
  const settledPaidPaise = Math.min(
    studentCollectionShareIndex.get(targetStudentId) || 0,
    studentLedger.duePaise
  );
  const months = generateStudentMonthlyLedgerFromFamilyDemand({
    demand,
    familyPaidIndex,
    studentId,
    settledPaidPaise,
  });
  const sibling = targetRecord.sibling;

  return {
    studentId,
    familyId: family._id,
    academicYear: context.academicYear,
    source: "family_ledger",
    student: {
      _id: sibling._id,
      name: getStudentName(sibling),
      admissionNo: sibling.admissionNo || sibling.studentId || "N/A",
      parentName: getFamilyParentLabel(context.family, sibling),
      parentPhone: context.family.primaryPhone || sibling.parent?.phone || sibling.parentPhone || sibling.phone || "N/A",
      classLabel: getClassLabel(sibling.class || targetRecord.feesRecord?.class),
    },
    totals: calculateStudentStatementTotals(months),
    months,
  };
};

const normalizeOutstandingUnits = (units = []) =>
  units
    .map((unit) => {
      const rawOutstanding = Number(unit.outstandingPaise);
      const computedOutstanding = Number(unit.amountPaise || 0) - Number(unit.paidPaise || 0);
      const outstandingPaise = Math.max(
        Number.isFinite(rawOutstanding) ? rawOutstanding : computedOutstanding,
        0
      );
      return { ...unit, outstandingPaise };
    })
    .filter((unit) => unit.outstandingPaise > 0);

const groupUnitsByStudent = (units = []) => {
  const grouped = new Map();
  units.forEach((unit) => {
    const studentId = toId(unit.studentId);
    if (!studentId) return;
    const existing = grouped.get(studentId) || {
      studentId: unit.studentId,
      studentName: unit.studentName || "",
      units: [],
    };
    existing.units.push(unit);
    grouped.set(studentId, existing);
  });
  return grouped;
};

const getStudentOrder = (unitsByStudent) =>
  [...unitsByStudent.values()]
    .sort((left, right) => {
      const nameCompare = `${left.studentName}`.localeCompare(`${right.studentName}`);
      if (nameCompare !== 0) return nameCompare;
      return toId(left.studentId).localeCompare(toId(right.studentId));
    })
    .map((entry) => toId(entry.studentId));

const getSiblingShareOrder = (siblings = []) =>
  [...siblings]
    .sort((left, right) => {
      const nameCompare = getStudentName(left).localeCompare(getStudentName(right));
      if (nameCompare !== 0) return nameCompare;
      return toId(left._id).localeCompare(toId(right._id));
    });

const addStudentSharePaise = (index, studentId, amountPaise) => {
  const normalizedStudentId = toId(studentId);
  const normalizedAmountPaise = Math.max(Number(amountPaise || 0), 0);
  if (!normalizedStudentId || normalizedAmountPaise <= 0) return;
  index.set(normalizedStudentId, (index.get(normalizedStudentId) || 0) + normalizedAmountPaise);
};

const buildUnitOutstandingIndex = (units = []) => {
  const index = new Map();
  units.forEach((unit) => {
    index.set(getDemandUnitKey(unit), Math.max(Number(unit.outstandingPaise || 0), 0));
  });
  return index;
};

const buildStudentOutstandingIndex = (unitsByStudent, unitOutstandingIndex) => {
  const index = new Map();
  unitsByStudent.forEach((entry, studentId) => {
    const total = (entry.units || []).reduce((sum, unit) => {
      const unitKey = getDemandUnitKey(unit);
      return sum + (unitOutstandingIndex.get(unitKey) || 0);
    }, 0);
    index.set(studentId, total);
  });
  return index;
};

const applyUnitAllocationPaise = ({
  unit,
  amountPaise,
  unitOutstandingIndex,
  studentOutstandingIndex,
  allocations,
}) => {
  const requestedPaise = Math.max(Number(amountPaise || 0), 0);
  if (requestedPaise <= 0) return 0;

  const unitKey = getDemandUnitKey(unit);
  const unitOutstanding = unitOutstandingIndex.get(unitKey) || 0;
  const appliedPaise = Math.min(unitOutstanding, requestedPaise);
  if (appliedPaise <= 0) return 0;

  unitOutstandingIndex.set(unitKey, unitOutstanding - appliedPaise);
  const studentId = toId(unit.studentId);
  studentOutstandingIndex.set(
    studentId,
    Math.max((studentOutstandingIndex.get(studentId) || 0) - appliedPaise, 0)
  );
  allocations.push({ unit, amountPaise: appliedPaise });
  return appliedPaise;
};

// Shares a limited amount across every sibling that still owes money in the same month
// tier, in proportion to how much each child owes. This guarantees that when a payment is
// too small to clear the whole month for all siblings, no child is skipped while others
// are paid in full — every child receives a fair partial amount. Paise are distributed
// with the largest-remainder method so the totals reconcile to the exact rupee.
const distributeTierAcrossStudents = ({
  tierUnits,
  availablePaise,
  unitOutstandingIndex,
  studentOutstandingIndex,
  allocations,
}) => {
  const unitsByStudent = new Map();
  const outstandingByStudent = new Map();
  tierUnits.forEach((unit) => {
    const outstanding = unitOutstandingIndex.get(getDemandUnitKey(unit)) || 0;
    if (outstanding <= 0) return;
    const studentId = toId(unit.studentId);
    if (!unitsByStudent.has(studentId)) unitsByStudent.set(studentId, []);
    unitsByStudent.get(studentId).push(unit);
    outstandingByStudent.set(studentId, (outstandingByStudent.get(studentId) || 0) + outstanding);
  });

  const studentIds = [...unitsByStudent.keys()].sort((left, right) => left.localeCompare(right));
  const totalOutstandingPaise = [...outstandingByStudent.values()].reduce((sum, value) => sum + value, 0);
  if (totalOutstandingPaise <= 0) return 0;

  const distributablePaise = Math.min(Math.max(Number(availablePaise || 0), 0), totalOutstandingPaise);
  if (distributablePaise <= 0) return 0;

  const shareByStudent = new Map();
  const remainders = [];
  let floorTotal = 0;
  studentIds.forEach((studentId) => {
    const exactShare = (distributablePaise * outstandingByStudent.get(studentId)) / totalOutstandingPaise;
    const floorShare = Math.floor(exactShare);
    shareByStudent.set(studentId, floorShare);
    floorTotal += floorShare;
    remainders.push({ studentId, remainder: exactShare - floorShare });
  });

  let leftoverPaise = distributablePaise - floorTotal;
  remainders.sort((left, right) => right.remainder - left.remainder || left.studentId.localeCompare(right.studentId));
  for (let index = 0; index < remainders.length && leftoverPaise > 0; index += 1) {
    const { studentId } = remainders[index];
    shareByStudent.set(studentId, (shareByStudent.get(studentId) || 0) + 1);
    leftoverPaise -= 1;
  }

  let allocatedPaise = 0;
  studentIds.forEach((studentId) => {
    let studentSharePaise = shareByStudent.get(studentId) || 0;
    for (const unit of unitsByStudent.get(studentId)) {
      if (studentSharePaise <= 0) break;
      const appliedPaise = applyUnitAllocationPaise({
        unit,
        amountPaise: studentSharePaise,
        unitOutstandingIndex,
        studentOutstandingIndex,
        allocations,
      });
      studentSharePaise -= appliedPaise;
      allocatedPaise += appliedPaise;
    }
  });

  return allocatedPaise;
};

const allocateByStudentShare = ({
  unitsByStudent,
  // studentOrder is retained for call-site compatibility but is intentionally unused:
  // allocation is now driven purely by chronological demand, not by an equal cash split.
  studentOrder, // eslint-disable-line no-unused-vars
  amountPaise = 0,
  unitOutstandingIndex,
  studentOutstandingIndex,
}) => {
  const totalPaymentPaise = Math.max(Number(amountPaise || 0), 0);
  let allocatedTotalPaise = 0;
  const allocations = [];
  if (totalPaymentPaise <= 0) return { allocations, unallocatedPaise: 0 };

  // Allocate by chronological tier so the whole family advances together. Tier -1 is the
  // previous-year balance, then each academic month in order. A tier is cleared for every
  // sibling before the next tier is touched, which keeps siblings on the same paid-up
  // month even when their monthly fees differ (e.g. one child at 500/month, another at
  // 700/month). When a payment cannot cover a full tier for all siblings, the remaining
  // money is split proportionally within that tier so no child is left with zero while
  // their siblings are paid.
  const orderedUnits = sortUnitsByMonthPriority(
    [...unitsByStudent.values()].flatMap((entry) => entry.units || [])
  );

  const tiers = new Map();
  orderedUnits.forEach((unit) => {
    const outstanding = unitOutstandingIndex.get(getDemandUnitKey(unit)) || 0;
    if (outstanding <= 0) return;
    const tierKey = unit.sourceRecordType === "previous_year_fees" ? -1 : Number(unit.monthIndex || 0);
    if (!tiers.has(tierKey)) tiers.set(tierKey, []);
    tiers.get(tierKey).push(unit);
  });

  const tierKeys = [...tiers.keys()].sort((left, right) => left - right);
  let remainingPaise = totalPaymentPaise;

  for (const tierKey of tierKeys) {
    if (remainingPaise <= 0) break;

    const tierUnits = tiers.get(tierKey);
    const tierDuePaise = tierUnits.reduce(
      (sum, unit) => sum + (unitOutstandingIndex.get(getDemandUnitKey(unit)) || 0),
      0
    );
    if (tierDuePaise <= 0) continue;

    if (remainingPaise >= tierDuePaise) {
      tierUnits.forEach((unit) => {
        allocatedTotalPaise += applyUnitAllocationPaise({
          unit,
          amountPaise: unitOutstandingIndex.get(getDemandUnitKey(unit)) || 0,
          unitOutstandingIndex,
          studentOutstandingIndex,
          allocations,
        });
      });
      remainingPaise -= tierDuePaise;
    } else {
      const appliedPaise = distributeTierAcrossStudents({
        tierUnits,
        availablePaise: remainingPaise,
        unitOutstandingIndex,
        studentOutstandingIndex,
        allocations,
      });
      allocatedTotalPaise += appliedPaise;
      remainingPaise -= appliedPaise;
      break;
    }
  }

  return {
    allocations,
    unallocatedPaise: Math.max(totalPaymentPaise - allocatedTotalPaise, 0),
  };
};

const allocateAcrossUnits = ({
  units = [],
  amount,
  advanceBalance = 0,
  paymentDate,
  months = [],
  startFromMonth = "",
  useAdvance = false,
}) => {
  const outstandingUnits = normalizeOutstandingUnits(units);
  const initialCurrentPaise = toPaise(amount);
  const initialAdvancePaise = toPaise(advanceBalance);
  const canUseAdvance = shouldApplyAdvance({ useAdvance, amountPaise: initialCurrentPaise });

  if (outstandingUnits.length === 0) {
    const remainingAdvancePaise = canUseAdvance ? initialAdvancePaise : 0;
    const advanceCreatedPaise = Math.max(initialCurrentPaise, 0);
    const untouchedAdvancePaise = canUseAdvance ? 0 : initialAdvancePaise;
    const advanceBalanceAfterPaise = Math.max(
      untouchedAdvancePaise + remainingAdvancePaise + advanceCreatedPaise,
      0
    );

    return {
      allocations: [],
      monthSummary: [],
      amountCollected: Number(amount || 0),
      allocatedAmount: 0,
      existingAdvanceBalance: fromPaise(initialAdvancePaise),
      advanceApplied: 0,
      advanceBalanceAfter: fromPaise(advanceBalanceAfterPaise),
      excessAfterCurrentDue: 0,
      futureAdvanceAllocated: 0,
      advanceCreated: fromPaise(advanceCreatedPaise),
    };
  }

  const earliestMonthIndex = outstandingUnits.reduce(
    (min, unit) => Math.min(min, Number.isFinite(unit.monthIndex) ? unit.monthIndex : min),
    Number.POSITIVE_INFINITY
  );
  const resolvedEarliestMonthIndex = Number.isFinite(earliestMonthIndex) ? earliestMonthIndex : 0;
  const requestedStartIndex = getMonthIndex(startFromMonth);
  const startMonthIndex = requestedStartIndex >= 0
    ? Math.min(requestedStartIndex, resolvedEarliestMonthIndex)
    : resolvedEarliestMonthIndex;
  const eligibleUnits = outstandingUnits.filter((unit) => unit.monthIndex >= startMonthIndex);

  if (eligibleUnits.length === 0) {
    const remainingAdvancePaise = canUseAdvance ? initialAdvancePaise : 0;
    const advanceCreatedPaise = Math.max(initialCurrentPaise, 0);
    const untouchedAdvancePaise = canUseAdvance ? 0 : initialAdvancePaise;
    const advanceBalanceAfterPaise = Math.max(
      untouchedAdvancePaise + remainingAdvancePaise + advanceCreatedPaise,
      0
    );

    return {
      allocations: [],
      monthSummary: [],
      amountCollected: Number(amount || 0),
      allocatedAmount: 0,
      existingAdvanceBalance: fromPaise(initialAdvancePaise),
      advanceApplied: 0,
      advanceBalanceAfter: fromPaise(advanceBalanceAfterPaise),
      excessAfterCurrentDue: 0,
      futureAdvanceAllocated: 0,
      advanceCreated: fromPaise(advanceCreatedPaise),
    };
  }

  const dueByMonth = new Map();
  eligibleUnits.forEach((unit) => {
    const monthKey = unit.monthKey || "";
    if (!monthKey) return;
    const existing = dueByMonth.get(monthKey) || {
      monthKey,
      monthLabel: unit.monthLabel,
      monthIndex: unit.monthIndex,
      duePaise: 0,
    };
    existing.duePaise += unit.outstandingPaise;
    existing.monthIndex = Math.min(existing.monthIndex, unit.monthIndex);
    dueByMonth.set(monthKey, existing);
  });

  const allEligibleStudentOrder = getStudentOrder(
    groupUnitsByStudent(units.filter((unit) => unit.monthIndex >= startMonthIndex))
  );
  const unitsByStudent = groupUnitsByStudent(eligibleUnits);
  unitsByStudent.forEach((entry) => {
    entry.units = sortDemandUnitsForAllocation(entry.units);
  });
  const unitOutstandingIndex = buildUnitOutstandingIndex(eligibleUnits);
  const studentOutstandingIndex = buildStudentOutstandingIndex(unitsByStudent, unitOutstandingIndex);

  const currentAllocation = allocateByStudentShare({
    unitsByStudent,
    studentOrder: allEligibleStudentOrder,
    amountPaise: initialCurrentPaise,
    unitOutstandingIndex,
    studentOutstandingIndex,
  });
  const currentAllocations = currentAllocation.allocations;
  let remainingCurrentPaise = currentAllocation.unallocatedPaise;

  let advanceAllocations = [];
  let remainingAdvancePaise = canUseAdvance ? initialAdvancePaise : 0;
  if (remainingAdvancePaise > 0) {
    const advanceAllocation = allocateByStudentShare({
      unitsByStudent,
      studentOrder: allEligibleStudentOrder,
      amountPaise: remainingAdvancePaise,
      unitOutstandingIndex,
      studentOutstandingIndex,
    });
    advanceAllocations = advanceAllocation.allocations;
    remainingAdvancePaise = advanceAllocation.unallocatedPaise;
  }

  const allocationMap = new Map();
  const appendAllocation = (allocation, type) => {
    const unitKey = getDemandUnitKey(allocation.unit);
    const existing = allocationMap.get(unitKey) || {
      unit: allocation.unit,
      amountPaise: 0,
      currentPaise: 0,
      advancePaise: 0,
    };
    existing.amountPaise += allocation.amountPaise;
    if (type === "advance") {
      existing.advancePaise += allocation.amountPaise;
    } else {
      existing.currentPaise += allocation.amountPaise;
    }
    allocationMap.set(unitKey, existing);
  };

  currentAllocations.forEach((allocation) => appendAllocation(allocation, "current"));
  advanceAllocations.forEach((allocation) => appendAllocation(allocation, "advance"));

  const allocations = [...allocationMap.values()].map((allocation) => ({
    unit: allocation.unit,
    amountPaise: allocation.amountPaise,
    amount: fromPaise(allocation.amountPaise),
    advancePaise: allocation.advancePaise,
    advanceAmount: fromPaise(allocation.advancePaise),
    currentPaise: allocation.currentPaise,
    currentAmount: fromPaise(allocation.currentPaise),
  }));

  const monthSummaryMap = new Map();
  allocations.forEach((allocation) => {
    const monthKey = allocation.unit.monthKey || "";
    if (!monthKey || !dueByMonth.has(monthKey)) return;
    const dueEntry = dueByMonth.get(monthKey);
    const existing = monthSummaryMap.get(monthKey) || {
      ...dueEntry,
      currentPaise: 0,
      advancePaise: 0,
    };
    existing.currentPaise += allocation.currentPaise;
    existing.advancePaise += allocation.advancePaise;
    monthSummaryMap.set(monthKey, existing);
  });

  const monthSummary = [...monthSummaryMap.values()]
    .sort((left, right) => left.monthIndex - right.monthIndex)
    .map((entry) => {
      const paidPaise = entry.currentPaise + entry.advancePaise;
      return {
        monthKey: entry.monthKey,
        monthLabel: entry.monthLabel,
        dueBeforePayment: fromPaise(entry.duePaise),
        paidByCurrentPayment: fromPaise(entry.currentPaise),
        paidByAdvance: fromPaise(entry.advancePaise),
        endingBalance: fromPaise(Math.max(entry.duePaise - paidPaise, 0)),
        status: paidPaise >= entry.duePaise ? "paid" : "partial",
      };
    });

  const currentAllocatedPaise = currentAllocations.reduce((total, allocation) => total + allocation.amountPaise, 0);
  const advanceAllocatedPaise = advanceAllocations.reduce((total, allocation) => total + allocation.amountPaise, 0);
  const allocatedPaise = currentAllocatedPaise + advanceAllocatedPaise;
  const currentMonthIndex = getPaymentAcademicMonthIndex(paymentDate, months);
  const futureAdvanceAllocatedPaise = currentAllocations.reduce((total, allocation) => {
    const monthIndex = Number.isFinite(allocation.unit.monthIndex) ? allocation.unit.monthIndex : 0;
    return monthIndex > currentMonthIndex ? total + allocation.amountPaise : total;
  }, 0);

  const advanceAppliedPaise = canUseAdvance ? Math.max(initialAdvancePaise - remainingAdvancePaise, 0) : 0;
  const remainingOutstandingPaise = [...unitOutstandingIndex.values()].reduce(
    (total, outstandingPaise) => total + Math.max(Number(outstandingPaise || 0), 0),
    0
  );
  const advanceCreatedPaise = remainingOutstandingPaise <= 0 ? Math.max(remainingCurrentPaise, 0) : 0;
  const untouchedAdvancePaise = canUseAdvance ? 0 : initialAdvancePaise;
  const advanceBalanceAfterPaise = Math.max(
    untouchedAdvancePaise + remainingAdvancePaise + advanceCreatedPaise,
    0
  );

  return {
    allocations,
    monthSummary,
    amountCollected: Number(amount || 0),
    allocatedAmount: fromPaise(allocatedPaise),
    existingAdvanceBalance: fromPaise(initialAdvancePaise),
    advanceApplied: fromPaise(advanceAppliedPaise),
    advanceBalanceAfter: fromPaise(advanceBalanceAfterPaise),
    excessAfterCurrentDue: fromPaise(futureAdvanceAllocatedPaise),
    futureAdvanceAllocated: fromPaise(futureAdvanceAllocatedPaise),
    advanceCreated: fromPaise(advanceCreatedPaise),
  };
};

const summarizeAllocationsBySibling = (allocations = []) => {
  const summaryMap = new Map();

  allocations.forEach((allocation) => {
    const unit = allocation.unit;
    const studentId = toId(unit.studentId);
    const existing = summaryMap.get(studentId) || {
      student: unit.studentId,
      studentName: unit.studentName,
      classLabel: unit.classLabel,
      allocatedAmountPaise: 0,
      monthsCovered: new Set(),
    };

    existing.allocatedAmountPaise += allocation.amountPaise;
    if (unit.monthLabel) existing.monthsCovered.add(unit.monthLabel);
    summaryMap.set(studentId, existing);
  });

  return [...summaryMap.values()].map((summary) => ({
    student: summary.student,
    studentName: summary.studentName,
    classLabel: summary.classLabel,
    allocatedAmount: fromPaise(summary.allocatedAmountPaise),
    monthsCovered: [...summary.monthsCovered],
  }));
};

const summarizePaymentSharesBySibling = ({ siblings = [], allocations = [] } = {}) => {
  const allocationSummaryByStudent = new Map(
    summarizeAllocationsBySibling(allocations).map((summary) => [toId(summary.student), summary])
  );

  return getSiblingShareOrder(siblings).map((sibling) => {
    const studentId = toId(sibling._id);
    const allocationSummary = allocationSummaryByStudent.get(studentId) || {};
    // Report what was actually applied to this child (driven by month-priority
    // allocation), not an equal cash split, so receipts/previews reflect the real
    // months covered per sibling.
    const appliedAmount = Number(allocationSummary.allocatedAmount || 0);
    return {
      student: sibling._id,
      studentName: getStudentName(sibling),
      classLabel: getClassLabel(sibling.class),
      allocatedAmount: appliedAmount,
      appliedAmount,
      monthsCovered: allocationSummary.monthsCovered || [],
    };
  });
};

export const previewFamilyPayment = async ({
  familyId,
  academicYear = "",
  amount,
  paymentDate = new Date(),
  startFromMonth = "",
  useAdvance = false,
  session = null,
} = {}) => {
  const context = await resolveFamilyContext({ familyId, academicYear, session });
  if (context.error) return context;

  const { demand } = await buildDemandWithLedgerIndex({ context, session });
  const advance = await getAdvanceBalance({ familyId, academicYear: context.academicYear, session });
  const allocation = allocateAcrossUnits({
    units: demand.units,
    amount,
    advanceBalance: advance?.advanceBalance || 0,
    paymentDate,
    months: demand.months,
    startFromMonth,
    useAdvance,
  });

  return {
    familyId,
    academicYear: context.academicYear,
    amountCollected: Number(amount || 0),
    ...allocation,
    siblingsUpdated: summarizePaymentSharesBySibling({
      siblings: context.siblings,
      allocations: allocation.allocations,
    }),
    allocations: allocation.allocations.map(({ unit, amount: allocationAmount, currentAmount, advanceAmount }) => ({
      studentId: unit.studentId,
      studentName: unit.studentName,
      feeType: unit.feeType,
      feeLabel: unit.feeLabel,
      monthKey: unit.monthKey,
      monthLabel: unit.monthLabel,
      amount: allocationAmount,
      currentAmount,
      advanceAmount,
      source: unit.sourceRecordType,
    })),
  };
};

const ensureFeeInstallments = (feesRecord) => {
  if ((feesRecord.feeInstallments || []).length > 0) return;

  const { feeSettings, feeBreakdown, feeFrequency } = getEffectiveFeeData(feesRecord);
  feesRecord.feeInstallments = buildFeeInstallments({
    academicYear: feesRecord.academicYear,
    feeBreakdown,
    feeFrequency,
    existingInstallments: [],
    paymentHistory: feesRecord.paymentHistory || [],
    tuitionConcession: feeSettings.tuitionConcession,
  });
};

const applyAllocationToInstallment = (feesRecord, unit, amountPaise, paymentDate, familyTransactionId) => {
  if (!unit.isInstallmentBacked || !INSTALLMENT_FEE_TYPES.has(unit.feeType)) return null;

  ensureFeeInstallments(feesRecord);
  const targetKey = normalizeMonthKey(unit.installmentKey || unit.monthKey);
  const installment = (feesRecord.feeInstallments || []).find((candidate) =>
    normalizeInstallmentFeeType(candidate.feeType) === unit.feeType &&
    normalizeMonthKey(candidate.installmentKey || candidate.monthKey || candidate.dueMonth) === targetKey
  );

  if (!installment) return null;

  const nextPaidAmount = fromPaise(toPaise(installment.paidAmount || 0) + amountPaise);
  installment.paidAmount = Math.min(Number(installment.amount || 0), nextPaidAmount);
  installment.dueAmount = Math.max(Number(installment.amount || 0) - Number(installment.paidAmount || 0), 0);
  installment.status = resolveInstallmentStatus({
    amount: installment.amount,
    paidAmount: installment.paidAmount,
    dueDate: installment.dueDate,
  });
  if (installment.status === "PAID") {
    installment.paidAt = paymentDate;
  }
  installment.receiptId = familyTransactionId;

  return {
    feeType: unit.feeType,
    installmentKey: installment.installmentKey || installment.monthKey,
    installmentLabel: installment.installmentLabel || installment.monthLabel,
    dueMonth: installment.dueMonth || installment.monthKey,
    monthKey: installment.monthKey,
    monthLabel: installment.monthLabel,
    paidAmount: fromPaise(amountPaise),
  };
};

const applyAllocationsToFeesRecords = async ({
  allocations,
  family,
  familyPaymentId,
  familyTransactionId,
  paymentDate,
  mode,
  note,
  session,
}) => {
  const grouped = new Map();
  allocations.forEach((allocation) => {
    const recordId = toId(allocation.unit.feesRecordId);
    const existing = grouped.get(recordId) || {
      feesRecord: allocation.unit.feesRecord,
      allocations: [],
    };
    existing.allocations.push(allocation);
    grouped.set(recordId, existing);
  });

  let transactionCounter = 1;
  const savedAllocations = [];

  for (const group of grouped.values()) {
    const feesRecord = group.feesRecord;
    const amountPaise = group.allocations.reduce((total, allocation) => total + allocation.amountPaise, 0);
    const currentAmountPaise = group.allocations.reduce((total, allocation) => total + (allocation.currentPaise || 0), 0);
    const advanceAmountPaise = group.allocations.reduce((total, allocation) => total + (allocation.advancePaise || 0), 0);
    const studentId = feesRecord.student?._id || feesRecord.student || group.allocations[0]?.unit.studentId;
    const currentTransactionId = currentAmountPaise > 0
      ? generateStudentTransactionId(familyTransactionId, studentId, transactionCounter++)
      : "";
    const advanceTransactionId = advanceAmountPaise > 0
      ? generateStudentTransactionId(familyTransactionId, studentId, transactionCounter++)
      : "";
    const currentInstallmentAllocations = [];
    const advanceInstallmentAllocations = [];

    group.allocations.forEach((allocation) => {
      const installmentAllocation = applyAllocationToInstallment(
        feesRecord,
        allocation.unit,
        allocation.amountPaise,
        paymentDate,
        familyTransactionId
      );
      if (installmentAllocation) {
        if ((allocation.currentPaise || 0) > 0) {
          currentInstallmentAllocations.push({
            ...installmentAllocation,
            paidAmount: fromPaise(allocation.currentPaise),
          });
        }
        if ((allocation.advancePaise || 0) > 0) {
          advanceInstallmentAllocations.push({
            ...installmentAllocation,
            paidAmount: fromPaise(allocation.advancePaise),
          });
        }
      }

      const baseSavedAllocation = {
        student: allocation.unit.studentId,
        studentName: allocation.unit.studentName,
        feesRecord: allocation.unit.feesRecordId,
        academicYear: allocation.unit.targetAcademicYear,
        monthKey: allocation.unit.monthKey,
        monthLabel: allocation.unit.monthLabel,
        feeType: allocation.unit.feeType,
        installmentKey: allocation.unit.installmentKey,
        installmentLabel: allocation.unit.installmentLabel,
        previousYearFeesRecord: allocation.unit.previousYearFeesRecord || null,
        originalAmount: Number(allocation.unit.originalAmount || allocation.unit.amount || 0),
        concessionType: allocation.unit.concessionType || "none",
        concessionValue: Number(allocation.unit.concessionValue || 0),
        concessionAmount: Number(allocation.unit.concessionAmount || 0),
        concessionReason: allocation.unit.concessionReason || "",
        netFeeAmount: Number(allocation.unit.amount || 0),
      };

      if ((allocation.currentPaise || 0) > 0) {
        savedAllocations.push({
          ...baseSavedAllocation,
          studentPaymentTransactionId: currentTransactionId,
          amount: fromPaise(allocation.currentPaise),
          source: allocation.unit.sourceRecordType === "previous_year_fees"
            ? "previous_year_balance"
            : "current_payment",
        });
      }

      if ((allocation.advancePaise || 0) > 0) {
        savedAllocations.push({
          ...baseSavedAllocation,
          studentPaymentTransactionId: advanceTransactionId,
          amount: fromPaise(allocation.advancePaise),
          source: "advance_application",
        });
      }
    });

    feesRecord.paidAmount = fromPaise(toPaise(feesRecord.paidAmount || 0) + amountPaise);
    feesRecord.status = resolveFeesStatus({
      paidAmount: feesRecord.paidAmount,
      totalFees: feesRecord.totalFees,
      dueDate: feesRecord.dueDate,
    });

    const historyFeeType = group.allocations.length === 1 ? group.allocations[0].unit.feeType : "general";
    const historyFeeLabel = group.allocations.length === 1
      ? group.allocations[0].unit.feeLabel
      : FEE_TYPE_LABELS.general;
    feesRecord.paymentHistory = feesRecord.paymentHistory || [];

    if (currentAmountPaise > 0) {
      feesRecord.paymentHistory.push({
        amount: fromPaise(currentAmountPaise),
        paymentDate,
        mode,
        feeType: historyFeeType,
        feeLabel: historyFeeLabel,
        transactionId: currentTransactionId,
        familyTransactionId,
        studentPaymentTransactionId: currentTransactionId,
        familyPaymentId,
        familyId: family._id,
        entryType: "family_payment",
        allocationSource: "family_collection",
        note,
        installments: currentInstallmentAllocations,
      });
    }

    if (advanceAmountPaise > 0) {
      feesRecord.paymentHistory.push({
        amount: fromPaise(advanceAmountPaise),
        paymentDate,
        mode: "advance",
        feeType: historyFeeType,
        feeLabel: historyFeeLabel,
        transactionId: advanceTransactionId,
        familyTransactionId,
        studentPaymentTransactionId: advanceTransactionId,
        familyPaymentId,
        familyId: family._id,
        entryType: "advance_application",
        allocationSource: "family_advance",
        note: note ? `Advance applied. ${note}` : "Advance applied",
        installments: advanceInstallmentAllocations,
      });
    }

    await feesRecord.save(session ? { session } : undefined);
  }

  return savedAllocations;
};

const upsertFamilyAdvance = async ({
  familyId,
  academicYear,
  amount,
  transactionId,
  familyPaymentId,
  note,
  session,
}) => {
  if (amount <= 0) {
    const existingAdvance = await getAdvanceBalance({ familyId, academicYear, session });
    return Number(existingAdvance?.advanceBalance || 0);
  }

  let advance = await getAdvanceBalance({ familyId, academicYear, session });
  if (!advance) {
    advance = new FamilyAdvance({
      familyId,
      academicYear,
      advanceBalance: 0,
      lots: [],
      history: [],
    });
  }

  advance.advanceBalance = fromPaise(toPaise(advance.advanceBalance || 0) + toPaise(amount));
  advance.lots.push({
    transactionId,
    familyPaymentId,
    originalAmount: amount,
    remainingAmount: amount,
    note,
  });
  advance.history.push({
    date: new Date(),
    transactionId,
    familyPaymentId,
    type: "created",
    amount,
    balanceAfter: advance.advanceBalance,
    note,
  });

  await advance.save(session ? { session } : undefined);
  return Number(advance.advanceBalance || 0);
};

const consumeFamilyAdvance = async ({
  familyId,
  academicYear,
  amount,
  transactionId,
  familyPaymentId,
  note,
  session,
}) => {
  const requestedPaise = toPaise(amount);
  if (requestedPaise <= 0) {
    const existingAdvance = await getAdvanceBalance({ familyId, academicYear, session });
    return Number(existingAdvance?.advanceBalance || 0);
  }

  const advance = await getAdvanceBalance({ familyId, academicYear, session });
  if (!advance) return 0;

  let remainingToApplyPaise = requestedPaise;
  (advance.lots || []).forEach((lot) => {
    if (remainingToApplyPaise <= 0) return;
    const lotRemainingPaise = toPaise(lot.remainingAmount || 0);
    const appliedFromLotPaise = Math.min(lotRemainingPaise, remainingToApplyPaise);
    if (appliedFromLotPaise <= 0) return;

    lot.remainingAmount = fromPaise(lotRemainingPaise - appliedFromLotPaise);
    remainingToApplyPaise -= appliedFromLotPaise;
  });

  const appliedPaise = requestedPaise - remainingToApplyPaise;
  if (appliedPaise <= 0) {
    return Number(advance.advanceBalance || 0);
  }

  advance.advanceBalance = fromPaise(Math.max(toPaise(advance.advanceBalance || 0) - appliedPaise, 0));
  advance.history.push({
    date: new Date(),
    transactionId,
    type: "applied",
    amount: fromPaise(appliedPaise),
    balanceAfter: advance.advanceBalance,
    note: note ? `Applied to family payment ${transactionId}. ${note}` : `Applied to family payment ${transactionId}`,
    familyPaymentId,
  });

  await advance.save(session ? { session } : undefined);
  return Number(advance.advanceBalance || 0);
};

const collectPayment = async ({
  familyId,
  academicYear = "",
  amount,
  paymentDate = new Date(),
  mode = "cash",
  note = "",
  startFromMonth = "",
  useAdvance = false,
  adminId = null,
  idempotencyKey = "",
} = {}) => {
  const normalizedIdempotencyKey = trimString(idempotencyKey);

  if (normalizedIdempotencyKey) {
    const existingPayment = await FamilyPayment.findOne({ idempotencyKey: normalizedIdempotencyKey });
    if (existingPayment) {
      return { familyPayment: existingPayment, alreadyProcessed: true };
    }
  }

  const session = await mongoose.startSession();
  try {
    let result = null;
    try {
    await session.withTransaction(async () => {
      const context = await resolveFamilyContext({
        familyId,
        academicYear,
        createMissingFees: true,
        session,
      });
      if (context.error) {
        throw Object.assign(new Error(context.error.message), { statusCode: context.error.statusCode });
      }

      const { demand } = await buildDemandWithLedgerIndex({ context, session });
      const existingAdvance = await getAdvanceBalance({
        familyId: context.family._id,
        academicYear: context.academicYear,
        session,
      });
      const allocation = allocateAcrossUnits({
        units: demand.units,
        amount,
        advanceBalance: existingAdvance?.advanceBalance || 0,
        paymentDate,
        months: demand.months,
        startFromMonth,
        useAdvance,
      });

      if (allocation.allocations.length === 0 && allocation.advanceCreated <= 0) {
        throw Object.assign(new Error("No pending family fees found for this payment"), { statusCode: 400 });
      }

      const familyTransactionId = generateFamilyTransactionId();
      const familyPayment = new FamilyPayment({
        familyId: context.family._id,
        academicYear: context.academicYear,
        transactionId: familyTransactionId,
        idempotencyKey: normalizedIdempotencyKey || undefined,
        amountCollected: Number(amount || 0),
        excessAfterCurrentDue: allocation.excessAfterCurrentDue,
        advanceApplied: allocation.advanceApplied,
        futureAdvanceAllocated: allocation.futureAdvanceAllocated,
        allocatedAmount: allocation.allocatedAmount,
        advanceCreated: allocation.advanceCreated,
        advanceBalanceAfter: allocation.advanceBalanceAfter,
        paymentDate,
        mode,
        note,
        startFromMonth,
        usedAdvanceExplicitly: Boolean(useAdvance || toPaise(amount) <= 0),
        createdBy: adminId,
        monthSummary: allocation.monthSummary,
        siblingSummary: summarizePaymentSharesBySibling({
          siblings: context.siblings,
          allocations: allocation.allocations,
        }),
        allocations: [],
      });

      await familyPayment.save({ session });

      const savedAllocations = await applyAllocationsToFeesRecords({
        allocations: allocation.allocations,
        family: context.family,
        familyPaymentId: familyPayment._id,
        familyTransactionId,
        paymentDate,
        mode,
        note,
        session,
      });

      await consumeFamilyAdvance({
        familyId: context.family._id,
        academicYear: context.academicYear,
        amount: allocation.advanceApplied,
        transactionId: familyTransactionId,
        familyPaymentId: familyPayment._id,
        note,
        session,
      });

      const advanceBalanceAfter = await upsertFamilyAdvance({
        familyId: context.family._id,
        academicYear: context.academicYear,
        amount: allocation.advanceCreated,
        transactionId: familyTransactionId,
        familyPaymentId: familyPayment._id,
        note,
        session,
      });

      familyPayment.allocations = savedAllocations;
      familyPayment.advanceBalanceAfter = advanceBalanceAfter;
      await familyPayment.save({ session });

      result = { familyPayment, allocation, advanceBalanceAfter };
    });
    } catch (transactionError) {
      // Concurrent submission with the same Idempotency-Key: the unique index
      // on FamilyPayment.idempotencyKey rejects the second insert with E11000.
      // Recover by returning the payment that won the race.
      if (
        normalizedIdempotencyKey &&
        (transactionError?.code === 11000 ||
          /duplicate key/i.test(transactionError?.message || "")) &&
        /idempotencyKey/i.test(transactionError?.message || "")
      ) {
        const existingPayment = await FamilyPayment.findOne({
          idempotencyKey: normalizedIdempotencyKey,
        });
        if (existingPayment) {
          return { familyPayment: existingPayment, alreadyProcessed: true };
        }
      }
      throw transactionError;
    }

    return result;
  } catch (error) {
    return {
      error: {
        statusCode: error.statusCode || 500,
        message: error.message || "Unable to collect family payment",
      },
    };
  } finally {
    await session.endSession();
  }
};

export const collectFamilyPayment = collectPayment;

export const listFamilyCards = async ({ academicYear = "" } = {}) => {
  const requestedAcademicYear = normalizeAcademicYear(academicYear) || trimString(academicYear);
  const students = await attachAcademicContextToStudents(await Student.find().sort({ firstName: 1, lastName: 1 }));
  const familySyncErrors = [];

  for (const student of students) {
    const expectedFamilyKey = buildFamilyKey(student);
    if (!student.familyId || (expectedFamilyKey && student.familyKey !== expectedFamilyKey)) {
      try {
        await ensureStudentFamily(student._id);
      } catch (error) {
        familySyncErrors.push({
          studentId: toId(student._id),
          reason: error.message || "Unable to sync family identity",
        });
        console.warn("Skipping family identity sync during fee card listing", {
          studentId: toId(student._id),
          error: error.stack || error.message,
        });
      }
    }
  }

  const refreshedStudents = await attachAcademicContextToStudents(await Student.find().sort({ firstName: 1, lastName: 1 }));
  const availableAcademicYears = [
    ...new Set(
      refreshedStudents
        .map((student) =>
          normalizeAcademicYear(student?.academicYear) ||
          trimString(student?.academicYear) ||
          normalizeAcademicYear(student?.currentEnrollment?.academicYear) ||
          trimString(student?.currentEnrollment?.academicYear) ||
          normalizeAcademicYear(student?.classSession?.academicYear) ||
          trimString(student?.classSession?.academicYear) ||
          normalizeAcademicYear(student?.class?.academicYear) ||
          trimString(student?.class?.academicYear)
        )
        .filter(Boolean)
    ),
  ];
  const resolvedAcademicYear =
    requestedAcademicYear ||
    availableAcademicYears[0] ||
    "";

  if (!resolvedAcademicYear) {
    return {
      academicYear: "",
      families: [],
      skippedFamilies: [],
      warning: "No active academic year could be resolved. Assign students to current class sessions first.",
    };
  }

  const eligibleStudents = refreshedStudents.filter((student) => {
    const status = trimString(student?.status).toLowerCase();
    const studentAcademicYear =
      normalizeAcademicYear(student?.academicYear) ||
      trimString(student?.academicYear) ||
      normalizeAcademicYear(student?.currentEnrollment?.academicYear) ||
      trimString(student?.currentEnrollment?.academicYear) ||
      normalizeAcademicYear(student?.classSession?.academicYear) ||
      trimString(student?.classSession?.academicYear) ||
      normalizeAcademicYear(student?.class?.academicYear) ||
      trimString(student?.class?.academicYear);
    return ACTIVE_STUDENT_STATUSES.has(status) && (!resolvedAcademicYear || studentAcademicYear === resolvedAcademicYear);
  });
  const familyIds = [...new Set(eligibleStudents.map((student) => toId(student.familyId)).filter(Boolean))];
  const families = await Family.find({ _id: { $in: familyIds } });
  const familyMap = new Map(families.map((family) => [toId(family._id), family]));
  const groupedStudents = eligibleStudents.reduce((groups, student) => {
    const familyId = toId(student.familyId);
    groups.set(familyId, [...(groups.get(familyId) || []), student]);
    return groups;
  }, new Map());

  const skippedFamilies = [];
  const cardResults = await mapWithConcurrency([...groupedStudents.entries()], 8, async ([familyId, familyStudents]) => {
    try {
      const statement = await buildFamilyStatement({
        familyId,
        academicYear: resolvedAcademicYear,
      });
      if (statement.error) {
        return {
          skipped: {
            familyId,
            reason: statement.error.message,
          },
        };
      }

      const family = familyMap.get(familyId);
      return {
        card: {
          familyId,
          displayName: family?.displayName || statement.family.displayName,
          fatherName: family?.fatherName || statement.family.fatherName,
          motherName: family?.motherName || statement.family.motherName,
          phone: family?.primaryPhone || statement.family.primaryPhone,
          academicYear: statement.academicYear,
          hasSiblings: familyStudents.length > 1,
          children: statement.siblings,
          totalPending: statement.totals.pendingAmount,
          totalCollected: statement.totals.paidAmount,
          totalDue: statement.totals.totalDue,
          advanceBalance: statement.totals.advanceBalance,
        },
      };
    } catch (error) {
      console.warn("Skipping family fee card", {
        familyId,
        academicYear: resolvedAcademicYear,
        error: error.stack || error.message,
      });
      return {
        skipped: {
          familyId,
          reason: error.message || "Unable to build family statement",
        },
      };
    }
  });

  const cards = cardResults.map((result) => result?.card).filter(Boolean);
  skippedFamilies.push(...cardResults.map((result) => result?.skipped).filter(Boolean));

  return {
    academicYear: resolvedAcademicYear,
    skippedFamilies: [...familySyncErrors, ...skippedFamilies],
    families: cards.sort((left, right) => Number(right.totalPending || 0) - Number(left.totalPending || 0)),
  };
};

export const searchFamilies = async ({ query = "", academicYear = "" } = {}) => {
  const normalizedQuery = trimString(query).toLowerCase();
  const cards = await listFamilyCards({ academicYear });
  if (!normalizedQuery) {
    return cards;
  }

  return {
    ...cards,
    families: cards.families.filter((family) => {
      const haystack = [
        family.displayName,
        family.fatherName,
        family.motherName,
        family.phone,
        ...(family.children || []).flatMap((child) => [
          child.name,
          child.admissionNo,
          child.classLabel,
        ]),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    }),
  };
};

export const resolveFamilyByStudent = async ({
  studentId,
  academicYear = "",
  includeStatement = false,
} = {}) => {
  const family = await ensureStudentFamily(studentId);
  if (!family) {
    return { error: { statusCode: 404, message: "Student not found" } };
  }

  // The statement is the most expensive operation in this service. Callers that only
  // need to resolve the family (e.g. to redirect to the family fee page, which then
  // fetches the statement itself) should not pay for building it twice.
  if (!includeStatement) {
    return {
      familyId: family._id,
      family,
      statement: null,
    };
  }

  const statement = await buildFamilyStatement({ familyId: family._id, academicYear });
  return {
    familyId: family._id,
    family,
    statement: statement.error ? null : statement,
  };
};

export const getFamilyPaymentReceipt = async ({ transactionId }) => {
  const payment = await FamilyPayment.findOne({ transactionId })
    .populate("familyId")
    .populate("siblingSummary.student", "firstName lastName studentId admissionNo")
    .lean();

  if (!payment) {
    return { error: { statusCode: 404, message: "Family payment not found" } };
  }

  return { payment };
};

export const listFamilyPayments = async ({ familyId, academicYear = "" } = {}) => {
  if (!familyId) {
    return { error: { statusCode: 400, message: "Family ID is required" } };
  }

  const query = { familyId };
  const normalizedAcademicYear = normalizeAcademicYear(academicYear) || trimString(academicYear);
  if (normalizedAcademicYear) {
    query.academicYear = normalizedAcademicYear;
  }

  const payments = await FamilyPayment.find(query)
    .sort({ paymentDate: -1, createdAt: -1 })
    .populate("siblingSummary.student", "firstName lastName studentId admissionNo")
    .lean();

  return { payments };
};

/**
 * Builds an aggregated monthly fees report for a list of students (typically a class).
 *
 * Reuses the per-student family ledger to compute monthly status, so allocations,
 * advance application, and previous-year balances stay consistent with the rest of
 * the fees module. No re-computation of business rules happens here — we just
 * filter/aggregate the already-correct per-student months.
 *
 * Input:
 *   - studentIds: array of Mongo ObjectIds (or strings)
 *   - academicYear: e.g. "2026-27" (optional — resolved per student if omitted)
 *   - monthKeys: e.g. ["APRIL","MAY"]. Empty/missing → include all 12 academic months.
 *
 * Output shape (see frontend exporters):
 *   {
 *     academicYear,
 *     months: [{ monthKey, monthLabel, dueDate }],
 *     students: [{
 *       _id, name, admissionNo, classLabel, phone, parentName,
 *       monthlyBreakdown: [{ monthKey, monthLabel, dueDate, status,
 *                            totalDue, paidAmount, endingBalance, lines: [...] }],
 *       reportTotals: { totalDue, paidAmount, pendingAmount }
 *     }],
 *     classTotals: { studentCount, totalDue, totalPaid, totalPending, collectionRate }
 *   }
 */
export const buildClassMonthlyFeesReport = async ({
  studentIds = [],
  academicYear = "",
  monthKeys = [],
} = {}) => {
  const idList = Array.from(
    new Set(
      (Array.isArray(studentIds) ? studentIds : [])
        .map((value) => trimString(value?._id || value))
        .filter(Boolean)
    )
  );

  if (idList.length === 0) {
    return { error: { statusCode: 400, message: "studentIds is required" } };
  }

  const requestedMonthKeys = new Set(
    (Array.isArray(monthKeys) ? monthKeys : [])
      .map((value) => String(value || "").trim().toUpperCase())
      .filter(Boolean)
  );

  // Fetch each student's statement in parallel. We rely on the canonical
  // buildStudentStatementFromFamilyLedger so the numbers match the per-student
  // and per-family views exactly.
  const statements = await Promise.all(
    idList.map(async (studentId) => {
      try {
        const result = await buildStudentStatementFromFamilyLedger({
          studentId,
          academicYear,
        });
        if (result?.error) {
          return { studentId, error: result.error };
        }
        return { studentId, statement: result };
      } catch (err) {
        return {
          studentId,
          error: { statusCode: 500, message: err?.message || "Failed to load statement" },
        };
      }
    })
  );

  const successful = statements.filter((entry) => entry.statement);
  if (successful.length === 0) {
    return {
      error: {
        statusCode: 404,
        message: "No fee statements could be generated for the selected students",
      },
    };
  }

  // Resolve the canonical academic year (prefer requested, else most common in results)
  const resolvedAcademicYear =
    normalizeAcademicYear(academicYear) ||
    trimString(academicYear) ||
    successful[0].statement.academicYear ||
    "";

  // Build the canonical month list (all 12), filtered if the caller restricted months.
  const allMonths = generateAcademicMonths(resolvedAcademicYear).map((month) => ({
    monthKey: month.key,
    monthLabel: month.label,
    dueDate: month.dueDate,
  }));
  const reportMonths =
    requestedMonthKeys.size === 0
      ? allMonths
      : allMonths.filter((month) => requestedMonthKeys.has(month.monthKey));

  if (reportMonths.length === 0) {
    return {
      error: { statusCode: 400, message: "No valid month keys provided" },
    };
  }
  const reportMonthKeySet = new Set(reportMonths.map((month) => month.monthKey));

  const studentsPayload = successful
    .map(({ statement }) => {
      const filteredMonths = (statement.months || []).filter((month) =>
        reportMonthKeySet.has(month.monthKey)
      );

      // Re-aggregate totals across the SELECTED months only (not the whole year).
      const reportTotals = filteredMonths.reduce(
        (acc, month) => {
          acc.totalDue += Number(month.totalDue || 0);
          acc.paidAmount += Number(month.paidAmount || 0);
          acc.pendingAmount += Number(month.endingBalance || 0);
          return acc;
        },
        { totalDue: 0, paidAmount: 0, pendingAmount: 0 }
      );

      const overallStatus =
        reportTotals.totalDue <= 0
          ? "pending"
          : reportTotals.pendingAmount <= 0
            ? "paid"
            : reportTotals.paidAmount > 0
              ? "partial"
              : filteredMonths.some((month) => month.status === "overdue")
                ? "overdue"
                : "pending";

      return {
        _id: statement.student?._id || statement.studentId,
        familyId: statement.familyId,
        name: statement.student?.name || "Student",
        admissionNo: statement.student?.admissionNo || "N/A",
        classLabel: statement.student?.classLabel || "",
        phone: statement.student?.parentPhone || "N/A",
        parentName: statement.student?.parentName || "N/A",
        monthlyBreakdown: filteredMonths.map((month) => ({
          monthKey: month.monthKey,
          monthLabel: month.monthLabel,
          dueDate: month.dueDate,
          status: month.status,
          totalDue: Number(month.totalDue || 0),
          paidAmount: Number(month.paidAmount || 0),
          endingBalance: Number(month.endingBalance || 0),
          lines: (month.lines || []).filter(
            (line) => line.type !== "advance" && line.type !== "payment"
          ),
        })),
        reportTotals,
        overallStatus,
      };
    })
    .sort((left, right) => String(left.name).localeCompare(String(right.name)));

  const classTotals = studentsPayload.reduce(
    (acc, student) => {
      acc.totalDue += student.reportTotals.totalDue;
      acc.totalPaid += student.reportTotals.paidAmount;
      acc.totalPending += student.reportTotals.pendingAmount;
      return acc;
    },
    { totalDue: 0, totalPaid: 0, totalPending: 0 }
  );

  return {
    academicYear: resolvedAcademicYear,
    months: reportMonths,
    students: studentsPayload,
    classTotals: {
      studentCount: studentsPayload.length,
      totalDue: classTotals.totalDue,
      totalPaid: classTotals.totalPaid,
      totalPending: classTotals.totalPending,
      collectionRate:
        classTotals.totalDue > 0
          ? Math.round((classTotals.totalPaid / classTotals.totalDue) * 100)
          : 0,
    },
    skipped: statements
      .filter((entry) => entry.error)
      .map((entry) => ({ studentId: entry.studentId, message: entry.error.message })),
  };
};
