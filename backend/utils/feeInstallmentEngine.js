import { parseAcademicYear, trimString } from "./requestValidation.js";
import { calculateTuitionInstallmentAmounts } from "./tuitionConcession.js";

export const MONTHLY_FEE_TYPES = ["tuition", "transport"];
export const SCHEDULED_FEE_TYPES = ["exam"];
export const INSTALLMENT_FEE_TYPES = [...MONTHLY_FEE_TYPES, ...SCHEDULED_FEE_TYPES];
export const INSTALLMENT_STATUS = Object.freeze({
  PAID: "PAID",
  PENDING: "PENDING",
  PARTIAL: "PARTIAL",
  OVERDUE: "OVERDUE",
});
export const FEE_FREQUENCY = Object.freeze({
  MONTHLY: "MONTHLY",
  YEARLY: "YEARLY",
  SCHEDULED: "SCHEDULED",
});
export const FIXED_FEE_FREQUENCY = Object.freeze({
  tuition: FEE_FREQUENCY.MONTHLY,
  transport: FEE_FREQUENCY.MONTHLY,
  exam: FEE_FREQUENCY.SCHEDULED,
});
export const DEFAULT_EXAM_FEE_SCHEDULE = Object.freeze([
  { key: "HALF_YEARLY_EXAM", label: "Half Yearly Exam", dueMonth: "SEPTEMBER" },
  { key: "WINTER_EXAM", label: "Winter Exam", dueMonth: "DECEMBER" },
  { key: "FINAL_EXAM", label: "Final Exam", dueMonth: "MARCH" },
]);
export const DEFAULT_SCHEDULED_FEE_CONFIG = Object.freeze({
  exam: DEFAULT_EXAM_FEE_SCHEDULE,
});
export const ACADEMIC_MONTHS = Object.freeze([
  { key: "APRIL", label: "April", calendarMonth: 3 },
  { key: "MAY", label: "May", calendarMonth: 4 },
  { key: "JUNE", label: "June", calendarMonth: 5 },
  { key: "JULY", label: "July", calendarMonth: 6 },
  { key: "AUGUST", label: "August", calendarMonth: 7 },
  { key: "SEPTEMBER", label: "September", calendarMonth: 8 },
  { key: "OCTOBER", label: "October", calendarMonth: 9 },
  { key: "NOVEMBER", label: "November", calendarMonth: 10 },
  { key: "DECEMBER", label: "December", calendarMonth: 11 },
  { key: "JANUARY", label: "January", calendarMonth: 0 },
  { key: "FEBRUARY", label: "February", calendarMonth: 1 },
  { key: "MARCH", label: "March", calendarMonth: 2 },
]);

const FEE_TYPE_ALIASES = {
  tuition: "tuition",
  transport: "transport",
  exam: "exam",
};

