import React from "react";
import { Check } from "lucide-react";
import InstallmentStatusBadge from "./InstallmentStatusBadge";
import { getInstallmentStatusClass } from "../../../utils/installmentStatus";

const ExamInstallmentCard = ({
  installment,
  isSelected,
  onToggle,
  formatCurrency,
}) => {
  const installmentKey = installment.installmentKey || installment.monthKey;
  const remaining = Math.max(
    Number(installment.amount || 0) - Number(installment.paidAmount || 0),
    0
  );
  const isPaid = installment.status === "PAID" || remaining <= 0;
  const isDisabled = isPaid || installment.isFutureLocked;
  const statusClass = getInstallmentStatusClass(installment.status, installment.monthState);

  return (
    <button
      type="button"
      disabled={isDisabled}
      onClick={() => onToggle(installmentKey)}
      className={`flexm min-h-[5.25rem] items-start justify-between gap-3 rounded-lg border p-3 text-left transition ${
        isSelected
          ? "border-blue-500 bg-blue-50 ring-2 ring-blue-100"
          : statusClass
      } disabled:cursor-not-allowed disabled:opacity-70`}
    >
      <div>
        <p className="text-sm font-bold text-gray-950">
          {installment.installmentLabel || installment.monthLabel}
        </p>
        <p className="mt-1 text-xs font-medium text-gray-500">
          Due: {installment.monthLabel}
        </p>
        <p className="mt-1 text-xs font-semibold text-gray-700">
          Balance {formatCurrency(remaining)}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1">
        <span
          className={`flex h-5 w-5 items-center justify-center rounded-full border ${
            isSelected || isPaid
              ? "border-green-600 bg-green-100 text-green-700"
              : "border-gray-300 bg-white text-transparent"
          }`}
        >
          <Check className="h-3.5 w-3.5" />
        </span>
        <InstallmentStatusBadge status={installment.status} monthState={installment.monthState} />
      </div>
    </button>
  );
};

export default ExamInstallmentCard;
