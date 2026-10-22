import Fees from "../models/Fees.js";
import { buildStudentStatementFromFamilyLedger } from "./familyFeeService.js";
import {
  attachAcademicContextToFeesRecords,
  calculateFeeBreakdownTotal,
  calculateStudentFeeBreakdown,
  getPreviousAcademicYear,
  normalizeStudentFeeSettings,
  resolveFeesRecordForStudent,
} from "./academicStructureService.js";
import {
  DEFAULT_EXAM_FEE_SCHEDULE,
  FEE_FREQUENCY,
  calculateSplitInstallmentAmounts,
  generateAcademicMonths,
  normalizeFeeFrequency,
} from "../utils/feeInstallmentEngine.js";
import { normalizeAcademicYear, trimString } from "../utils/requestValidation.js";

const MONTHLY_FEE_TYPES = ["tuition", "transport"];
const NON_INSTALLMENT_FEE_TYPES = ["admission", "books"];
const FEE_TYPE_LABELS = {
  tuition: "Tuition Fee",
  transport: "Transport Fee",
  exam: "Exam Fee",
  admission: "Admission Fee",
  books: "Books Fee",
  previous_year_balance: "Previous Year Balance",
  general: "General Fees",
};
const FEE_TYPE_ALIASES = {
  tuition: "tuition",
  "tuition-fee": "tuition",
  transport: "transport",
  "transport-fee": "transport",
  exam: "exam",
  "exam-fee": "exam",
  admission: "admission",
  "admission-fee": "admission",
  books: "books",
  "books-fee": "books",
  previous_year_balance: "previous_year_balance",
  "previous-year-balance": "previous_year_balance",
  general: "general",
  fees: "general",
  "school-fees": "general",
};

const normalizeFeeType = (value = "") =>
  FEE_TYPE_ALIASES[trimString(value).toLowerCase().replace(/\s+/g, "-")] || "";

const toPaise = (amount = 0) => Math.round((Number(amount) || 0) * 100);
const fromPaise = (amountPaise = 0) => Math.round(Number(amountPaise || 0)) / 100;
const toId = (value) => String(value?._id || value || "");
const normalizeMonthKey = (value = "") => trimString(value).toUpperCase();

const getStudentName = (student = {}) =>
  trimString(student.name) || `${trimString(student.firstName)} ${trimString(student.lastName)}`.trim() || "Student";

const getClassLabel = (classRecord = {}) => {
  if (!classRecord) return "N/A";
  if (classRecord.displayName) return classRecord.displayName;
  const className = trimString(classRecord.name || classRecord.classId?.name);
  const section = trimString(classRecord.section);
  const academicYear = trimString(classRecord.academicYear);
  const sectionLabel = section ? `-${section}` : "";
  const yearLabel = academicYear ? ` (${academicYear})` : "";
  return `${className}${sectionLabel}${yearLabel}`.trim() || "N/A";
};