const normalizeInstallmentKey = (value) =>
  trimString(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

export const normalizeFeeFrequencyValue = (value, defaultValue = FEE_FREQUENCY.MONTHLY) => {
  const normalizedValue = trimString(value).toUpperCase().replace(/[\s-]+/g, "_");
  if (normalizedValue === FEE_FREQUENCY.SCHEDULED) {
    return FEE_FREQUENCY.SCHEDULED;
  }
  if (normalizedValue === FEE_FREQUENCY.YEARLY) {
    return FEE_FREQUENCY.YEARLY;
  }
  if (normalizedValue === FEE_FREQUENCY.MONTHLY) {
    return FEE_FREQUENCY.MONTHLY;
  }
  return defaultValue;
};

export const normalizeFeeFrequency = () => ({ ...FIXED_FEE_FREQUENCY });

export const normalizeInstallmentFeeType = (value) =>
  FEE_TYPE_ALIASES[trimString(value).toLowerCase()] || "";

const getInstallmentIdentity = (installment = {}) =>
  normalizeInstallmentKey(installment.installmentKey || installment.monthKey || installment.dueMonth);

export const generateAcademicMonths = (academicYear) => {
  const parsedYear = parseAcademicYear(academicYear);
  const startYear = parsedYear?.startYear || new Date().getFullYear();

  return ACADEMIC_MONTHS.map((month, index) => {
    const calendarYear = index <= 8 ? startYear : startYear + 1;
    const dueDate = new Date(calendarYear, month.calendarMonth + 1, 0, 23, 59, 59, 999);

    return {
      ...month,
      index,
      academicYear: parsedYear ? `${parsedYear.startYear}-${String(parsedYear.endYear).slice(-2)}` : trimString(academicYear),
      calendarYear,
      dueDate,
    };
  });
};

export const calculateSplitInstallmentAmounts = (totalAmount = 0, installmentCount = 1) => {
  const count = Math.max(Number(installmentCount) || 0, 1);
  const totalPaise = Math.round((Number(totalAmount) || 0) * 100);
  const basePaise = Math.floor(totalPaise / count);
  let remainderPaise = totalPaise - basePaise * count;

  return Array.from({ length: count }, () => {
    const amountPaise = basePaise + (remainderPaise > 0 ? 1 : 0);
    remainderPaise -= remainderPaise > 0 ? 1 : 0;
    return amountPaise / 100;
  });
};

export const calculateMonthlyInstallmentAmounts = (totalAmount = 0) =>
  calculateSplitInstallmentAmounts(totalAmount, 12);

export const generateExamFeeSchedule = (schedule = DEFAULT_EXAM_FEE_SCHEDULE) =>
  (Array.isArray(schedule) ? schedule : DEFAULT_EXAM_FEE_SCHEDULE)
    .map((installment, index) => {
      const dueMonth = normalizeInstallmentKey(
        installment?.dueMonth || installment?.monthKey || installment?.month
      );
      const fallbackLabel = `Exam Installment ${index + 1}`;
      const label = trimString(installment?.label || installment?.installmentLabel || installment?.name) || fallbackLabel;
      const key = normalizeInstallmentKey(installment?.key || installment?.installmentKey || label);
      const fixedAmount = Number(installment?.amount);

      return {
        key: key || normalizeInstallmentKey(`${fallbackLabel}_${dueMonth}`),
        label,
        dueMonth,
        amount: Number.isFinite(fixedAmount) && fixedAmount >= 0 ? fixedAmount : null,
      };
    })
    .filter((installment) => installment.key && installment.dueMonth);

export const resolveInstallmentStatus = ({ amount = 0, paidAmount = 0, dueDate = null, asOfDate = new Date() }) => {
  const installmentAmount = Number(amount) || 0;
  const installmentPaidAmount = Number(paidAmount) || 0;

  if (installmentAmount <= 0 || installmentPaidAmount >= installmentAmount) {
    return INSTALLMENT_STATUS.PAID;
  }

  if (installmentPaidAmount > 0) {
    return INSTALLMENT_STATUS.PARTIAL;
  }

  return dueDate && new Date(asOfDate) > new Date(dueDate)
    ? INSTALLMENT_STATUS.OVERDUE
    : INSTALLMENT_STATUS.PENDING;
};

const getMonthByKey = (months = [], monthKey = "") =>
  months.find((month) => month.key === normalizeInstallmentKey(monthKey)) || null;

const buildFeeInstallmentBlueprints = ({
  feeType,
  totalAmount,
  frequency,
  months,
  scheduledFeeConfig = {},
  tuitionConcession = {},
}) => {
  if (totalAmount <= 0) {
    return [];
  }

  if (MONTHLY_FEE_TYPES.includes(feeType)) {
    const tuitionAmounts =
      feeType === "tuition"
        ? calculateTuitionInstallmentAmounts({
            annualTuition: totalAmount,
            concession: tuitionConcession,
            installmentCount: months.length,
          })
        : null;
    const monthlyAmounts = tuitionAmounts
      ? tuitionAmounts.map((installment) => installment.amount)
      : calculateMonthlyInstallmentAmounts(totalAmount);

    return months.map((month) => {
      const tuitionSnapshot = tuitionAmounts?.[month.index];
      const amount = monthlyAmounts[month.index] || 0;

      return {
        feeType,
        frequency,
        installmentKey: month.key,
        installmentLabel: month.label,
        dueMonth: month.key,
        monthKey: month.key,
        monthLabel: month.label,
        monthIndex: month.index,
        academicYear: month.academicYear,
        amount,
        originalAmount: tuitionSnapshot?.originalAmount ?? amount,
        concessionType: tuitionSnapshot?.concessionType || "none",
        concessionValue: tuitionSnapshot?.concessionValue || 0,
        concessionAmount: tuitionSnapshot?.concessionAmount || 0,
        concessionReason: tuitionSnapshot?.concessionReason || "",
        dueDate: month.dueDate,
      };
    });
  }

  if (SCHEDULED_FEE_TYPES.includes(feeType) && frequency === FEE_FREQUENCY.SCHEDULED) {
    const configuredSchedule = Array.isArray(scheduledFeeConfig?.[feeType])
      ? scheduledFeeConfig[feeType]
      : DEFAULT_SCHEDULED_FEE_CONFIG[feeType];
    const schedule = feeType === "exam"
      ? generateExamFeeSchedule(configuredSchedule)
      : [];
    const splitAmounts = calculateSplitInstallmentAmounts(totalAmount, schedule.length || 1);

    return schedule
      .map((installment, index) => {
        const month = getMonthByKey(months, installment.dueMonth);
        if (!month) {
          return null;
        }

        const amount = installment.amount === null ? splitAmounts[index] || 0 : installment.amount;

        return {
          feeType,
          frequency,
          installmentKey: installment.key,
          installmentLabel: installment.label,
          dueMonth: month.key,
          monthKey: month.key,
          monthLabel: month.label,
          monthIndex: month.index,
          academicYear: month.academicYear,
          amount,
          dueDate: month.dueDate,
        };
      })
      .filter(Boolean);
  }

  return [];
};

export const buildFeeInstallments = ({
  academicYear,
  feeBreakdown = {},
  feeFrequency = {},
  existingInstallments = [],
  paymentHistory = [],
  scheduledFeeConfig = DEFAULT_SCHEDULED_FEE_CONFIG,
  asOfDate = new Date(),
  tuitionConcession = {},
}) => {
  const normalizedFrequency = normalizeFeeFrequency(feeFrequency);
  const months = generateAcademicMonths(academicYear);
  const blueprints = INSTALLMENT_FEE_TYPES.flatMap((feeType) =>
    buildFeeInstallmentBlueprints({
      feeType,
      totalAmount: Number(
        feeType === "tuition"
          ? feeBreakdown?.originalTuition ?? feeBreakdown?.tuition ?? 0
          : feeBreakdown?.[feeType] || 0
      ),
      frequency: normalizedFrequency[feeType],
      months,
      scheduledFeeConfig,
      tuitionConcession,
    })
  );
  const existingMap = new Map();
  const existingInstallmentMap = new Map();
  const existingFeeTypes = new Set();

  existingInstallments.forEach((installment) => {
    const feeType = normalizeInstallmentFeeType(installment?.feeType);
    const installmentKey = getInstallmentIdentity(installment);
    if (feeType && installmentKey) {
      existingFeeTypes.add(feeType);
      existingMap.set(`${feeType}:${installmentKey}`, Number(installment.paidAmount || 0));
      existingInstallmentMap.set(`${feeType}:${installmentKey}`, installment);
    }
  });

  paymentHistory.forEach((payment) => {
    const feeType = normalizeInstallmentFeeType(payment?.feeType);
    const paymentAmount = Number(payment?.amount || 0);

    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
      return;
    }

    if (Array.isArray(payment?.installments) && payment.installments.length > 0) {
      payment.installments.forEach((allocation) => {
        const allocationFeeType = normalizeInstallmentFeeType(allocation?.feeType) || feeType;
        if (existingFeeTypes.has(allocationFeeType)) {
          return;
        }
        const installmentKey = getInstallmentIdentity(allocation);
        const allocationAmount = Number(allocation?.paidAmount || 0);
        if (allocationFeeType && installmentKey && allocationAmount > 0) {
          const mapKey = `${allocationFeeType}:${installmentKey}`;
          existingMap.set(mapKey, (existingMap.get(mapKey) || 0) + allocationAmount);
        }
      });
      return;
    }

    if (!feeType) {
      return;
    }

    if (existingFeeTypes.has(feeType)) {
      return;
    }

    let remainingPayment = paymentAmount;
    blueprints
      .filter((installment) => installment.feeType === feeType)
      .sort((left, right) => Number(left.monthIndex || 0) - Number(right.monthIndex || 0))
      .forEach((installment) => {
        if (remainingPayment <= 0) {
          return;
        }

        const installmentAmount = Number(installment.amount || 0);
        const mapKey = `${feeType}:${installment.installmentKey}`;
        const currentPaid = existingMap.get(mapKey) || 0;
        const payableAmount = Math.max(installmentAmount - currentPaid, 0);
        const allocationAmount = Math.min(payableAmount, remainingPayment);
        existingMap.set(mapKey, currentPaid + allocationAmount);
        remainingPayment -= allocationAmount;
      });
  });

  return blueprints.map((installment) => {
    const mapKey = `${installment.feeType}:${installment.installmentKey}`;
    const existingInstallment = existingInstallmentMap.get(mapKey);
    const existingDueDate = existingInstallment?.dueDate || installment.dueDate;
    const preserveSnapshot =
      existingInstallment &&
      (Number(existingInstallment.paidAmount || 0) > 0 ||
        (existingDueDate && new Date(existingDueDate) < new Date(asOfDate)));
    const snapshot = preserveSnapshot
      ? {
          ...installment,
          amount: Number(existingInstallment.amount || 0),
          originalAmount:
            Number(existingInstallment.originalAmount || 0) > 0
              ? Number(existingInstallment.originalAmount)
              : Number(existingInstallment.amount || 0),
          concessionType: existingInstallment.concessionType || "none",
          concessionValue: Number(existingInstallment.concessionValue || 0),
          concessionAmount: Number(existingInstallment.concessionAmount || 0),
          concessionReason: existingInstallment.concessionReason || "",
        }
      : installment;
    const amount = Number(snapshot.amount || 0);
    const paidAmount = Math.min(
      amount,
      Math.max(existingMap.get(mapKey) || 0, 0)
    );

    return {
      ...snapshot,
      paidAmount,
      dueAmount: Math.max(amount - paidAmount, 0),
      status: resolveInstallmentStatus({ amount, paidAmount, dueDate: snapshot.dueDate, asOfDate }),
      paidAt: paidAmount >= amount ? new Date() : null,
      receiptId: existingInstallment?.receiptId || "",
    };
  });
};

