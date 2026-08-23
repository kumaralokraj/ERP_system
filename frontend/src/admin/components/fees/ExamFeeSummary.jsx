import React from "react";
import PaymentCalculationCard from "./PaymentCalculationCard";

const ExamFeeSummary = ({
  selectedCount,
  totalDue,
  payingNow,
  remaining,
  formatCurrency,
}) => (
  <PaymentCalculationCard
    selectedLabel="Selected Terms"
    selectedHelper="Exam terms being collected"
    selectedCount={selectedCount}
    totalDue={totalDue}
    payingNow={payingNow}
    remaining={remaining}
    formatCurrency={formatCurrency}
  />
);

export default ExamFeeSummary;
