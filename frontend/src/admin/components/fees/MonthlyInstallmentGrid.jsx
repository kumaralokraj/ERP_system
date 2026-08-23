import React from "react";
import { Check } from "lucide-react";
import FeeStatusBadge from "./FeeStatusBadge";
import { getInstallmentStatusClass } from "../../../utils/installmentStatus";

const MonthlyInstallmentGrid = ({
  installments = [],
  selectedMonthKeys = [],
  onToggleMonth,
  formatCurrency,
}) => {
  const selectedKeys = new Set(selectedMonthKeys);

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {installments.map((installment) => {
        const isSelected = selectedKeys.has(installment.monthKey);
        const remaining = Math.max(
          Number(installment.amount || 0) - Number(installment.paidAmount || 0),
          0
        );
        const isPaid = installment.status === "PAID" || remaining <= 0;
        const isDisabled = isPaid || installment.isFutureLocked;
        const statusClass = getInstallmentStatusClass(installment.status, installment.monthState);

        return (
          <button
            key={installment.monthKey}
            type="button"
            disabled={isDisabled}
            onClick={() => onToggleMonth(installment.monthKey)}
            className={`flex min-h-[4.5rem] items-start justify-between gap-2 rounded-lg border p-3 text-left transition ${
              isSelected
                ? "border-blue-500 bg-blue-50 ring-2 ring-blue-100"
                : statusClass
            } disabled:cursor-not-allowed disabled:opacity-70`}
          >
            <div>
              <p className="text-sm font-bold text-gray-950">{installment.monthLabel}</p>
              <p className="mt-1 text-xs font-medium text-gray-500">
                Due {formatCurrency(remaining)}
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
              <FeeStatusBadge status={installment.status} monthState={installment.monthState} />
            </div>
          </button>
        );
      })}
    </div>
  );
};

export default MonthlyInstallmentGrid;