const normalizeFeesRecord = async (feesRecord, isVirtual = false) => {
  if (isVirtual) return feesRecord;
  const [record] = await attachAcademicContextToFeesRecords([feesRecord]);
  return record;
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

const addDemandUnit = (units, payload) => {
  const amountPaise = Math.max(Number(payload.amountPaise || 0), 0);
  if (amountPaise <= 0) return;

  units.push({
    ...payload,
    amount: fromPaise(amountPaise),
    amountPaise,
    paidPaise: 0,
    outstandingPaise: amountPaise,
  });
};

const createMonthlyUnits = ({
  units,
  feeType,
  totalAmount,
  months,
  student,
  feesRecord,
  feeLabel,
  classRecord,
  installments = [],
}) => {
  const amounts = calculateSplitInstallmentAmounts(totalAmount, 12);
  const installmentMap = new Map(
    installments
      .filter((installment) => installment?.feeType === feeType)
      .map((installment) => [normalizeMonthKey(installment.installmentKey || installment.monthKey), installment])
  );

  months.forEach((month, index) => {
    const installment = installmentMap.get(month.key);
    addDemandUnit(units, {
      sourceRecordType: "current_fees",
      targetAcademicYear: feesRecord.academicYear,
      studentId: student._id,
      studentName: getStudentName(student),
      classLabel: getClassLabel(classRecord || feesRecord.class || student.class),
      feesRecord,
      feesRecordId: feesRecord._id,
      feeType,
      feeLabel,
      monthKey: month.key,
      monthLabel: month.label,
      monthIndex: month.index,
      dueDate: month.dueDate,
      installmentKey: month.key,
      installmentLabel: month.label,
      isInstallmentBacked: true,
      amountPaise: toPaise(installment?.amount ?? amounts[index] ?? 0),
      originalAmount:
        Number(installment?.originalAmount || 0) > 0
          ? Number(installment.originalAmount)
          : Number(installment?.amount ?? amounts[index] ?? 0),
      concessionType: installment?.concessionType || "none",
      concessionValue: Number(installment?.concessionValue || 0),
      concessionAmount: Number(installment?.concessionAmount || 0),
      concessionReason: installment?.concessionReason || "",
    });
  });
};

const createScheduledExamUnits = ({
  units,
  totalAmount,
  months,
  student,
  feesRecord,
  classRecord,
}) => {
  const schedule = DEFAULT_EXAM_FEE_SCHEDULE;
  const amounts = calculateSplitInstallmentAmounts(totalAmount, schedule.length || 1);

  schedule.forEach((term, index) => {
    const month = months.find((candidate) => candidate.key === term.dueMonth);
    if (!month) return;

    addDemandUnit(units, {
      sourceRecordType: "current_fees",
      targetAcademicYear: feesRecord.academicYear,
      studentId: student._id,
      studentName: getStudentName(student),
      classLabel: getClassLabel(classRecord || feesRecord.class || student.class),
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
      amountPaise: toPaise(amounts[index] || 0),
    });
  });
};

const createSingleMonthUnit = ({
  units,
  feeType,
  totalAmount,
  month,
  student,
  feesRecord,
  feeLabel,
  sourceRecordType = "current_fees",
  classRecord,
}) => {
  addDemandUnit(units, {
    sourceRecordType,
    targetAcademicYear: feesRecord.academicYear,
    studentId: student._id,
    studentName: getStudentName(student),
    classLabel: getClassLabel(classRecord || feesRecord.class || student.class),
    feesRecord,
    feesRecordId: feesRecord._id,
    feeType,
    feeLabel,
    monthKey: month.key,
    monthLabel: month.label,
    monthIndex: month.index,
    dueDate: month.dueDate,
    installmentKey: "",
    installmentLabel: "",
    isInstallmentBacked: false,
    amountPaise: toPaise(totalAmount),
  });
};

const buildCurrentYearUnits = ({ feesRecord, contextRecord, student, months }) => {
  const units = [];
  const { feeSettings, feeBreakdown, feeFrequency } = getEffectiveFeeData(contextRecord || feesRecord);

  feesRecord.feeSettings = feeSettings;
  feesRecord.feeBreakdown = feeBreakdown;
  feesRecord.totalFees = calculateFeeBreakdownTotal(feeBreakdown);

  MONTHLY_FEE_TYPES.forEach((feeType) => {
    const totalAmount = Number(feeBreakdown[feeType] || 0);
    if (totalAmount <= 0) return;

    if (feeFrequency[feeType] === FEE_FREQUENCY.YEARLY) {
      createSingleMonthUnit({
        units,
        feeType,
        totalAmount,
        month: months[0],
        student,
        feesRecord,
        feeLabel: FEE_TYPE_LABELS[feeType],
        classRecord: (contextRecord || feesRecord).class,
      });
      return;
    }

    createMonthlyUnits({
      units,
      feeType,
      totalAmount,
      months,
      student,
      feesRecord,
      feeLabel: FEE_TYPE_LABELS[feeType],
      classRecord: (contextRecord || feesRecord).class,
      installments: feesRecord.feeInstallments || [],
    });
  });

  const examTotal = Number(feeBreakdown.exam || 0);
  if (examTotal > 0) {
    if (feeFrequency.exam === FEE_FREQUENCY.YEARLY) {
      createSingleMonthUnit({
        units,
        feeType: "exam",
        totalAmount: examTotal,
        month: months[0],
        student,
        feesRecord,
        feeLabel: FEE_TYPE_LABELS.exam,
        classRecord: (contextRecord || feesRecord).class,
      });
    } else {
      createScheduledExamUnits({
        units,
        totalAmount: examTotal,
        months,
        student,
        feesRecord,
        classRecord: (contextRecord || feesRecord).class,
      });
    }
  }

  NON_INSTALLMENT_FEE_TYPES.forEach((feeType) => {
    const totalAmount = Number(feeBreakdown[feeType] || 0);
    if (totalAmount <= 0) return;

    createSingleMonthUnit({
      units,
      feeType,
      totalAmount,
      month: months[0],
      student,
      feesRecord,
      feeLabel: FEE_TYPE_LABELS[feeType],
      classRecord: (contextRecord || feesRecord).class,
    });
  });

  return units;
};

const buildPreviousYearUnits = async ({ student, months, academicYear, session }) => {
  const previousAcademicYear = getPreviousAcademicYear(academicYear);
  if (!previousAcademicYear) return { units: [], previousRecord: null };

  const previousQuery = Fees.findOne({
    student: student._id,
    academicYear: previousAcademicYear,
  });
  if (session) {
    previousQuery.session(session);
  }
  const previousRecord = await previousQuery;

  if (!previousRecord) return { units: [], previousRecord: null };

  const totalFees = Number(previousRecord.totalFees || 0);
  const paidAmount = Number(previousRecord.paidAmount || 0);
  const outstanding = Math.max(totalFees - paidAmount, 0);
  if (outstanding <= 0) return { units: [], previousRecord };

  const units = [];
  createSingleMonthUnit({
    units,
    feeType: "previous_year_balance",
    totalAmount: outstanding,
    month: months[0],
    student,
    feesRecord: previousRecord,
    feeLabel: FEE_TYPE_LABELS.previous_year_balance,
    sourceRecordType: "previous_year_fees",
  });

  return { units, previousRecord };
};

const getPaymentHistoryWithFallback = (feesRecord) => {
  const history = Array.isArray(feesRecord?.paymentHistory) ? feesRecord.paymentHistory : [];
  const historyTotal = history.reduce((total, payment) => total + Number(payment?.amount || 0), 0);
  const paidAmount = Number(feesRecord?.paidAmount || 0);
  const missingAmount = Math.max(paidAmount - historyTotal, 0);

  if (missingAmount <= 0) {
    return history;
  }

  return [
    ...history,
    {
      amount: missingAmount,
      feeType: "general",
      paymentDate: feesRecord?.updatedAt || new Date(),
    },
  ];
};

const sortDemandUnitsForAllocation = (units = []) =>
  units
    .filter((unit) => Math.max(unit.amountPaise - unit.paidPaise, 0) > 0)
    .sort((left, right) => {
      if (left.sourceRecordType !== right.sourceRecordType) {
        return left.sourceRecordType === "previous_year_fees" ? -1 : 1;
      }
      if (left.monthIndex !== right.monthIndex) return left.monthIndex - right.monthIndex;
      return `${left.feeType}`.localeCompare(`${right.feeType}`);
    });

const allocateAmountAcrossUnits = (units = [], amountPaise = 0) => {
  let remainingPaise = Math.max(Number(amountPaise || 0), 0);
  if (remainingPaise <= 0) return 0;

  for (const unit of sortDemandUnitsForAllocation(units)) {
    if (remainingPaise <= 0) break;

    const outstandingPaise = Math.max(unit.amountPaise - unit.paidPaise, 0);
    if (outstandingPaise <= 0) continue;

    const allocationPaise = Math.min(outstandingPaise, remainingPaise);
    unit.paidPaise += allocationPaise;
    remainingPaise -= allocationPaise;
  }

  return remainingPaise;
};

const applyInstallmentAllocations = (units, payment, unitMap) => {
  const allocations = Array.isArray(payment?.installments) ? payment.installments : [];
  allocations.forEach((allocation) => {
    const feeType = normalizeFeeType(allocation?.feeType || payment?.feeType);
    const installmentKey = normalizeMonthKey(
      allocation?.installmentKey || allocation?.monthKey || allocation?.dueMonth
    );
    if (!feeType || !installmentKey) return;

    const unit = unitMap.get(`${feeType}:${installmentKey}`);
    if (!unit) return;

    const allocationPaise = toPaise(allocation?.paidAmount || allocation?.amount || 0);
    if (allocationPaise <= 0) return;

    const outstandingPaise = Math.max(unit.amountPaise - unit.paidPaise, 0);
    const appliedPaise = Math.min(outstandingPaise, allocationPaise);
    unit.paidPaise += appliedPaise;
  });
};

const applyPaymentHistoryToUnits = ({ units, feesRecord }) => {
  const payments = getPaymentHistoryWithFallback(feesRecord);
  const unitMap = new Map();

  units.forEach((unit) => {
    const feeType = normalizeFeeType(unit.feeType);
    const installmentKey = normalizeMonthKey(unit.installmentKey || unit.monthKey || unit.dueMonth);
    if (feeType && installmentKey) {
      unitMap.set(`${feeType}:${installmentKey}`, unit);
    }
  });

  payments.forEach((payment) => {
    const paymentAmountPaise = toPaise(payment?.amount || 0);
    if (paymentAmountPaise <= 0) return;

    if (Array.isArray(payment?.installments) && payment.installments.length > 0) {
      applyInstallmentAllocations(units, payment, unitMap);
      return;
    }

    const feeType = normalizeFeeType(payment?.feeType);
    if (feeType && feeType !== "general") {
      allocateAmountAcrossUnits(
        units.filter((unit) => normalizeFeeType(unit.feeType) === feeType),
        paymentAmountPaise
      );
      return;
    }

    allocateAmountAcrossUnits(units, paymentAmountPaise);
  });

  units.forEach((unit) => {
    unit.paidPaise = Math.min(unit.amountPaise, unit.paidPaise);
    unit.outstandingPaise = Math.max(unit.amountPaise - unit.paidPaise, 0);
  });
};

const generateMonthlyLedger = ({ months, units }) => {
  const monthMap = new Map(
    months.map((month) => [
      month.key,
      {
        monthKey: month.key,
        monthLabel: month.label,
        dueDate: month.dueDate,
        lines: [],
        totalDuePaise: 0,
        paidPaise: 0,
      },
    ])
  );

  units.forEach((unit) => {
    const month = monthMap.get(unit.monthKey);
    if (!month) return;

    month.totalDuePaise += unit.amountPaise;
    month.paidPaise += unit.paidPaise;
    if (unit.feeType === "tuition" && Number(unit.concessionAmount || 0) > 0) {
      month.lines.push(
        {
          type: "fee",
          label: "Tuition Fee",
          amount: Number(unit.originalAmount || 0),
        },
        {
          type: "concession",
          label: unit.concessionReason
            ? `Tuition Concession (${unit.concessionReason})`
            : "Tuition Concession",
          amount: -Number(unit.concessionAmount || 0),
        }
      );
    } else {
      month.lines.push({
        type: unit.sourceRecordType === "previous_year_fees" ? "previous_year_balance" : "fee",
        label: unit.feeLabel || FEE_TYPE_LABELS[unit.feeType] || "Fees",
        amount: fromPaise(unit.amountPaise),
      });
    }
  });

  let carriedBalancePaise = 0;
  return months.map((month, monthIndex) => {
    const summary = monthMap.get(month.key);
    const openingCarriedPaise = carriedBalancePaise;
    const totalDuePaise = openingCarriedPaise + summary.totalDuePaise;
    const endingBalancePaise = Math.max(totalDuePaise - summary.paidPaise, 0);
    carriedBalancePaise = endingBalancePaise;

    const isOverdue = endingBalancePaise > 0 && new Date() > new Date(month.dueDate);
    // Once an elapsed month's unpaid balance is carried forward into a later month, that
    // month is settled/closed and reads "paid"; its outstanding now lives in the carried
    // balance of the following month.
    const balanceForwarded =
      endingBalancePaise > 0 && monthIndex < months.length - 1 && new Date() > new Date(month.dueDate);
    const status =
      (endingBalancePaise <= 0 && totalDuePaise > 0) || balanceForwarded
        ? "paid"
        : summary.paidPaise > 0
          ? "partial"
          : isOverdue
            ? "overdue"
            : "pending";

    const lines = [];
    if (openingCarriedPaise > 0) {
      lines.push({
        type: "carried_balance",
        label: "Carried Forward Balance",
        amount: fromPaise(openingCarriedPaise),
      });
    }
    lines.push(...summary.lines);
    if (summary.paidPaise > 0) {
      lines.push({
        type: "payment",
        label: "Paid / Allocated",
        amount: -fromPaise(summary.paidPaise),
      });
    }

    return {
      monthKey: summary.monthKey,
      monthLabel: summary.monthLabel,
      dueDate: summary.dueDate,
      status,
      totalDue: fromPaise(totalDuePaise),
      carriedBalance: fromPaise(openingCarriedPaise),
      paidAmount: fromPaise(summary.paidPaise),
      endingBalance: fromPaise(endingBalancePaise),
      lines,
    };
  });
};

const calculateTotals = (units = [], months = []) => {
  const totalDuePaise = units.reduce((total, unit) => total + unit.amountPaise, 0);
  const paidPaise = units.reduce((total, unit) => total + unit.paidPaise, 0);
  const pendingPaise = Math.max(totalDuePaise - paidPaise, 0);
  // Month balances are cumulative; overdue is the carried balance at the last overdue month.
  const overduePaise = months.some((month) => month.status === "overdue")
    ? months.reduce((latest, month) => (month.status === "overdue" ? toPaise(month.endingBalance || 0) : latest), 0)
    : 0;

  return {
    totalDue: fromPaise(totalDuePaise),
    paidAmount: fromPaise(paidPaise),
    pendingAmount: fromPaise(pendingPaise),
    overdueAmount: fromPaise(overduePaise),
  };
};

const buildStudentDemand = async ({ feesRecord, contextRecord, student, academicYear, session }) => {
  const months = generateAcademicMonths(academicYear);
  const currentUnits = buildCurrentYearUnits({
    feesRecord,
    contextRecord: contextRecord || feesRecord,
    student,
    months,
  });
  const { units: previousUnits, previousRecord } = await buildPreviousYearUnits({
    student,
    months,
    academicYear,
    session,
  });

  return {
    months,
    units: [...previousUnits, ...currentUnits],
    previousRecord,
  };
};

export const buildStudentStatement = async ({ studentId, academicYear = "" } = {}) => {
  const requestedAcademicYear = normalizeAcademicYear(academicYear) || trimString(academicYear);
  const familyLedgerStatement = await buildStudentStatementFromFamilyLedger({
    studentId,
    academicYear: requestedAcademicYear,
  });
  if (!familyLedgerStatement.error) {
    return familyLedgerStatement;
  }

  const result = await resolveFeesRecordForStudent(studentId, {
    createIfMissing: false,
    academicYear: requestedAcademicYear,
    studentSelect:
      "name firstName lastName studentId admissionNo parentName parentPhone phone feeSettings",
  });

  if (result.error || !result.feesRecord) {
    return { error: result.error || { statusCode: 404, message: "Fees record not found" } };
  }

  const feesRecord = await normalizeFeesRecord(result.feesRecord, result.isVirtual);
  const student = feesRecord.student || {};
  const resolvedAcademicYear =
    normalizeAcademicYear(feesRecord.academicYear) ||
    trimString(feesRecord.academicYear) ||
    trimString(feesRecord.class?.academicYear) ||
    requestedAcademicYear ||
    "";

  const { months, units } = await buildStudentDemand({
    feesRecord,
    contextRecord: feesRecord,
    student,
    academicYear: resolvedAcademicYear,
  });

  const unitsByRecord = new Map();
  units.forEach((unit) => {
    const recordId = toId(unit.feesRecordId);
    const existing = unitsByRecord.get(recordId) || { units: [], record: unit.feesRecord };
    existing.units.push(unit);
    unitsByRecord.set(recordId, existing);
  });

  unitsByRecord.forEach((group) => {
    applyPaymentHistoryToUnits({ units: group.units, feesRecord: group.record });
  });

  const ledgerMonths = generateMonthlyLedger({ months, units });
  const totals = calculateTotals(units, ledgerMonths);

  return {
    studentId,
    academicYear: resolvedAcademicYear,
    student: {
      _id: student._id,
      name: getStudentName(student),
      admissionNo: student.admissionNo || student.studentId || "N/A",
      parentName: student.parent?.fatherName || student.parentName || student.parent?.motherName || "N/A",
      parentPhone: student.parent?.phone || student.parentPhone || student.phone || "N/A",
      classLabel: getClassLabel(feesRecord.class || student.class || student.classSession),
    },
    totals,
    months: ledgerMonths,
  };
};

