import React from "react";
import ExamInstallmentCard from "./ExamInstallmentCard";

const ExamFeeScheduleList = ({
  installments = [],
  selectedInstallmentKeys = [],
  onToggleInstallment,
  formatCurrency,
}) => {
  const selectedKeys = new Set(selectedInstallmentKeys);

  return (
    <div className="grid grid-cols-1 gap-2">
      {installments.map((installment) => {
        const installmentKey = installment.installmentKey || installment.monthKey;

        return (
          <ExamInstallmentCard
            key={installmentKey}
            installment={installment}
            isSelected={selectedKeys.has(installmentKey)}
            onToggle={onToggleInstallment}
            formatCurrency={formatCurrency}
          />
        );
      })}
    </div>
  );
};

export default ExamFeeScheduleList;
