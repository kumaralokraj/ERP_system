import React from "react";
import ExamFeeScheduleList from "./ExamFeeScheduleList";

const ScheduledFeeSelector = ({
  installments,
  selectedInstallmentKeys,
  onToggleInstallment,
  formatCurrency,
}) => (
  <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-gray-600">
      <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-green-500" />Paid</span>
      <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-red-500" />Overdue</span>
      <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-amber-400" />Current due</span>
      <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-gray-300" />Upcoming</span>
    </div>
    <ExamFeeScheduleList
      installments={installments}
      selectedInstallmentKeys={selectedInstallmentKeys}
      onToggleInstallment={onToggleInstallment}
      formatCurrency={formatCurrency}
    />
  </div>
);

export default ScheduledFeeSelector;