export const summarizeInstallmentsByFeeType = (installments = []) =>
  installments.reduce((summary, installment) => {
    const feeType = normalizeInstallmentFeeType(installment?.feeType);
    if (!feeType) {
      return summary;
    }

    if (!summary[feeType]) {
      summary[feeType] = {
        amount: 0,
        paid: 0,
        remaining: 0,
        overdue: 0,
        months: 0,
        paidMonths: 0,
        pendingMonths: 0,
        partialMonths: 0,
        overdueMonths: 0,
      };
    }

    const amount = Number(installment.amount || 0);
    const paid = Number(installment.paidAmount || 0);
    const due = Math.max(amount - paid, 0);
    summary[feeType].amount += amount;
    summary[feeType].paid += paid;
    summary[feeType].remaining += due;
    summary[feeType].overdue += installment.status === INSTALLMENT_STATUS.OVERDUE ? due : 0;
    summary[feeType].months += 1;
    summary[feeType].paidMonths += installment.status === INSTALLMENT_STATUS.PAID ? 1 : 0;
    summary[feeType].pendingMonths += installment.status === INSTALLMENT_STATUS.PENDING ? 1 : 0;
    summary[feeType].partialMonths += installment.status === INSTALLMENT_STATUS.PARTIAL ? 1 : 0;
    summary[feeType].overdueMonths += installment.status === INSTALLMENT_STATUS.OVERDUE ? 1 : 0;

    return summary;
  }, {});
