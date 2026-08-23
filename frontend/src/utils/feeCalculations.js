export const FEE_FREQUENCY = {
  MONTHLY: "MONTHLY",
  YEARLY: "YEARLY",
  SCHEDULED: "SCHEDULED",
};

export const normalizeFeeFrequency = (value, fallback = FEE_FREQUENCY.MONTHLY) => {
  const normalizedValue = String(value || "").trim().toUpperCase();
  if (normalizedValue === FEE_FREQUENCY.SCHEDULED) return FEE_FREQUENCY.SCHEDULED;
  if (normalizedValue === FEE_FREQUENCY.YEARLY) return FEE_FREQUENCY.YEARLY;
  if (normalizedValue === FEE_FREQUENCY.MONTHLY) return FEE_FREQUENCY.MONTHLY;
  return fallback;
};

export const calculateInstallmentAmount = (totalFee = 0) =>
  Math.round(((Number(totalFee) || 0) / 12) * 100) / 100;

export const calculateExpectedStudentFeeTotal = (classRecord = {}, student = {}) => {
  const classFees = classRecord?.fees || {};
  const feeSettings = student?.feeSettings || {};
  const baseAdmissionFee = Number(classFees.admission || 0);
  const hasAdmissionOverride =
    feeSettings.admissionFeeOverride !== null &&
    feeSettings.admissionFeeOverride !== undefined &&
    feeSettings.admissionFeeOverride !== "";
  const admissionFee = hasAdmissionOverride
    ? Math.min(Math.max(Number(feeSettings.admissionFeeOverride) || 0, 0), baseAdmissionFee)
    : baseAdmissionFee;
  const tuitionConcession = feeSettings.tuitionConcession || {};
  const baseTuition = Number(classFees.tuition || 0);
  const tuition =
    tuitionConcession.isActive && tuitionConcession.type === "fixed"
      ? Math.max(baseTuition - Number(tuitionConcession.value || 0) * 12, 0)
      : tuitionConcession.isActive && tuitionConcession.type === "percentage"
        ? Math.max(baseTuition - (baseTuition * Math.min(Number(tuitionConcession.value || 0), 100)) / 100, 0)
        : baseTuition;

  return (
    tuition +
    admissionFee +
    Number(classFees.exam || 0) +
    (feeSettings.transportOpted === false ? 0 : Number(feeSettings.transportFee || 0)) +
    Number(classFees.books || 0)
  );
};

export const calculateSelectedMonthsTotal = (selectedMonthKeys = [], installments = []) => {
  const selectedKeys = new Set(selectedMonthKeys);
  return installments.reduce((total, installment) => {
    const installmentKey = installment.installmentKey || installment.monthKey;
    if (!selectedKeys.has(installmentKey)) return total;
    return total + Math.max(Number(installment.amount || 0) - Number(installment.paidAmount || 0), 0);
  }, 0);
};

export const calculateSelectedInstallmentsTotal = calculateSelectedMonthsTotal;

export const getInstallmentPaidAmount = (installments = []) =>
  installments.reduce((total, installment) => total + Number(installment.paidAmount || 0), 0);

export const getInstallmentRemainingAmount = (installments = []) =>
  installments.reduce(
    (total, installment) =>
      total + Math.max(Number(installment.amount || 0) - Number(installment.paidAmount || 0), 0),
    0
  );
