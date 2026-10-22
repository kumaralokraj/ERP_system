import React from "react";
import MonthlyInstallmentGrid from "./MonthlyInstallmentGrid";

const FeeMonthSelector = ({
  installments,
  selectedMonthKeys,
  onToggleMonth,
  formatCurrency,
}) => (
  <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-gray-600">
      <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-green-500" />Paid</span>
      <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-red-500" />Overdue</span>
      <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-amber-400" />Current</span>
      <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-gray-300" />Upcoming</span>
    </div>
    <MonthlyInstallmentGrid
      installments={installments}
      selectedMonthKeys={selectedMonthKeys}
      onToggleMonth={onToggleMonth}
      formatCurrency={formatCurrency}
    />
  </div>
);

export default FeeMonthSelector;
