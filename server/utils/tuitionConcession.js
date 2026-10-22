import { trimString } from "./requestValidation.js";

export const TUITION_CONCESSION_TYPES = Object.freeze(["none", "fixed", "percentage"]);

const toPaise = (amount = 0) => Math.round((Number(amount) || 0) * 100);
const fromPaise = (amountPaise = 0) => Math.round(Number(amountPaise || 0)) / 100;

export const normalizeTuitionConcession = (concession = {}) => {
  const requestedType = trimString(concession?.type).toLowerCase();
  const type = TUITION_CONCESSION_TYPES.includes(requestedType) ? requestedType : "none";
  const rawValue = Math.max(Number(concession?.value || 0) || 0, 0);
  const value = type === "fixed" ? fromPaise(toPaise(rawValue)) : rawValue;

  return {
    type,
    value: type === "none" ? 0 : value,
    reason: trimString(concession?.reason),
    isActive: type !== "none" && concession?.isActive !== false,
  };
};

export const splitAmountIntoInstallments = (totalAmount = 0, installmentCount = 12) => {
  const count = Math.max(Number(installmentCount) || 0, 1);
  const totalPaise = Math.max(toPaise(totalAmount), 0);
  const basePaise = Math.floor(totalPaise / count);
  let remainderPaise = totalPaise - basePaise * count;

  return Array.from({ length: count }, () => {
    const amountPaise = basePaise + (remainderPaise > 0 ? 1 : 0);
    if (remainderPaise > 0) remainderPaise -= 1;
    return fromPaise(amountPaise);
  });
};

export const calculateTuitionInstallmentAmounts = ({
  annualTuition = 0,
  concession = {},
  installmentCount = 12,
} = {}) => {
  const normalizedConcession = normalizeTuitionConcession(concession);

  return splitAmountIntoInstallments(annualTuition, installmentCount).map((originalAmount) => {
    let concessionAmount = 0;

    if (normalizedConcession.isActive && normalizedConcession.type === "fixed") {
      concessionAmount = Math.min(normalizedConcession.value, originalAmount);
    } else if (normalizedConcession.isActive && normalizedConcession.type === "percentage") {
      concessionAmount = Math.min(
        fromPaise((toPaise(originalAmount) * Math.min(normalizedConcession.value, 100)) / 100),
        originalAmount
      );
    }

    const amount = fromPaise(toPaise(originalAmount) - toPaise(concessionAmount));

    return {
      originalAmount,
      concessionType: normalizedConcession.isActive ? normalizedConcession.type : "none",
      concessionValue: normalizedConcession.isActive ? normalizedConcession.value : 0,
      concessionAmount,
      concessionReason: normalizedConcession.isActive ? normalizedConcession.reason : "",
      amount: Math.max(amount, 0),
    };
  });
};

export const calculateTuitionConcessionSummary = (annualTuition = 0, concession = {}) => {
  const installments = calculateTuitionInstallmentAmounts({ annualTuition, concession });

  return installments.reduce(
    (summary, installment) => ({
      originalTuition: summary.originalTuition + installment.originalAmount,
      concessionAmount: summary.concessionAmount + installment.concessionAmount,
      finalTuition: summary.finalTuition + installment.amount,
    }),
    { originalTuition: 0, concessionAmount: 0, finalTuition: 0 }
  );
};
